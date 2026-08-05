import "server-only";
import { requiredServerEnv } from "@/lib/env.server";
import {
  analysisPromptVersion,
  analysisSchemaVersion,
  buildAnalysisInstruction
} from "@/lib/ai/analysis/schema";
import { getProviderAdapter } from "@/lib/ai/providers/registry.server";

export function classifierConfig() {
  return {
    provider: requiredServerEnv("DEFAULT_CLASSIFIER_PROVIDER"),
    model: requiredServerEnv("DEFAULT_CLASSIFIER_MODEL"),
    analysisPromptVersion,
    analysisSchemaVersion
  };
}

export async function classifyAnswer({
  targetBrand,
  competitorBrands,
  answerText,
  citationDomains
}: {
  targetBrand: any;
  competitorBrands: any[];
  answerText: string;
  citationDomains: string[];
}) {
  const config = classifierConfig();
  const adapter = getProviderAdapter(config.provider);
  if (!adapter.classifyStructured) {
    throw new Error(`Classifier provider ${config.provider} does not support structured analysis`);
  }

  const classification = await adapter.classifyStructured({
    model: config.model,
    instruction: buildAnalysisInstruction(
      targetBrand.brand_name,
      competitorBrands.map((brand) => brand.brand_name)
    ),
    payload: {
      answer_text: answerText,
      citation_domains: citationDomains
    }
  });

  return {
    config,
    classification
  };
}
