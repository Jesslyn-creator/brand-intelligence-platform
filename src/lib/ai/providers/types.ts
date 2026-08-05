import type { ResponseClassification } from "@/lib/ai/analysis/schema";

export type ProviderId = "openai" | "gemini" | "anthropic" | "perplexity" | "mock";

export type ProviderCapabilities = {
  supports_web_grounding: boolean;
  supports_citations: boolean;
  supports_structured_output: boolean;
  supports_reasoning: boolean;
};

export type PricingSnapshot = {
  estimate_available: boolean;
  currency: string;
  effective_date?: string;
  input_per_million?: number;
  output_per_million?: number;
  notes?: string;
};

export type ProviderRunConfig = {
  provider: ProviderId;
  model: string;
  systemInstruction: string;
  generationConfig: Record<string, unknown>;
  webSearchConfig: {
    enabled: boolean;
    searchContextSize?: "low" | "medium" | "high";
    userLocation?: Record<string, unknown>;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
};

export type ProviderExecutionInput = {
  promptText: string;
  runConfig: ProviderRunConfig;
};

export type NormalizedCitation = {
  url: string;
  normalized_url: string;
  domain: string;
  normalized_domain: string;
  title?: string;
  cited_text?: string;
  start_index?: number;
  end_index?: number;
  native_citation: unknown;
  provider_metadata: Record<string, unknown>;
};

export type NormalizedUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  search_queries?: number;
  native_units?: Record<string, unknown>;
};

export type NormalizedProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  native_error?: unknown;
};

export type NormalizedGenerationResult = {
  provider: ProviderId;
  model: string;
  provider_response_id?: string;
  native_request_payload: unknown;
  native_raw_response: unknown;
  normalized_answer_text: string;
  native_usage: unknown;
  normalized_usage: NormalizedUsage;
  finish_reason?: string;
  tool_call_metadata: Record<string, unknown>;
  search_metadata: Record<string, unknown>;
  web_grounding_status: "not_requested" | "grounded" | "ungrounded" | "unsupported" | "failed";
  citations: NormalizedCitation[];
};

export type ValidationResult = {
  ok: boolean;
  reason?: string;
};

export type StructuredAnalysisInput = {
  model: string;
  instruction: string;
  payload: Record<string, unknown>;
};

export type GenerationProviderAdapter = {
  id: ProviderId;
  sdkName: string;
  sdkVersion: string | null;
  capabilities: ProviderCapabilities;
  pricing: PricingSnapshot;
  validateConfig(config: ProviderRunConfig): Promise<ValidationResult>;
  execute(input: ProviderExecutionInput): Promise<NormalizedGenerationResult>;
  normalizeError(error: unknown): NormalizedProviderError;
  classifyStructured?(input: StructuredAnalysisInput): Promise<ResponseClassification>;
};
