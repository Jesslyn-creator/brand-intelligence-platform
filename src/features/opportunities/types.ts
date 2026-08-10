export const PROMPT_OPPORTUNITY_STATUSES = ["new", "under_review", "approved", "rejected", "exploratory", "promoted"] as const;
export const PROMPT_OPPORTUNITY_ACTIVE_STATUSES = ["new", "under_review", "approved", "exploratory"] as const;
export const PROMPT_OPPORTUNITY_PRIORITIES = ["high", "medium", "low"] as const;
export const PROMPT_OPPORTUNITY_INTENTS = ["informational", "comparison", "recommendation", "transactional", "support", "unknown"] as const;
export const EVIDENCE_SOURCE_TYPES = ["gsc_csv", "google_ads_search_terms_csv", "customer_enquiry", "competitor_topic"] as const;

export type PromptOpportunityStatus = typeof PROMPT_OPPORTUNITY_STATUSES[number];
export type PromptOpportunityActiveStatus = typeof PROMPT_OPPORTUNITY_ACTIVE_STATUSES[number];
export type PromptOpportunityPriority = typeof PROMPT_OPPORTUNITY_PRIORITIES[number];
export type PromptOpportunityIntent = typeof PROMPT_OPPORTUNITY_INTENTS[number];
export type EvidenceSourceType = typeof EVIDENCE_SOURCE_TYPES[number];

export type PromptOpportunitiesListInput = {
  projectId: string;
  status?: PromptOpportunityStatus | null;
  priority?: PromptOpportunityPriority | null;
  market?: string | null;
  language?: string | null;
  sourceType?: EvidenceSourceType | null;
  limit?: number | null;
};

export type ValidatedPromptOpportunitiesListInput = {
  projectId: string;
  status: PromptOpportunityStatus | null;
  priority: PromptOpportunityPriority | null;
  market: string | null;
  language: string | null;
  sourceType: EvidenceSourceType | null;
  limit: number;
};

export type PromptOpportunityListItem = {
  id: string;
  topic: string;
  normalizedTopic: string | null;
  status: PromptOpportunityStatus;
  finalPriority: PromptOpportunityPriority | null;
  market: string;
  language: string;
  evidenceCount: number;
  evidenceSourceTypes: EvidenceSourceType[];
  createdAt: string;
  updatedAt: string;
};

export type PromptOpportunityDuplicateInput = {
  projectId: string;
  topic: string;
  market: string;
  language: string;
  limit?: number | null;
};

export type PromptOpportunityDuplicate = {
  id: string;
  topic: string;
  normalizedTopic: string | null;
  status: PromptOpportunityActiveStatus;
  market: string;
  language: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptOpportunityCreateInput = {
  projectId: string | null | undefined;
  topic: string | null | undefined;
  market: string | null | undefined;
  language: string | null | undefined;
  intent?: string | null | undefined;
  evidenceRecordIds: Array<string | null | undefined>;
  duplicateWarningAcknowledged: boolean;
};

export type ValidatedPromptOpportunityCreateInput = {
  projectId: string;
  topic: string;
  market: string;
  language: string;
  intent: PromptOpportunityIntent;
  evidenceRecordIds: string[];
  duplicateWarningAcknowledged: boolean;
};
