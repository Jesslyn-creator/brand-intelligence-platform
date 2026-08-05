import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const providerDir = join(process.cwd(), "src", "lib", "ai", "providers");
const requiredProviders = ["openai", "gemini", "anthropic", "perplexity", "mock"];
const requiredFragments = [
  "validateConfig",
  "execute",
  "normalizeError",
  "capabilities",
  "pricing"
];

const files = new Set(readdirSync(providerDir));
const missingFiles = requiredProviders.filter((provider) => !files.has(`${provider}.ts`));
if (missingFiles.length) {
  throw new Error(`Missing provider adapter files: ${missingFiles.join(", ")}`);
}

for (const provider of requiredProviders) {
  const text = readFileSync(join(providerDir, `${provider}.ts`), "utf8");
  const missing = requiredFragments.filter((fragment) => !text.includes(fragment));
  if (missing.length) {
    throw new Error(`${provider} adapter missing required fragments: ${missing.join(", ")}`);
  }
}

const credentialExpectations = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  perplexity: "PERPLEXITY_API_KEY"
};

for (const [provider, envName] of Object.entries(credentialExpectations)) {
  const text = readFileSync(join(providerDir, `${provider}.ts`), "utf8");
  if (!text.includes(`requiredServerEnv("${envName}")`)) {
    throw new Error(`${provider} adapter must enforce missing ${envName}`);
  }
}

const registry = readFileSync(join(providerDir, "registry.server.ts"), "utf8");
for (const provider of requiredProviders) {
  if (!registry.includes(`providers/${provider}`) && provider !== "mock") {
    throw new Error(`Registry does not include ${provider}`);
  }
}

const runner = readFileSync(join(process.cwd(), "src", "lib", "ai", "runner", "responses-runner.server.ts"), "utf8");
if (!runner.includes("getProviderAdapter")) {
  throw new Error("Runner must use provider registry");
}

console.log("Provider contract checks passed.");
