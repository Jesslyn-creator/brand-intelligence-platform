import {
  EVIDENCE_SOURCE_TYPES,
  PROMPT_OPPORTUNITY_ACTIVE_STATUSES,
  PROMPT_OPPORTUNITY_PRIORITIES,
  PROMPT_OPPORTUNITY_STATUSES,
  type EvidenceSourceType,
  type PromptOpportunitiesListInput,
  type PromptOpportunityActiveStatus,
  type PromptOpportunityDuplicateInput,
  type PromptOpportunityPriority,
  type PromptOpportunityStatus,
  type ValidatedPromptOpportunitiesListInput
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

export class PromptOpportunityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptOpportunityValidationError";
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

export type { EvidenceSourceType, PromptOpportunityPriority, PromptOpportunityStatus };
