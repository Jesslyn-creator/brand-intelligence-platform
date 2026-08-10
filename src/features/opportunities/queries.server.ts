import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type EvidenceSourceType,
  type PromptOpportunitiesListInput,
  type PromptOpportunityDuplicate,
  type PromptOpportunityDuplicateInput,
  type PromptOpportunityListItem
} from "./types";
import {
  activeOpportunityStatuses,
  validatePromptOpportunitiesListInput,
  validatePromptOpportunityDuplicateInput
} from "./validation";

const SOURCE_TYPE_PREFILTER_LIMIT = 500;

type SupabaseAuthenticatedClient = Awaited<ReturnType<typeof createSupabaseServerClient>> & {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: Error | null;
    }>;
  };
  from: (table: string) => any;
};

type OpportunityRow = {
  id: string;
  topic: string;
  normalized_topic: string | null;
  status: string;
  final_priority: string | null;
  market: string;
  language: string;
  created_at: string;
  updated_at: string;
};

type EvidenceLinkRow = {
  prompt_opportunity_id: string;
  evidence_records?: { source_type?: string | null } | Array<{ source_type?: string | null }> | null;
};

export async function getPromptOpportunitiesList(input: PromptOpportunitiesListInput): Promise<PromptOpportunityListItem[]> {
  const validated = validatePromptOpportunitiesListInput(input);
  const supabase = await getAuthenticatedSupabaseClient();
  await requireAuthenticatedUserId(supabase);

  const sourceFilteredOpportunityIds = validated.sourceType
    ? await findOpportunityIdsForSourceType(supabase, validated.projectId, validated.sourceType)
    : null;

  if (sourceFilteredOpportunityIds && sourceFilteredOpportunityIds.length === 0) {
    return [];
  }

  let opportunityQuery = supabase
    .from("prompt_opportunities")
    .select("id, topic, normalized_topic, status, final_priority, market, language, created_at, updated_at")
    .eq("project_id", validated.projectId)
    .order("updated_at", { ascending: false })
    .limit(validated.limit);

  if (validated.status) opportunityQuery = opportunityQuery.eq("status", validated.status);
  if (validated.priority) opportunityQuery = opportunityQuery.eq("final_priority", validated.priority);
  if (validated.market) opportunityQuery = opportunityQuery.eq("market", validated.market);
  if (validated.language) opportunityQuery = opportunityQuery.eq("language", validated.language);
  if (sourceFilteredOpportunityIds) opportunityQuery = opportunityQuery.in("id", sourceFilteredOpportunityIds);

  const { data: opportunityRows, error: opportunityError } = await opportunityQuery;
  if (opportunityError) throw opportunityError;

  const opportunities = (opportunityRows ?? []) as OpportunityRow[];
  if (opportunities.length === 0) return [];

  const summaryByOpportunityId = await evidenceSummaryByOpportunityId(
    supabase,
    validated.projectId,
    opportunities.map((opportunity) => opportunity.id)
  );

  return opportunities.map((opportunity) => {
    const summary = summaryByOpportunityId.get(opportunity.id) ?? { count: 0, sourceTypes: [] };
    return {
      id: opportunity.id,
      topic: opportunity.topic,
      normalizedTopic: opportunity.normalized_topic,
      status: opportunity.status as PromptOpportunityListItem["status"],
      finalPriority: opportunity.final_priority as PromptOpportunityListItem["finalPriority"],
      market: opportunity.market,
      language: opportunity.language,
      evidenceCount: summary.count,
      evidenceSourceTypes: summary.sourceTypes,
      createdAt: opportunity.created_at,
      updatedAt: opportunity.updated_at
    };
  });
}

export async function findNormalizedTopicDuplicates(input: PromptOpportunityDuplicateInput): Promise<PromptOpportunityDuplicate[]> {
  const validated = validatePromptOpportunityDuplicateInput(input);
  const supabase = await getAuthenticatedSupabaseClient();
  await requireAuthenticatedUserId(supabase);

  const { data, error } = await supabase
    .from("prompt_opportunities")
    .select("id, topic, normalized_topic, status, market, language, created_at, updated_at")
    .eq("project_id", validated.projectId)
    .eq("normalized_topic", validated.normalizedTopic)
    .eq("market", validated.market)
    .eq("language", validated.language)
    .in("status", activeOpportunityStatuses())
    .order("updated_at", { ascending: false })
    .limit(validated.limit);

  if (error) throw error;

  return ((data ?? []) as OpportunityRow[]).map((opportunity) => ({
    id: opportunity.id,
    topic: opportunity.topic,
    normalizedTopic: opportunity.normalized_topic,
    status: opportunity.status as PromptOpportunityDuplicate["status"],
    market: opportunity.market,
    language: opportunity.language,
    createdAt: opportunity.created_at,
    updatedAt: opportunity.updated_at
  }));
}

async function getAuthenticatedSupabaseClient(): Promise<SupabaseAuthenticatedClient> {
  return (await createSupabaseServerClient()) as SupabaseAuthenticatedClient;
}

async function requireAuthenticatedUserId(supabase: SupabaseAuthenticatedClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authenticated user is required to read prompt opportunities.");
  return data.user.id;
}

async function findOpportunityIdsForSourceType(
  supabase: SupabaseAuthenticatedClient,
  projectId: string,
  sourceType: EvidenceSourceType
): Promise<string[]> {
  const { data, error } = await supabase
    .from("prompt_opportunity_evidence")
    .select("prompt_opportunity_id, evidence_records!inner(source_type)")
    .eq("project_id", projectId)
    .eq("evidence_records.source_type", sourceType)
    .limit(SOURCE_TYPE_PREFILTER_LIMIT);

  if (error) throw error;

  return [...new Set(((data ?? []) as EvidenceLinkRow[]).map((row) => row.prompt_opportunity_id).filter(Boolean))];
}

async function evidenceSummaryByOpportunityId(
  supabase: SupabaseAuthenticatedClient,
  projectId: string,
  opportunityIds: string[]
): Promise<Map<string, { count: number; sourceTypes: EvidenceSourceType[] }>> {
  const summary = new Map<string, { count: number; sourceTypes: EvidenceSourceType[]; sourceTypeSet: Set<EvidenceSourceType> }>();

  const { data, error } = await supabase
    .from("prompt_opportunity_evidence")
    .select("prompt_opportunity_id, evidence_records(source_type)")
    .eq("project_id", projectId)
    .in("prompt_opportunity_id", opportunityIds);

  if (error) throw error;

  for (const row of (data ?? []) as EvidenceLinkRow[]) {
    const existing = summary.get(row.prompt_opportunity_id) ?? {
      count: 0,
      sourceTypes: [],
      sourceTypeSet: new Set<EvidenceSourceType>()
    };
    existing.count += 1;

    const sourceType = sourceTypeFromLinkRow(row);
    if (sourceType && !existing.sourceTypeSet.has(sourceType)) {
      existing.sourceTypeSet.add(sourceType);
      existing.sourceTypes.push(sourceType);
    }
    summary.set(row.prompt_opportunity_id, existing);
  }

  return new Map([...summary.entries()].map(([id, value]) => [id, {
    count: value.count,
    sourceTypes: value.sourceTypes
  }]));
}

function sourceTypeFromLinkRow(row: EvidenceLinkRow): EvidenceSourceType | null {
  const relation = Array.isArray(row.evidence_records) ? row.evidence_records[0] : row.evidence_records;
  const sourceType = relation?.source_type;
  if (
    sourceType === "gsc_csv"
    || sourceType === "google_ads_search_terms_csv"
    || sourceType === "customer_enquiry"
    || sourceType === "competitor_topic"
  ) {
    return sourceType;
  }
  return null;
}
