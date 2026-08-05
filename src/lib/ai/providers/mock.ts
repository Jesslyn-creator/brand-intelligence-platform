import type { GenerationProviderAdapter, ProviderExecutionInput } from "@/lib/ai/providers/types";
import { citationFromUrl, errorToMessage } from "@/lib/ai/providers/utils";
import { responseClassificationSchema } from "@/lib/ai/analysis/schema";

export const mockProviderAdapter: GenerationProviderAdapter = {
  id: "mock",
  sdkName: "mock-provider",
  sdkVersion: "test",
  capabilities: {
    supports_web_grounding: true,
    supports_citations: true,
    supports_structured_output: true,
    supports_reasoning: false
  },
  pricing: {
    estimate_available: true,
    currency: "USD",
    effective_date: "2026-08-04",
    input_per_million: 0,
    output_per_million: 0,
    notes: "Test adapter only."
  },
  async validateConfig() {
    return { ok: true };
  },
  async execute(input: ProviderExecutionInput) {
    const native = {
      id: `mock-${crypto.randomUUID()}`,
      answer: `Mock answer for: ${input.promptText}`,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      citations: input.runConfig.webSearchConfig.enabled ? ["https://example.com/source"] : []
    };
    const citations = native.citations.map((url) => citationFromUrl(url, { url }));
    return {
      provider: "mock",
      model: input.runConfig.model,
      provider_response_id: native.id,
      native_request_payload: input,
      native_raw_response: native,
      normalized_answer_text: native.answer,
      native_usage: native.usage,
      normalized_usage: native.usage,
      finish_reason: "stop",
      tool_call_metadata: {},
      search_metadata: { query_count: native.citations.length ? 1 : 0 },
      web_grounding_status: native.citations.length ? "grounded" : "not_requested",
      citations
    };
  },
  normalizeError(error: unknown) {
    return {
      code: "mock_error",
      message: errorToMessage(error),
      retryable: false,
      native_error: error
    };
  },
  async classifyStructured() {
    return responseClassificationSchema.parse({
      target_brand_mentioned: false,
      target_brand_recommended: false,
      target_brand_rank: null,
      recommendation_strength: 0,
      official_domain_cited: false,
      confidence_score: 0.8,
      reasoning_summary: "Mock classifier output.",
      competitor_mentions: []
    });
  }
};
