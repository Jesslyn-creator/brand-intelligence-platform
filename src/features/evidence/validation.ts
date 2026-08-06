import type { EvidenceSourceType, ManualEvidenceInput, ManualEvidenceKind, ValidatedManualEvidence } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

export function schemaSourceTypeForEvidenceKind(evidenceKind: ManualEvidenceKind): EvidenceSourceType {
  if (evidenceKind === "manual_customer_enquiry") return "customer_enquiry";
  if (evidenceKind === "manual_competitor_topic") return "competitor_topic";
  throw new EvidenceValidationError("Unsupported manual evidence kind.");
}

export function validateManualEvidenceInput(input: ManualEvidenceInput): ValidatedManualEvidence {
  const projectId = requiredTrimmed(input.projectId, "projectId");
  if (!UUID_PATTERN.test(projectId)) {
    throw new EvidenceValidationError("projectId must be a valid UUID.");
  }

  const sourceType = schemaSourceTypeForEvidenceKind(input.evidenceKind);
  const market = requiredTrimmed(input.market, "market");
  const language = requiredTrimmed(input.language, "language");
  const evidenceText = requiredTrimmed(input.evidenceText, "evidenceText");
  const topic = optionalTrimmed(input.topic);
  const sourceUrl = optionalTrimmed(input.sourceUrl);
  const sourceRecordReference = optionalTrimmed(input.sourceRecordReference);
  const sourceDate = optionalDate(input.sourceDate);
  const importName = optionalTrimmed(input.importName) ?? defaultImportName(input.evidenceKind);

  return {
    projectId,
    evidenceKind: input.evidenceKind,
    sourceType,
    market,
    language,
    evidenceText,
    topic,
    sourceDate,
    sourceUrl,
    sourceRecordReference,
    importName,
    metrics: input.metrics ?? {},
    rawRecord: input.rawRecord ?? {}
  };
}

function requiredTrimmed(value: string | null | undefined, fieldName: string): string {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) throw new EvidenceValidationError(`${fieldName} is required.`);
  return trimmed;
}

function optionalTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalDate(value: string | null | undefined): string | null {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) return null;

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (!ISO_DATE_PATTERN.test(trimmed) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new EvidenceValidationError("sourceDate must be a valid ISO date in YYYY-MM-DD format.");
  }

  return trimmed;
}

function defaultImportName(evidenceKind: ManualEvidenceKind): string {
  return evidenceKind === "manual_customer_enquiry" ? "Manual customer enquiry" : "Manual competitor topic";
}
