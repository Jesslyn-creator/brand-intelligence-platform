import Anthropic from "@anthropic-ai/sdk";
import { requiredServerEnv } from "@/lib/env.server";
import { installedPackageVersion } from "@/lib/ai/providers/versions.server";
import type { GenerationProviderAdapter, ProviderExecutionInput, ProviderRunConfig } from "@/lib/ai/providers/types";
import { citationFromUrl, errorToMessage } from "@/lib/ai/providers/utils";

function client() {
  return new Anthropic({
    apiKey: requiredServerEnv("ANTHROPIC_API_KEY"),
    maxRetries: 2,
    timeout: 60_000
  });
}

function requestFor(input: ProviderExecutionInput) {
  const tools = input.runConfig.webSearchConfig.enabled
    ? [{
        type: "web_search_20260209",
        name: "web_search",
        max_uses: input.runConfig.webSearchConfig.searchContextSize === "high" ? 10 : 5,
        allowed_domains: input.runConfig.webSearchConfig.allowedDomains,
        blocked_domains: input.runConfig.webSearchConfig.blockedDomains
      }]
    : undefined;
  return {
    model: input.runConfig.model,
    max_tokens: Number(input.runConfig.generationConfig.max_tokens ?? 1024),
    system: input.runConfig.systemInstruction,
    messages: [{ role: "user" as const, content: input.promptText }],
    tools
  };
}

export const anthropicProviderAdapter: GenerationProviderAdapter = {
  id: "anthropic",
  sdkName: "@anthropic-ai/sdk",
  sdkVersion: installedPackageVersion("@anthropic-ai/sdk"),
  capabilities: {
    supports_web_grounding: true,
    supports_citations: true,
    supports_structured_output: false,
    supports_reasoning: true
  },
  pricing: {
    estimate_available: false,
    currency: "USD",
    notes: "Estimate unavailable until project-maintained Claude pricing snapshots are added."
  },
  async validateConfig(config: ProviderRunConfig) {
    if (!config.model.trim()) return { ok: false, reason: "Anthropic model is required" };
    return { ok: true };
  },
  async execute(input: ProviderExecutionInput) {
    const request = requestFor(input);
    const response: any = await client().messages.create(request as any);
    const content = response.content ?? [];
    const text = content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
    const citations = content.flatMap((block: any) =>
      (block.citations ?? []).map((citation: any) => ({
        ...citationFromUrl(citation.url, citation, { source: "web_search_result_location", encrypted_index: citation.encrypted_index }),
        title: citation.title,
        cited_text: citation.cited_text
      }))
    );
    const searchResults = content.filter((block: any) => block.type === "web_search_tool_result");
    const searchErrors = searchResults.flatMap((block: any) =>
      (block.content ?? []).filter((result: any) => result.type === "web_search_tool_result_error")
    );
    return {
      provider: "anthropic",
      model: input.runConfig.model,
      provider_response_id: response.id,
      native_request_payload: request,
      native_raw_response: response,
      normalized_answer_text: text,
      native_usage: response.usage ?? {},
      normalized_usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens,
        total_tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
        search_queries: response.usage?.server_tool_use?.web_search_requests
      },
      finish_reason: response.stop_reason ?? undefined,
      tool_call_metadata: { content_types: content.map((block: any) => block.type) },
      search_metadata: { search_result_blocks: searchResults.length, search_errors: searchErrors },
      web_grounding_status: input.runConfig.webSearchConfig.enabled ? (searchErrors.length ? "failed" : citations.length ? "grounded" : "ungrounded") : "not_requested",
      citations
    };
  },
  normalizeError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : undefined;
    return {
      code: status === 429 ? "rate_limited" : "anthropic_error",
      message: errorToMessage(error),
      retryable: status === 429 || (status !== undefined && status >= 500),
      status,
      native_error: error
    };
  }
};
