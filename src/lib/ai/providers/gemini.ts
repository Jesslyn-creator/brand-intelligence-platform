import { GoogleGenAI } from "@google/genai";
import { requiredServerEnv } from "@/lib/env.server";
import { installedPackageVersion } from "@/lib/ai/providers/versions.server";
import type { GenerationProviderAdapter, ProviderExecutionInput, ProviderRunConfig } from "@/lib/ai/providers/types";
import { citationFromUrl, errorToMessage } from "@/lib/ai/providers/utils";

function client() {
  return new GoogleGenAI({
    apiKey: requiredServerEnv("GEMINI_API_KEY")
  });
}

function requestFor(input: ProviderExecutionInput) {
  const grounding = input.runConfig.webSearchConfig.enabled ? [{ googleSearch: {} }] : undefined;
  return {
    model: input.runConfig.model,
    contents: input.promptText,
    config: {
      systemInstruction: input.runConfig.systemInstruction,
      tools: grounding,
      ...input.runConfig.generationConfig
    }
  };
}

export const geminiProviderAdapter: GenerationProviderAdapter = {
  id: "gemini",
  sdkName: "@google/genai",
  sdkVersion: installedPackageVersion("@google/genai"),
  capabilities: {
    supports_web_grounding: true,
    supports_citations: true,
    supports_structured_output: true,
    supports_reasoning: true
  },
  pricing: {
    estimate_available: false,
    currency: "USD",
    notes: "Estimate unavailable until project-maintained Gemini pricing snapshots are added."
  },
  async validateConfig(config: ProviderRunConfig) {
    if (!config.model.trim()) return { ok: false, reason: "Gemini model is required" };
    return { ok: true };
  },
  async execute(input: ProviderExecutionInput) {
    const request = requestFor(input);
    const native: any = await client().models.generateContent(request as any);
    const text = native.text ?? native.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "";
    const metadata = native.candidates?.[0]?.groundingMetadata ?? native.candidates?.[0]?.grounding_metadata;
    const chunks = metadata?.groundingChunks ?? metadata?.grounding_chunks ?? [];
    const supports = metadata?.groundingSupports ?? metadata?.grounding_supports ?? [];
    const citations = chunks
      .map((chunk: any, index: number) => {
        const url = chunk.web?.uri ?? chunk.retrievedContext?.uri ?? chunk.uri;
        if (!url) return null;
        return {
          ...citationFromUrl(url, chunk, { grounding_chunk_index: index, grounding_supports: supports }),
          title: chunk.web?.title ?? chunk.title
        };
      })
      .filter(Boolean);
    return {
      provider: "gemini",
      model: input.runConfig.model,
      provider_response_id: native.responseId,
      native_request_payload: request,
      native_raw_response: native,
      normalized_answer_text: text,
      native_usage: native.usageMetadata ?? {},
      normalized_usage: {
        input_tokens: native.usageMetadata?.promptTokenCount,
        output_tokens: native.usageMetadata?.candidatesTokenCount,
        total_tokens: native.usageMetadata?.totalTokenCount
      },
      finish_reason: native.candidates?.[0]?.finishReason,
      tool_call_metadata: {},
      search_metadata: {
        web_search_queries: metadata?.webSearchQueries ?? [],
        search_entry_point: metadata?.searchEntryPoint ?? null
      },
      web_grounding_status: input.runConfig.webSearchConfig.enabled ? (citations.length ? "grounded" : "ungrounded") : "not_requested",
      citations
    };
  },
  normalizeError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : undefined;
    return {
      code: status === 429 ? "rate_limited" : "gemini_error",
      message: errorToMessage(error),
      retryable: /rate|quota|timeout|temporar|unavailable/i.test(errorToMessage(error)),
      status,
      native_error: error
    };
  }
};
