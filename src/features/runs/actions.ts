"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getProviderAdapter } from "@/lib/ai/providers/registry.server";
import { processProviderRunBatch } from "@/lib/ai/runner/responses-runner.server";
import { executionLimits } from "@/lib/config/limits.server";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & {
  from: (table: string) => any;
};

function client(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function selectedProviders(formData: FormData) {
  const selections = formData
    .getAll("providers")
    .map(String)
    .map((provider) => {
      const model = optionalString(formData, `${provider}_model`);
      return model ? { provider, model } : null;
    })
    .filter(Boolean) as Array<{ provider: string; model: string }>;

  if (!selections.length) throw new Error("Select at least one provider and model");
  return selections;
}

function searchContextSize(value: string | undefined): "low" | "medium" | "high" {
  return value === "low" || value === "high" ? value : "medium";
}

export async function createTestRun(formData: FormData) {
  const supabase = client();
  const limits = executionLimits();
  const projectId = requiredString(formData, "project_id");
  const promptSetId = requiredString(formData, "prompt_set_id");
  const repetitions = parsePositiveInt(formData.get("repetitions"), 1);
  const providerSelections = selectedProviders(formData);

  if (providerSelections.length > limits.maxProvidersPerEvaluation) {
    throw new Error(`Select at most ${limits.maxProvidersPerEvaluation} providers`);
  }
  if (repetitions > limits.maxRepetitionsPerProvider) {
    throw new Error(`Use at most ${limits.maxRepetitionsPerProvider} repetitions per provider`);
  }

  const { data: prompts, error: promptsError } = await supabase
    .from("prompts")
    .select("id")
    .eq("project_id", projectId)
    .eq("prompt_set_id", promptSetId)
    .eq("active", true);

  if (promptsError) throw promptsError;

  const promptIds = (prompts ?? []).map((prompt: { id: string }) => prompt.id);
  if (!promptIds.length) throw new Error("Prompt set has no active prompts");
  if (promptIds.length > limits.maxPromptsPerEvaluation) {
    throw new Error(`Use at most ${limits.maxPromptsPerEvaluation} prompts per evaluation`);
  }

  const systemInstruction = requiredString(formData, "system_instruction");
  const generationConfig = { temperature: Number(formData.get("temperature") ?? 0.2) };
  const webSearchConfig = {
    enabled: formData.get("web_search_enabled") === "on",
    searchContextSize: searchContextSize(optionalString(formData, "search_context_size"))
  };

  const { data: evaluationRun, error: evaluationError } = await supabase
    .from("evaluation_runs")
    .insert({
      project_id: projectId,
      prompt_set_id: promptSetId,
      evaluation_name: requiredString(formData, "run_name"),
      repetitions,
      system_instruction: systemInstruction,
      generation_config: generationConfig,
      web_search_config: webSearchConfig,
      status: "pending"
    })
    .select("*")
    .single();

  if (evaluationError) throw evaluationError;

  const { data: versions, error: versionsError } = await supabase
    .from("prompt_versions")
    .select("*")
    .eq("project_id", projectId)
    .in("prompt_id", promptIds)
    .order("version_number", { ascending: false });

  if (versionsError) throw versionsError;

  const latestByPrompt = new Map<string, any>();
  for (const version of versions ?? []) {
    if (!latestByPrompt.has(version.prompt_id)) latestByPrompt.set(version.prompt_id, version);
  }

  for (const selection of providerSelections) {
    const adapter = getProviderAdapter(selection.provider);
    const validation = await adapter.validateConfig({
      provider: adapter.id,
      model: selection.model,
      systemInstruction,
      generationConfig,
      webSearchConfig
    });
    const unsupported = !validation.ok;

    const { data: providerRun, error: providerRunError } = await supabase
      .from("provider_test_runs")
      .insert({
        evaluation_run_id: evaluationRun.id,
        project_id: projectId,
        prompt_set_id: promptSetId,
        generation_provider: adapter.id,
        generation_model: selection.model,
        provider_sdk_name: adapter.sdkName,
        provider_sdk_version: adapter.sdkVersion,
        capability_snapshot: adapter.capabilities,
        pricing_snapshot: adapter.pricing,
        pricing_effective_date: adapter.pricing.effective_date,
        estimated_cost_currency: adapter.pricing.currency,
        provider_run_config: {
          system_instruction: systemInstruction,
          generation_config: generationConfig,
          web_search_config: webSearchConfig,
          provider: adapter.id,
          model: selection.model
        },
        runner_version: "phase1-1-runner-v1",
        status: unsupported ? "unsupported" : "pending",
        unsupported_reason: validation.reason
      })
      .select("*")
      .single();

    if (providerRunError) throw providerRunError;
    if (unsupported) continue;

    const items = Array.from(latestByPrompt.values()).flatMap((version) =>
      Array.from({ length: repetitions }, (_, index) => ({
        project_id: projectId,
        provider_test_run_id: providerRun.id,
        test_run_id: null,
        prompt_version_id: version.id,
        repetition_index: index + 1,
        status: "pending"
      }))
    );

    const { error: itemsError } = await supabase.from("test_run_items").insert(items);
    if (itemsError) throw itemsError;
  }

  revalidatePath("/");
}

export async function processRun(formData: FormData) {
  await processProviderRunBatch({
    providerTestRunId: requiredString(formData, "provider_test_run_id"),
    batchSize: parsePositiveInt(formData.get("batch_size"), 3)
  });
  revalidatePath("/");
}
