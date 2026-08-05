import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixtureDir = join(process.cwd(), "tests", "fixtures");

function readFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const openai = readFixture("openai-response.json");
const openaiAnnotations = openai.output.flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? []);
assert(openaiAnnotations.some((annotation) => annotation.type === "url_citation" && annotation.url), "OpenAI fixture must contain url_citation annotations");
assert(openai.usage.input_tokens && openai.usage.output_tokens && openai.usage.total_tokens, "OpenAI fixture must contain usage tokens");

const gemini = readFixture("gemini-response.json");
const grounding = gemini.candidates[0].groundingMetadata;
assert(grounding.webSearchQueries.length === 1, "Gemini fixture must contain search queries");
assert(grounding.groundingChunks[0].web.uri, "Gemini fixture must contain grounding chunk URL");
assert(grounding.groundingSupports[0].groundingChunkIndices.length === 1, "Gemini fixture must contain grounding supports");
assert(gemini.usageMetadata.totalTokenCount, "Gemini fixture must contain usage metadata");

const anthropic = readFixture("anthropic-response.json");
const anthropicCitations = anthropic.content.flatMap((block) => block.citations ?? []);
const anthropicToolErrors = anthropic.content.flatMap((block) => block.content ?? []).filter((item) => item.type === "web_search_tool_result_error");
assert(anthropicCitations.some((citation) => citation.type === "web_search_result_location" && citation.url), "Anthropic fixture must contain web search citation");
assert(anthropicToolErrors.length === 1, "Anthropic fixture must preserve successful-response tool errors");
assert(anthropic.usage.server_tool_use.web_search_requests === 1, "Anthropic fixture must contain web search usage");

const perplexity = readFixture("perplexity-response.json");
assert(perplexity.citations.length === 1, "Perplexity fixture must contain citations");
assert(perplexity.search_results[0].url === perplexity.citations[0], "Perplexity search result should match citation URL");
assert(perplexity.usage.cost.total_cost === 0, "Perplexity fixture must contain sanitized cost field");

for (const [name, fixture] of Object.entries({ openai, gemini, anthropic, perplexity })) {
  assert(fixture.id || fixture.responseId, `${name} fixture must preserve native provider response id`);
}

console.log("Adapter fixture checks passed.");
