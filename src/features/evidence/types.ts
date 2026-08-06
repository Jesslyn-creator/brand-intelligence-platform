export type ManualEvidenceKind = "manual_customer_enquiry" | "manual_competitor_topic";

export type EvidenceSourceType = "customer_enquiry" | "competitor_topic";

export type JsonObject = Record<string, unknown>;

export type ManualEvidenceInput = {
  projectId: string;
  evidenceKind: ManualEvidenceKind;
  market: string;
  language: string;
  evidenceText: string;
  topic?: string | null;
  sourceDate?: string | null;
  sourceUrl?: string | null;
  sourceRecordReference?: string | null;
  importName?: string | null;
  metrics?: JsonObject;
  rawRecord?: JsonObject;
};

export type ValidatedManualEvidence = {
  projectId: string;
  evidenceKind: ManualEvidenceKind;
  sourceType: EvidenceSourceType;
  market: string;
  language: string;
  evidenceText: string;
  topic: string | null;
  sourceDate: string | null;
  sourceUrl: string | null;
  sourceRecordReference: string | null;
  importName: string;
  metrics: JsonObject;
  rawRecord: JsonObject;
};

export type EvidenceRecordSummary = {
  id: string;
  project_id: string;
  import_batch_id: string;
  source_type: EvidenceSourceType;
  source_record_reference: string;
  dedupe_hash: string;
};

export type CreatedManualEvidence = {
  importBatchId: string;
  evidenceRecord: EvidenceRecordSummary;
  dedupeHash: string;
};
