import OpenAI from "openai";
import { requiredServerEnv } from "@/lib/env.server";
import { installedPackageVersion } from "@/lib/ai/providers/versions.server";
import type { GenerationProviderAdapter, ProviderExecutionInput, ProviderRunConfig } from "@/lib/ai/providers/types";
import { citationFromUrl, errorToMessage } from "@/lib/ai/providers/utils";

function client() {
  return new OpenAI({
    apiKey: requiredServerEnv("PERPLEXITY_API_KEY"),
    baseURL: "https://api.perplexity.ai"
  });
}

function requestFor(input: ProviderExecutionInput) {
  return {
    model: input.runConfig.model,
    messages: [
      { role: "system" as const, content: input.runConfig.systemInstruction },
      { role: "user" as const, content: input.promptText }
    ],
    temperature: input.runConfig.generationConfig.temperature ?? 0.2
  };
}

export const perplexityProviderAdapter: GenerationProviderAdapter = {
  id: "perplexity",
  sdkName: "openai-compatible-sonar",
  sdkVersion: installedPackageVersion("openai"),
  capabilities: {
    supports_web_grounding: true,
    supports_citations: true,
    supports_structured_output: false,
    supports_reasoning: false
  },
  pricing: {
    estimate_available: false,
    currency: "USD",
    notes: "Sonar may return native cost fields; pre-run estimate unavailable until pricing snapshots are maintained."
  },
  async validateConfig(config: ProviderRunConfig) {
    if (!config.model.trim()) return { ok: false, reason: "Perplexity Sonar model is required" };
    if (!config.webSearchConfig.enabled) return { ok: false, reason: "Perplexity Sonar is intended for grounded runs in Phase 1.1" };
    return { ok: true };
  },
  async execute(input: ProviderExecutionInput) {
    const request = requestFor(input);
    const response: any = await client().chat.completions.create(request as any);
    const answer = response.choices?.[0]?.message?.content ?? "";
    const citationUrls = [...(response.citations ?? []), ...(response.search_results ?? []).map((result: any) => result.url)].filter(Boolean);
    const citations = Array.from(new Set(citationUrls)).map((url) => {
      const searchResult = (response.search_results ?? []).find((result: any) => result.url === url);
      return {
        ...citationFromUrl(String(url), searchResult ?? { url }, { source: searchResult ? "search_results" : "citations" }),
        title: searchResult?.title,
        cited_text: searchResult?.snippet
      };
    });
    return {
      provider: "perplexity",
      model: input.runConfig.model,
      provider_response_id: response.id,
      native_request_payload: request,
      native_raw_response: response,
      normalized_answer_text: answer,
      native_usage: response.usage ?? {},
      normalized_usage: {
        input_tokens: response.usage?.prompt_tokens,
        output_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
        reasoning_tokens: response.usage?.reasoning_tokens,
        search_queries: response.usage?.num_search_queries,
        native_units: { cost: response.usage?.cost }
      },
      finish_reason: response.choices?.[0]?.finish_reason,
      tool_call_metadata: {},
      search_metadata: {
        search_results: response.search_results ?? [],
        related_questions: response.related_questions ?? []
      },
      web_grounding_status: citations.length ? "grounded" : "ungrounded",
      citations
    };
  },
  normalizeError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : undefined;
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : undefined;
    return {
      code: status === 429 ? "rate_limited" : code ?? "perplexity_error",
      message: errorToMessage(error),
      retryable: status === 429 || (status !== undefined && status >= 500),
      status,
      native_error: error
    };
  }
};
