import "server-only";
import type { GenerationProviderAdapter, ProviderId } from "@/lib/ai/providers/types";
import { anthropicProviderAdapter } from "@/lib/ai/providers/anthropic";
import { geminiProviderAdapter } from "@/lib/ai/providers/gemini";
import { mockProviderAdapter } from "@/lib/ai/providers/mock";
import { openAIProviderAdapter } from "@/lib/ai/providers/openai";
import { perplexityProviderAdapter } from "@/lib/ai/providers/perplexity";

const adapters = new Map<ProviderId, GenerationProviderAdapter>([
  [openAIProviderAdapter.id, openAIProviderAdapter],
  [geminiProviderAdapter.id, geminiProviderAdapter],
  [anthropicProviderAdapter.id, anthropicProviderAdapter],
  [perplexityProviderAdapter.id, perplexityProviderAdapter],
  [mockProviderAdapter.id, mockProviderAdapter]
]);

export function getProviderAdapter(provider: string): GenerationProviderAdapter {
  const adapter = adapters.get(provider as ProviderId);
  if (!adapter) throw new Error(`Unsupported provider: ${provider}`);
  return adapter;
}

export function listProviderAdapters() {
  return Array.from(adapters.values()).filter((adapter) => adapter.id !== "mock");
}

export function providerOptionMetadata() {
  return listProviderAdapters().map((adapter) => ({
    id: adapter.id,
    capabilities: adapter.capabilities,
    pricing: adapter.pricing,
    sdkName: adapter.sdkName,
    sdkVersion: adapter.sdkVersion
  }));
}
