import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evidenceDedupeHash } from "./dedupe";
import type { CreatedManualEvidence, EvidenceRecordSummary, ManualEvidenceInput } from "./types";
import { validateManualEvidenceInput } from "./validation";

const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.evidence.supabaseClientFactory");

type SupabaseAuthenticatedClient = Awaited<ReturnType<typeof createSupabaseServerClient>> & {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: Error | null;
    }>;
  };
  from: (table: string) => any;
};

type TestGlobal = typeof globalThis & {
  [TEST_CLIENT_FACTORY_SYMBOL]?: () => SupabaseAuthenticatedClient | Promise<SupabaseAuthenticatedClient>;
};

class DuplicateEvidenceError extends Error {
  readonly existingEvidenceRecordId: string;
  readonly dedupeHash: string;

  constructor(existingEvidenceRecordId: string, dedupeHash: string) {
    super("Evidence already exists for this project, source type, and content.");
    this.name = "DuplicateEvidenceError";
    this.existingEvidenceRecordId = existingEvidenceRecordId;
    this.dedupeHash = dedupeHash;
  }
}

class BatchFinalizationError extends Error {
  readonly cause: Error;
  readonly evidenceRecord: EvidenceRecordSummary;

  constructor(cause: Error, evidenceRecord: EvidenceRecordSummary) {
    super("Evidence was created, but the import batch could not be marked completed.");
    this.name = "BatchFinalizationError";
    this.cause = cause;
    this.evidenceRecord = evidenceRecord;
  }
}

export async function createManualCustomerEnquiryEvidence(input: Omit<ManualEvidenceInput, "evidenceKind">) {
  return createManualEvidence({
    ...input,
    evidenceKind: "manual_customer_enquiry"
  });
}

export async function createManualCompetitorTopicEvidence(input: Omit<ManualEvidenceInput, "evidenceKind">) {
  return createManualEvidence({
    ...input,
    evidenceKind: "manual_competitor_topic"
  });
}

async function createManualEvidence(input: ManualEvidenceInput): Promise<CreatedManualEvidence> {
  const evidence = validateManualEvidenceInput(input);
  const dedupeHash = await evidenceDedupeHash(evidence);
  const supabase = await getAuthenticatedSupabaseClient();
  const userId = await requireAuthenticatedUserId(supabase);

  const existingEvidenceRecord = await findDuplicateEvidenceRecord(supabase, {
    dedupeHash,
    projectId: evidence.projectId,
    sourceType: evidence.sourceType
  });

  if (existingEvidenceRecord) {
    throw new DuplicateEvidenceError(existingEvidenceRecord.id, dedupeHash);
  }

  const { data: batch, error: batchError } = await supabase
    .from("evidence_import_batches")
    .insert({
      project_id: evidence.projectId,
      source_type: evidence.sourceType,
      import_name: evidence.importName,
      imported_by: userId,
      market: evidence.market,
      language: evidence.language,
      row_count: 1,
      raw_metadata: {
        manual: true,
        manual_evidence_kind: evidence.evidenceKind
      }
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const sourceRecordReference = evidence.sourceRecordReference ?? `manual:${evidence.sourceType}:${batch.id}`;

  const { data: evidenceRecord, error: evidenceError } = await supabase
    .from("evidence_records")
    .insert({
      project_id: evidence.projectId,
      import_batch_id: batch.id,
      source_type: evidence.sourceType,
      source_record_reference: sourceRecordReference,
      source_date: evidence.sourceDate,
      market: evidence.market,
      language: evidence.language,
      topic: evidence.topic,
      evidence_text: evidence.evidenceText,
      source_url: evidence.sourceUrl,
      metrics: evidence.metrics,
      raw_record: {
        ...evidence.rawRecord,
        manual_evidence_kind: evidence.evidenceKind
      },
      dedupe_hash: dedupeHash
    })
    .select("id, project_id, import_batch_id, source_type, source_record_reference, dedupe_hash")
    .single();

  if (evidenceError) {
    await markBatchFailed(supabase, batch.id, evidenceError.message, evidenceError.code === "23505");

    if (evidenceError.code === "23505") {
      const duplicate = await findDuplicateEvidenceRecord(supabase, {
        dedupeHash,
        projectId: evidence.projectId,
        sourceType: evidence.sourceType
      });
      throw new DuplicateEvidenceError(duplicate?.id ?? "", dedupeHash);
    }

    throw evidenceError;
  }

  const { error: batchUpdateError } = await supabase
    .from("evidence_import_batches")
    .update({
      import_status: "completed",
      successful_record_count: 1
    })
    .eq("id", batch.id)
    .eq("project_id", evidence.projectId);

  if (batchUpdateError) {
    // This stage intentionally avoids a promotion-style RPC. If this update fails, the evidence row exists and the batch may remain pending.
    throw new BatchFinalizationError(batchUpdateError, evidenceRecord as EvidenceRecordSummary);
  }

  return {
    importBatchId: batch.id,
    evidenceRecord: evidenceRecord as EvidenceRecordSummary,
    dedupeHash
  };
}

async function getAuthenticatedSupabaseClient(): Promise<SupabaseAuthenticatedClient> {
  const testClientFactory = (globalThis as TestGlobal)[TEST_CLIENT_FACTORY_SYMBOL];
  if (process.env.NODE_ENV === "test" && testClientFactory) {
    return testClientFactory();
  }

  return (await createSupabaseServerClient()) as SupabaseAuthenticatedClient;
}

async function requireAuthenticatedUserId(supabase: SupabaseAuthenticatedClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Authenticated user is required to create evidence.");
  return data.user.id;
}

async function findDuplicateEvidenceRecord(
  supabase: SupabaseAuthenticatedClient,
  input: { projectId: string; sourceType: string; dedupeHash: string }
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("evidence_records")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("source_type", input.sourceType)
    .eq("dedupe_hash", input.dedupeHash)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function markBatchFailed(
  supabase: SupabaseAuthenticatedClient,
  batchId: string,
  errorMessage: string,
  duplicate: boolean
) {
  await supabase
    .from("evidence_import_batches")
    .update({
      import_status: duplicate ? "partial" : "failed",
      duplicate_record_count: duplicate ? 1 : 0,
      failed_record_count: duplicate ? 0 : 1,
      import_error: errorMessage
    })
    .eq("id", batchId);
}
