import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { classifyAnswer } from "@/lib/ai/analysis/classifier.server";
import { getProviderAdapter } from "@/lib/ai/providers/registry.server";
import { executionLimits } from "@/lib/config/limits.server";
import type { NormalizedGenerationResult, ProviderRunConfig } from "@/lib/ai/providers/types";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

type ClaimedItem = {
  id: string;
  project_id: string;
  provider_test_run_id: string;
  test_run_id?: string;
  prompt_version_id: string;
  repetition_index: number;
  claim_token: string;
  attempt_number: number;
};

function serviceClient(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

async function fetchRunContext(supabase: SupabaseAny, item: ClaimedItem) {
  const [runResult, promptVersionResult, targetResult, competitorsResult] = await Promise.all([
    supabase.from("provider_test_runs").select("*, evaluation_runs(*)").eq("id", item.provider_test_run_id).eq("project_id", item.project_id).single(),
    supabase.from("prompt_versions").select("*, prompts(*)").eq("id", item.prompt_version_id).eq("project_id", item.project_id).single(),
    supabase.from("project_brands").select("brands(*, brand_domains(*))").eq("project_id", item.project_id).eq("brand_role", "target").eq("active", true).single(),
    supabase.from("project_brands").select("brands(*)").eq("project_id", item.project_id).eq("brand_role", "competitor").eq("active", true)
  ]);

  for (const result of [runResult, promptVersionResult, targetResult, competitorsResult]) {
    if (result.error) throw result.error;
  }
  if (!targetResult.data?.brands) throw new Error("Evaluation requires an active target brand");

  return {
    providerRun: runResult.data,
    evaluationRun: runResult.data.evaluation_runs,
    promptVersion: promptVersionResult.data,
    targetBrand: targetResult.data.brands,
    competitorBrands: (competitorsResult.data ?? []).map((link: any) => link.brands)
  };
}

function buildRunConfig(context: Awaited<ReturnType<typeof fetchRunContext>>): ProviderRunConfig {
  const providerRun = context.providerRun;
  const evaluation = context.evaluationRun;
  return {
    provider: providerRun.generation_provider,
    model: providerRun.generation_model,
    systemInstruction: evaluation.system_instruction,
    generationConfig: evaluation.generation_config ?? {},
    webSearchConfig: {
      enabled: evaluation.web_search_config?.enabled === true,
      searchContextSize: evaluation.web_search_config?.searchContextSize,
      userLocation: evaluation.web_search_config?.userLocation,
      allowedDomains: evaluation.web_search_config?.allowedDomains,
      blockedDomains: evaluation.web_search_config?.blockedDomains
    }
  };
}

async function recordCitations(supabase: SupabaseAny, projectId: string, responseId: string, result: NormalizedGenerationResult, targetBrand: any) {
  const officialDomains = new Set((targetBrand.brand_domains ?? []).map((domain: any) => domain.normalized_domain));
  if (!result.citations.length) return [];

  const rows = result.citations.map((citation) => ({
    project_id: projectId,
    response_id: responseId,
    url: citation.url,
    normalized_url: citation.normalized_url,
    domain: citation.domain,
    normalized_domain: citation.normalized_domain,
    matched_brand_id: officialDomains.has(citation.normalized_domain) ? targetBrand.id : null,
    is_official_domain: officialDomains.has(citation.normalized_domain),
    metadata: citation.provider_metadata,
    native_citation: citation.native_citation,
    title: citation.title,
    cited_text: citation.cited_text,
    start_index: citation.start_index,
    end_index: citation.end_index,
    provider_metadata: citation.provider_metadata
  }));

  const { error } = await supabase.from("citations").insert(rows);
  if (error) throw error;
  return rows;
}

async function analyzeStoredResponse(supabase: SupabaseAny, responseId: string, projectId: string, result: NormalizedGenerationResult, targetBrand: any, competitorBrands: any[], citations: any[]) {
  const { config, classification } = await classifyAnswer({
    targetBrand,
    competitorBrands,
    answerText: result.normalized_answer_text,
    citationDomains: citations.map((citation) => citation.normalized_domain)
  });

  const { error } = await supabase.rpc("record_completed_analysis", {
    target_project_id: projectId,
    target_response_id: responseId,
    target_analysis_provider: config.provider,
    target_analysis_model: config.model,
    target_analysis_prompt_version: config.analysisPromptVersion,
    target_analysis_schema_version: config.analysisSchemaVersion,
    target_analysis_version: Date.now(),
    target_brand_mentioned: classification.target_brand_mentioned,
    target_brand_recommended: classification.target_brand_recommended,
    target_brand_rank: classification.target_brand_rank,
    target_recommendation_strength: classification.recommendation_strength,
    target_official_domain_cited: classification.official_domain_cited,
    target_confidence_score: classification.confidence_score,
    target_classification: classification
  });

  if (error) throw error;
}

export async function processProviderRunBatch({ providerTestRunId, batchSize }: { providerTestRunId: string; batchSize: number }) {
  const supabase = serviceClient();
  const workerId = `worker-${crypto.randomUUID()}`;
  const limits = executionLimits();

  const { data: claimedItems, error: claimError } = await supabase.rpc("claim_provider_test_run_items", {
    target_provider_test_run_id: providerTestRunId,
    batch_size: batchSize,
    worker_id: workerId,
    max_attempts: limits.maxAttemptsPerItem
  });

  if (claimError) throw claimError;

  for (const item of (claimedItems ?? []) as ClaimedItem[]) {
    const start = performance.now();
    const context = await fetchRunContext(supabase, item);
    const runConfig = buildRunConfig(context);
    const adapter = getProviderAdapter(runConfig.provider);

    try {
      const validation = await adapter.validateConfig(runConfig);
      if (!validation.ok) throw new Error(validation.reason ?? "Provider configuration is invalid");

      const result = await adapter.execute({
        promptText: context.promptVersion.prompt_text,
        runConfig
      });

      const { data: storedResponse, error: responseError } = await supabase
        .from("responses")
        .insert({
          project_id: item.project_id,
          provider_test_run_id: item.provider_test_run_id,
          test_run_id: item.test_run_id ?? null,
          test_run_item_id: item.id,
          attempt_number: item.attempt_number,
          generation_provider: result.provider,
          generation_model: result.model,
          provider_response_id: result.provider_response_id,
          openai_response_id: null,
          status: "completed",
          request_payload: result.native_request_payload,
          native_request_payload: result.native_request_payload,
          raw_response: result.native_raw_response,
          native_raw_response: result.native_raw_response,
          answer_text: result.normalized_answer_text,
          normalized_answer_text: result.normalized_answer_text,
          usage: result.normalized_usage,
          native_usage: result.native_usage,
          normalized_usage: result.normalized_usage,
          latency_ms: Math.round(performance.now() - start),
          finish_reason: result.finish_reason,
          tool_call_metadata: result.tool_call_metadata,
          search_metadata: result.search_metadata,
          web_grounding_status: result.web_grounding_status
        })
        .select("id")
        .single();

      if (responseError) throw responseError;
      if (!storedResponse?.id) throw new Error("Response attempt was not stored");

      const citations = await recordCitations(supabase, item.project_id, storedResponse.id, result, context.targetBrand);
      await analyzeStoredResponse(supabase, storedResponse.id, item.project_id, result, context.targetBrand, context.competitorBrands, citations);

      const { error: completeError } = await supabase.rpc("complete_test_run_item", {
        target_item_id: item.id,
        target_claim_token: item.claim_token,
        target_response_id: storedResponse.id
      });
      if (completeError) throw completeError;
    } catch (error) {
      const normalizedError = adapter.normalizeError(error);
      await supabase.from("responses").insert({
        project_id: item.project_id,
        provider_test_run_id: item.provider_test_run_id,
        test_run_id: item.test_run_id ?? null,
        test_run_item_id: item.id,
        attempt_number: item.attempt_number,
        generation_provider: runConfig.provider,
        generation_model: runConfig.model,
        status: "failed",
        request_payload: {},
        native_request_payload: {},
        usage: {},
        native_usage: {},
        normalized_usage: {},
        latency_ms: Math.round(performance.now() - start),
        error_code: normalizedError.code,
        error_message: normalizedError.message,
        provider_error: normalizedError
      });
      await supabase.rpc("fail_test_run_item", {
        target_item_id: item.id,
        target_claim_token: item.claim_token,
        error_message: normalizedError.message
      });
    }
  }
}
