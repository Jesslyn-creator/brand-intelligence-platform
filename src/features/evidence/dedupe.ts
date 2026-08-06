import type { ValidatedManualEvidence } from "./types";
import { sha256Text } from "@/lib/hash";

export type EvidenceIdentityPayload = Record<string, string | null>;

export type GscEvidenceIdentityInput = {
  sourceType: "gsc_csv";
  query: string;
  page?: string | null;
  country?: string | null;
  device?: string | null;
  rowDate?: string | null;
  reportDateStart: string;
  reportDateEnd: string;
  market: string;
  language: string;
};

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export async function evidenceDedupeHash(evidence: ValidatedManualEvidence): Promise<string> {
  return hashEvidenceIdentityPayload(buildManualEvidenceIdentityPayload(evidence));
}

export function buildManualEvidenceIdentityPayload(evidence: ValidatedManualEvidence): EvidenceIdentityPayload {
  return {
    evidence_text: normalizeForDedupe(evidence.evidenceText),
    language: evidence.language.toLowerCase(),
    market: evidence.market.toLowerCase(),
    source_date: evidence.sourceDate,
    source_type: evidence.sourceType,
    source_url: evidence.sourceUrl ? evidence.sourceUrl.toLowerCase() : null,
    topic: evidence.topic ? normalizeForDedupe(evidence.topic) : null
  };
}

export async function gscEvidenceDedupeHash(input: GscEvidenceIdentityInput): Promise<string> {
  return hashEvidenceIdentityPayload(buildGscEvidenceIdentityPayload(input));
}

export function buildGscEvidenceIdentityPayload(input: GscEvidenceIdentityInput): EvidenceIdentityPayload {
  return {
    country: normalizeOptionalIdentityText(input.country, { lowercase: true }),
    device: normalizeOptionalIdentityText(input.device, { lowercase: true }),
    language: normalizeRequiredIdentityText(input.language, { lowercase: true }),
    market: normalizeRequiredIdentityText(input.market, { lowercase: true }),
    page: normalizeOptionalIdentityText(input.page),
    query: normalizeRequiredIdentityText(input.query),
    report_date_end: normalizeRequiredIdentityText(input.reportDateEnd),
    report_date_start: normalizeRequiredIdentityText(input.reportDateStart),
    row_date: normalizeOptionalIdentityText(input.rowDate),
    source_type: input.sourceType
  };
}

export async function hashEvidenceIdentityPayload(payload: EvidenceIdentityPayload): Promise<string> {
  return sha256Text(stableStringify(payload));
}

export function normalizeForDedupe(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeRequiredIdentityText(value: string, options: { lowercase?: boolean } = {}): string {
  const normalized = removeUnsafeControlCharacters(value).trim();
  return options.lowercase ? normalized.toLowerCase() : normalized;
}

function normalizeOptionalIdentityText(value: string | null | undefined, options: { lowercase?: boolean } = {}): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeRequiredIdentityText(value, options);
  return normalized || null;
}

function removeUnsafeControlCharacters(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stableStringify(value: EvidenceIdentityPayload): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((accumulator, key) => {
    accumulator[key] = value[key];
    return accumulator;
  }, {}));
}
