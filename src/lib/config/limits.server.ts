import "server-only";

function positiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function executionLimits() {
  return {
    maxPromptsPerEvaluation: positiveIntEnv("MAX_PROMPTS_PER_EVALUATION", 25),
    maxProvidersPerEvaluation: positiveIntEnv("MAX_PROVIDERS_PER_EVALUATION", 4),
    maxRepetitionsPerProvider: positiveIntEnv("MAX_REPETITIONS_PER_PROVIDER", 5),
    maxAttemptsPerItem: positiveIntEnv("MAX_ATTEMPTS_PER_ITEM", 3)
  };
}
