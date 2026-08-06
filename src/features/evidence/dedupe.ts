import type { ValidatedManualEvidence } from "./types";
import { sha256Text } from "@/lib/hash";

export async function evidenceDedupeHash(evidence: ValidatedManualEvidence): Promise<string> {
  return sha256Text(stableStringify({
    evidence_text: normalizeForDedupe(evidence.evidenceText),
    language: evidence.language.toLowerCase(),
    market: evidence.market.toLowerCase(),
    source_date: evidence.sourceDate,
    source_type: evidence.sourceType,
    source_url: evidence.sourceUrl ? evidence.sourceUrl.toLowerCase() : null,
    topic: evidence.topic ? normalizeForDedupe(evidence.topic) : null
  }));
}

export function normalizeForDedupe(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((accumulator, key) => {
    accumulator[key] = value[key];
    return accumulator;
  }, {}));
}
