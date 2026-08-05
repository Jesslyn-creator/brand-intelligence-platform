import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { requiredServerEnv } from "@/lib/env.server";
import { responseClassificationSchema, type ResponseClassification } from "@/lib/ai/analysis/schema";
import { installedPackageVersion } from "@/lib/ai/providers/versions.server";
import type {
  GenerationProviderAdapter,
  NormalizedCitation,
  ProviderExecutionInput,
  ProviderRunConfig
} from "@/lib/ai/providers/types";
import { citationFromUrl, errorToMessage } from "@/lib/ai/providers/utils";

function client() {
  return new OpenAI({
    apiKey: requiredServerEnv("OPENAI_API_KEY"),
    maxRetries: 2,
    timeout: 60_000
  });
}

function outputText(response: any): string {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .map((content: any) => content.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function extractOpenAICitations(response: any): NormalizedCitation[] {
  const citations = new Map<string, NormalizedCitation>();
  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources ?? []) {
        if (source.url) citations.set(source.url, citationFromUrl(source.url, source, { source: "web_search_call" }));
      }
    }
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          citations.set(annotation.url, {
            ...citationFromUrl(annotation.url, annotation, { source: "url_citation" }),
            title: annotation.title,
            start_index: annotation.start_index,
            end_index: annotation.end_index
          });
        }
      }
    }
  }
  return Array.from(citations.values());
}

function requestFor(input: ProviderExecutionInput) {
  const config = input.runConfig;
  const tools = config.webSearchConfig.enabled
    ? [
        {
          type: "web_search" as const,
          search_context_size: config.webSearchConfig.searchContextSize ?? "medium",
          user_location: config.webSearchConfig.userLocation
        }
      ]
    : undefined;

  return {
    model: config.model,
    instructions: config.systemInstruction,
    input: input.promptText,
    tools,
    temperature: config.generationConfig.temperature ?? 0.2
  };
}

export const openAIProviderAdapter: GenerationProviderAdapter = {
  id: "openai",
  sdkName: "openai",
  sdkVersion: installedPackageVersion("openai"),
  capabilities: {
    supports_web_grounding: true,
    supports_citations: true,
    supports_structured_output: true,
    supports_reasoning: true
  },
  pricing: {
    estimate_available: false,
    currency: "USD",
    notes: "Pricing snapshot is intentionally unavailable until model-specific prices are maintained."
  },
  async validateConfig(config: ProviderRunConfig) {
    if (!config.model.trim()) return { ok: false, reason: "OpenAI model is required" };
    return { ok: true };
  },
  async execute(input: ProviderExecutionInput) {
    const request = requestFor(input);
    const response = await client().responses.create(request as any);
    const citations = extractOpenAICitations(response);
    return {
      provider: "openai",
      model: input.runConfig.model,
      provider_response_id: response.id,
      native_request_payload: request,
      native_raw_response: response,
      normalized_answer_text: outputText(response),
      native_usage: response.usage ?? {},
      normalized_usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        total_tokens: response.usage?.total_tokens,
        reasoning_tokens: response.usage?.output_tokens_details?.reasoning_tokens,
        native_units: {
          input_tokens_details: response.usage?.input_tokens_details,
          output_tokens_details: response.usage?.output_tokens_details
        }
      },
      finish_reason: (response as any).status,
      tool_call_metadata: { output_types: (response.output ?? []).map((item: any) => item.type) },
      search_metadata: { citation_count: citations.length },
      web_grounding_status: input.runConfig.webSearchConfig.enabled ? (citations.length ? "grounded" : "ungrounded") : "not_requested",
      citations
    };
  },
  normalizeError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : undefined;
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : undefined;
    return {
      code: status === 429 ? "rate_limited" : code ?? "openai_error",
      message: errorToMessage(error),
      retryable: status === 429 || (status !== undefined && status >= 500),
      status,
      native_error: error
    };
  },
  async classifyStructured(input) {
    const response = await client().responses.parse({
      model: input.model,
      instructions: input.instruction,
      input: JSON.stringify(input.payload),
      text: {
        format: zodResponseFormat(responseClassificationSchema, "brand_visibility_classification")
      } as any
    });
    const parsed = response.output_parsed;
    if (!parsed) throw new Error("Structured classifier returned no parsed output");
    return parsed as ResponseClassification;
  }
};
