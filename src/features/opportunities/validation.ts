import {
  EVIDENCE_SOURCE_TYPES,
  PROMPT_OPPORTUNITY_ACTIVE_STATUSES,
  PROMPT_OPPORTUNITY_INTENTS,
  PROMPT_OPPORTUNITY_PRIORITIES,
  PROMPT_OPPORTUNITY_STATUSES,
  type EvidenceSourceType,
  type PromptOpportunitiesListInput,
  type PromptOpportunityActiveStatus,
  type PromptOpportunityCreateInput,
  type PromptOpportunityDuplicateInput,
  type PromptOpportunityIntent,
  type PromptOpportunityPriority,
  type PromptOpportunityStatus,
  type ValidatedPromptOpportunitiesListInput,
  type ValidatedPromptOpportunityCreateInput
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_CREATE_EVIDENCE_RECORD_IDS = 100;

export class PromptOpportunityValidationError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "PromptOpportunityValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function validatePromptOpportunitiesListInput(input: PromptOpportunitiesListInput): ValidatedPromptOpportunitiesListInput {
  return {
    projectId: requiredUuid(input.projectId, "projectId"),
    status: optionalEnum(input.status, PROMPT_OPPORTUNITY_STATUSES, "status"),
    priority: optionalEnum(input.priority, PROMPT_OPPORTUNITY_PRIORITIES, "priority"),
    market: optionalNonEmpty(input.market, "market"),
    language: optionalNonEmpty(input.language, "language"),
    sourceType: optionalEnum(input.sourceType, EVIDENCE_SOURCE_TYPES, "sourceType"),
    limit: boundedLimit(input.limit)
  };
}

export function validatePromptOpportunityCreateInput(input: PromptOpportunityCreateInput): ValidatedPromptOpportunityCreateInput {
  const fieldErrors: Record<string, string> = {};
  const projectId = collect(() => requiredUuid(input.projectId, "project_id"), fieldErrors, "project_id");
  const topic = collect(() => requiredString(input.topic, "topic"), fieldErrors, "topic");
  const market = collect(() => requiredString(input.market, "market"), fieldErrors, "market");
  const language = collect(() => requiredString(input.language, "language"), fieldErrors, "language");
  const intent = collect(() => optionalEnum(input.intent ?? "unknown", PROMPT_OPPORTUNITY_INTENTS, "intent") ?? "unknown", fieldErrors, "intent");
  const evidenceRecordIds = collect(() => validateEvidenceRecordIds(input.evidenceRecordIds), fieldErrors, "evidence_record_ids");

  if (Object.keys(fieldErrors).length > 0 || !projectId || !topic || !market || !language || !intent || !evidenceRecordIds) {
    throw new PromptOpportunityValidationError("Check the opportunity fields and try again.", fieldErrors);
  }

  return {
    projectId,
    topic,
    market,
    language,
    intent,
    evidenceRecordIds,
    duplicateWarningAcknowledged: input.duplicateWarningAcknowledged
  };
}

export function validatePromptOpportunityDuplicateInput(input: PromptOpportunityDuplicateInput) {
  const topic = requiredString(input.topic, "topic");
  const normalizedTopic = normalizeTopicForLookup(topic);
  if (!normalizedTopic) throw new PromptOpportunityValidationError("topic is required.");

  return {
    projectId: requiredUuid(input.projectId, "projectId"),
    topic,
    normalizedTopic,
    market: requiredString(input.market, "market"),
    language: requiredString(input.language, "language"),
    limit: boundedLimit(input.limit)
  };
}

export function normalizeTopicForLookup(topic: string | null | undefined): string | null {
  if (typeof topic !== "string") return null;
  // Matches public.normalize_text for ordinary whitespace used in Stage 3 topic inputs.
  // The database generated normalized_topic remains the source of truth for persisted rows.
  const normalized = topic.trim().toLowerCase().replace(/[ \t\r\n\f]+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function activeOpportunityStatuses(): PromptOpportunityActiveStatus[] {
  return [...PROMPT_OPPORTUNITY_ACTIVE_STATUSES];
}

export function maxCreateEvidenceRecordIds(): number {
  return MAX_CREATE_EVIDENCE_RECORD_IDS;
}

function collect<T>(fn: () => T, fieldErrors: Record<string, string>, fieldName: string): T | null {
  try {
    return fn();
  } catch (error) {
    fieldErrors[fieldName] = error instanceof Error ? error.message : `${fieldName} is invalid.`;
    return null;
  }
}

function validateEvidenceRecordIds(values: Array<string | null | undefined>): string[] {
  if (!values.length) throw new PromptOpportunityValidationError("At least one evidence record is required.");
  if (values.length > MAX_CREATE_EVIDENCE_RECORD_IDS) {
    throw new PromptOpportunityValidationError(`No more than ${MAX_CREATE_EVIDENCE_RECORD_IDS} evidence records can be selected.`);
  }

  const ids = values.map((value) => requiredUuid(value, "evidence_record_ids"));
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    throw new PromptOpportunityValidationError("Duplicate evidence records are not allowed.");
  }
  return ids;
}

function requiredUuid(value: string | null | undefined, fieldName: string): string {
  const trimmed = requiredString(value, fieldName);
  if (!UUID_PATTERN.test(trimmed)) {
    throw new PromptOpportunityValidationError(`${fieldName} must be a valid UUID.`);
  }
  return trimmed;
}

function requiredString(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== "string") throw new PromptOpportunityValidationError(`${fieldName} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new PromptOpportunityValidationError(`${fieldName} is required.`);
  return trimmed;
}

function optionalNonEmpty(value: string | null | undefined, fieldName: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new PromptOpportunityValidationError(`${fieldName} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) throw new PromptOpportunityValidationError(`${fieldName} cannot be blank.`);
  return trimmed;
}

function optionalEnum<T extends string>(value: T | string | null | undefined, allowedValues: readonly T[], fieldName: string): T | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new PromptOpportunityValidationError(`${fieldName} cannot be blank.`);
  }

  const trimmed = value.trim();
  if (!allowedValues.includes(trimmed as T)) {
    throw new PromptOpportunityValidationError(`${fieldName} is not supported.`);
  }
  return trimmed as T;
}

function boundedLimit(value: number | null | undefined): number {
  if (value == null) return DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(value) || value <= 0) {
    throw new PromptOpportunityValidationError("limit must be a positive integer.");
  }
  return Math.min(value, MAX_LIST_LIMIT);
}

export type { EvidenceSourceType, PromptOpportunityIntent, PromptOpportunityPriority, PromptOpportunityStatus };
