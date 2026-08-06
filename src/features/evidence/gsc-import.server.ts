import "server-only";

import { parseGscCsvPreview, type GscCsvInvalidRow, type GscCsvValidRow } from "@/lib/csv/gsc";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gscEvidenceDedupeHash } from "./dedupe";

const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.evidence.supabaseClientFactory");
const GSC_IMPORT_LOOKUP_HASH_CHUNK_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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

type ImportStatus = "completed" | "failed" | "partial";
type RowFailureType = "invalid" | "duplicate" | "database_error";

type ImportGscCsvEvidenceInput = {
  projectId: string;
  market: string;
  language: string;
  csvText: string;
  sourceFileName?: string | null;
  importName?: string | null;
  reportDateStart: string;
  reportDateEnd: string;
};

type GscImportRowFailure = {
  dataRowNumber?: number;
  sourceRecordReference?: string;
  failureType: RowFailureType;
  messages: string[];
};

type GscImportResult = {
  batchId: string | null;
  totalParsedRows: number;
  validRowCount: number;
  invalidRowCount: number;
  insertedRecordCount: number;
  duplicateRecordCount: number;
  failedRecordCount: number;
  batchStatus: ImportStatus;
  rowFailures: GscImportRowFailure[];
  fileErrors: string[];
};

type CandidateRow = {
  row: GscCsvValidRow;
  dedupeHash: string;
};

type BatchCounts = {
  inserted: number;
  duplicate: number;
  failed: number;
};

class GscImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GscImportValidationError";
  }
}

class GscImportDatabaseError extends Error {
  readonly batchId: string | null;
  readonly cause: Error;

  constructor(message: string, cause: Error, batchId: string | null = null) {
    super(message);
    this.name = "GscImportDatabaseError";
    this.cause = cause;
    this.batchId = batchId;
  }
}

class GscBatchFinalizationError extends Error {
  readonly batchId: string;
  readonly attemptedCounts: BatchCounts & { status: ImportStatus };
  readonly cause: Error;

  constructor(batchId: string, attemptedCounts: BatchCounts & { status: ImportStatus }, cause: Error) {
    super("GSC evidence records may already have been inserted, the batch may remain in pending state, and the operation was not rolled back.");
    this.name = "GscBatchFinalizationError";
    this.batchId = batchId;
    this.attemptedCounts = attemptedCounts;
    this.cause = cause;
  }
}

export async function importGscCsvEvidence(input: ImportGscCsvEvidenceInput): Promise<GscImportResult> {
  const supabase = await getAuthenticatedSupabaseClient();
  const userId = await requireAuthenticatedUserId(supabase);
  const validated = validateGscImportInput(input);
  const preview = parseGscCsvPreview(validated.csvText, {
    market: validated.market,
    language: validated.language,
    sourceFileName: validated.sourceFileName
  });

  if (preview.fileErrors.length) {
    return failedFileResult(preview.fileErrors);
  }

  const invalidFailures = preview.invalidRows.map(invalidRowFailure);
  const initialRowCount = preview.summary.totalRows;
  const { data: batch, error: batchError } = await supabase
    .from("evidence_import_batches")
    .insert({
      project_id: validated.projectId,
      source_type: "gsc_csv",
      import_name: validated.importName,
      imported_by: userId,
      source_file_name: validated.sourceFileName,
      source_date_start: validated.reportDateStart,
      source_date_end: validated.reportDateEnd,
      market: validated.market,
      language: validated.language,
      row_count: initialRowCount,
      import_status: "pending",
      raw_metadata: {
        parser: "gsc_csv",
        report_date_start: validated.reportDateStart,
        report_date_end: validated.reportDateEnd
      }
    })
    .select("id")
    .single();

  if (batchError) {
    throw new GscImportDatabaseError("Could not create GSC evidence import batch.", batchError);
  }

  const batchId = batch.id as string;
  const rowFailures: GscImportRowFailure[] = [...invalidFailures];
  const { candidates, duplicateFailures: inFileDuplicateFailures } = await uniqueCandidatesFromValidRows(preview.validRows, validated);
  rowFailures.push(...inFileDuplicateFailures);

  let existingHashes: Set<string>;
  try {
    existingHashes = await lookupExistingDedupeHashes(supabase, validated.projectId, candidates.map((candidate) => candidate.dedupeHash));
  } catch (error) {
    const dbError = asError(error);
    await markBatchAfterLookupFailure(supabase, batchId, validated.projectId, initialRowCount, preview.invalidRows.length, dbError.message);
    throw new GscImportDatabaseError("Could not verify existing GSC evidence duplicates.", dbError, batchId);
  }

  const dbUniqueCandidates: CandidateRow[] = [];
  let dbDuplicateCount = 0;
  for (const candidate of candidates) {
    if (existingHashes.has(candidate.dedupeHash)) {
      dbDuplicateCount += 1;
      rowFailures.push(duplicateRowFailure(candidate.row, "GSC evidence already exists for this project and report identity."));
    } else {
      dbUniqueCandidates.push(candidate);
    }
  }

  const insertCounts = await insertCandidateRows(supabase, {
    batchId,
    candidates: dbUniqueCandidates,
    input: validated,
    rowFailures
  });

  const duplicateRecordCount = inFileDuplicateFailures.length + dbDuplicateCount + insertCounts.raceDuplicateCount;
  const failedRecordCount = preview.invalidRows.length + insertCounts.databaseFailureCount;
  const insertedRecordCount = insertCounts.insertedRecordCount;
  const batchStatus = determineBatchStatus({
    inserted: insertedRecordCount,
    duplicate: duplicateRecordCount,
    failed: failedRecordCount
  });

  const { error: finalizationError } = await supabase
    .from("evidence_import_batches")
    .update({
      import_status: batchStatus,
      successful_record_count: insertedRecordCount,
      duplicate_record_count: duplicateRecordCount,
      failed_record_count: failedRecordCount,
      import_error: failureSummary(rowFailures)
    })
    .eq("id", batchId)
    .eq("project_id", validated.projectId);

  if (finalizationError) {
    throw new GscBatchFinalizationError(batchId, {
      inserted: insertedRecordCount,
      duplicate: duplicateRecordCount,
      failed: failedRecordCount,
      status: batchStatus
    }, finalizationError);
  }

  return {
    batchId,
    totalParsedRows: preview.summary.totalRows,
    validRowCount: preview.summary.validRowCount,
    invalidRowCount: preview.summary.invalidRowCount,
    insertedRecordCount,
    duplicateRecordCount,
    failedRecordCount,
    batchStatus,
    rowFailures,
    fileErrors: []
  };
}

function validateGscImportInput(input: ImportGscCsvEvidenceInput): Required<ImportGscCsvEvidenceInput> {
  const projectId = requiredTrimmed(input.projectId, "projectId");
  if (!UUID_PATTERN.test(projectId)) throw new GscImportValidationError("projectId must be a valid UUID.");

  const market = requiredTrimmed(input.market, "market");
  const language = requiredTrimmed(input.language, "language");
  const csvText = requiredString(input.csvText, "csvText");
  const reportDateStart = requiredIsoDate(input.reportDateStart, "reportDateStart");
  const reportDateEnd = requiredIsoDate(input.reportDateEnd, "reportDateEnd");

  if (reportDateStart > reportDateEnd) {
    throw new GscImportValidationError("reportDateStart must be on or before reportDateEnd.");
  }

  return {
    projectId,
    market,
    language,
    csvText,
    sourceFileName: cleanOptionalText(input.sourceFileName),
    importName: cleanOptionalText(input.importName) ?? "Google Search Console CSV import",
    reportDateStart,
    reportDateEnd
  };
}

async function uniqueCandidatesFromValidRows(
  rows: GscCsvValidRow[],
  input: Pick<Required<ImportGscCsvEvidenceInput>, "market" | "language" | "reportDateStart" | "reportDateEnd">
): Promise<{ candidates: CandidateRow[]; duplicateFailures: GscImportRowFailure[] }> {
  const candidates: CandidateRow[] = [];
  const duplicateFailures: GscImportRowFailure[] = [];
  const seenHashes = new Set<string>();

  for (const row of rows) {
    const dedupeHash = await gscEvidenceDedupeHash({
      sourceType: "gsc_csv",
      query: row.evidence.metrics.query,
      page: row.evidence.metrics.page,
      country: row.evidence.metrics.country,
      device: row.evidence.metrics.device,
      rowDate: row.evidence.metrics.date,
      reportDateStart: input.reportDateStart,
      reportDateEnd: input.reportDateEnd,
      market: input.market,
      language: input.language
    });

    if (seenHashes.has(dedupeHash)) {
      duplicateFailures.push(duplicateRowFailure(row, "Duplicate GSC row within this import file."));
      continue;
    }

    seenHashes.add(dedupeHash);
    candidates.push({ row, dedupeHash });
  }

  return { candidates, duplicateFailures };
}

async function lookupExistingDedupeHashes(
  supabase: SupabaseAuthenticatedClient,
  projectId: string,
  dedupeHashes: string[]
): Promise<Set<string>> {
  const existingHashes = new Set<string>();
  for (const chunk of chunkArray(dedupeHashes, GSC_IMPORT_LOOKUP_HASH_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from("evidence_records")
      .select("dedupe_hash")
      .eq("project_id", projectId)
      .eq("source_type", "gsc_csv")
      .in("dedupe_hash", chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (typeof row.dedupe_hash === "string") existingHashes.add(row.dedupe_hash);
    }
  }
  return existingHashes;
}

async function insertCandidateRows(
  supabase: SupabaseAuthenticatedClient,
  params: {
    batchId: string;
    candidates: CandidateRow[];
    input: Required<ImportGscCsvEvidenceInput>;
    rowFailures: GscImportRowFailure[];
  }
): Promise<{ insertedRecordCount: number; raceDuplicateCount: number; databaseFailureCount: number }> {
  let insertedRecordCount = 0;
  let raceDuplicateCount = 0;
  let databaseFailureCount = 0;

  for (const candidate of params.candidates) {
    const { row } = candidate;
    const { error } = await supabase
      .from("evidence_records")
      .insert({
        project_id: params.input.projectId,
        import_batch_id: params.batchId,
        source_type: "gsc_csv",
        source_record_reference: row.evidence.sourceRecordReference,
        source_date: row.evidence.sourceDate,
        source_url: row.evidence.sourceUrl,
        market: params.input.market,
        language: params.input.language,
        evidence_text: row.evidence.evidenceText,
        topic: null,
        metrics: gscMetricsAllowlist(row),
        raw_record: gscRawRecordAllowlist(row, params.input),
        dedupe_hash: candidate.dedupeHash
      });

    if (!error) {
      insertedRecordCount += 1;
      continue;
    }

    if (error.code === "23505") {
      raceDuplicateCount += 1;
      params.rowFailures.push(duplicateRowFailure(row, "GSC evidence was inserted concurrently by another import."));
      continue;
    }

    databaseFailureCount += 1;
    params.rowFailures.push({
      dataRowNumber: row.dataRowNumber,
      sourceRecordReference: row.evidence.sourceRecordReference,
      failureType: "database_error",
      messages: ["Could not insert GSC evidence row."]
    });
  }

  return { insertedRecordCount, raceDuplicateCount, databaseFailureCount };
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
  if (!data.user) throw new Error("Authenticated user is required to import GSC evidence.");
  return data.user.id;
}

async function markBatchAfterLookupFailure(
  supabase: SupabaseAuthenticatedClient,
  batchId: string,
  projectId: string,
  rowCount: number,
  parserInvalidCount: number,
  errorMessage: string
) {
  await supabase
    .from("evidence_import_batches")
    .update({
      import_status: "failed",
      failed_record_count: rowCount,
      import_error: errorMessage || `Could not verify existing GSC evidence duplicates. ${parserInvalidCount} parser-invalid rows were present.`
    })
    .eq("id", batchId)
    .eq("project_id", projectId);
}

function determineBatchStatus(counts: BatchCounts): ImportStatus {
  if (counts.inserted > 0 && counts.duplicate === 0 && counts.failed === 0) return "completed";
  if (counts.inserted === 0 && counts.duplicate > 0 && counts.failed === 0) return "completed";
  if (counts.inserted === 0 && counts.duplicate === 0 && counts.failed > 0) return "failed";
  return "partial";
}

function invalidRowFailure(row: GscCsvInvalidRow): GscImportRowFailure {
  return {
    dataRowNumber: row.dataRowNumber,
    failureType: "invalid",
    messages: row.messages
  };
}

function duplicateRowFailure(row: GscCsvValidRow, message: string): GscImportRowFailure {
  return {
    dataRowNumber: row.dataRowNumber,
    sourceRecordReference: row.evidence.sourceRecordReference,
    failureType: "duplicate",
    messages: [message]
  };
}

function failedFileResult(fileErrors: string[]): GscImportResult {
  return {
    batchId: null,
    totalParsedRows: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    insertedRecordCount: 0,
    duplicateRecordCount: 0,
    failedRecordCount: 0,
    batchStatus: "failed",
    rowFailures: [],
    fileErrors
  };
}

function gscMetricsAllowlist(row: GscCsvValidRow) {
  return {
    query: row.evidence.metrics.query,
    clicks: row.evidence.metrics.clicks,
    impressions: row.evidence.metrics.impressions,
    ctr: row.evidence.metrics.ctr,
    position: row.evidence.metrics.position,
    page: row.evidence.metrics.page,
    country: row.evidence.metrics.country,
    device: row.evidence.metrics.device,
    date: row.evidence.metrics.date
  };
}

function gscRawRecordAllowlist(row: GscCsvValidRow, input: Pick<Required<ImportGscCsvEvidenceInput>, "reportDateStart" | "reportDateEnd">) {
  return {
    query: row.evidence.metrics.query,
    clicks: row.evidence.metrics.clicks,
    impressions: row.evidence.metrics.impressions,
    ctr: row.evidence.metrics.ctr,
    position: row.evidence.metrics.position,
    page: row.evidence.metrics.page,
    country: row.evidence.metrics.country,
    device: row.evidence.metrics.device,
    date: row.evidence.metrics.date,
    source_record_reference: row.evidence.sourceRecordReference,
    data_row_number: row.dataRowNumber,
    report_date_start: input.reportDateStart,
    report_date_end: input.reportDateEnd
  };
}

function failureSummary(rowFailures: GscImportRowFailure[]): string | null {
  if (rowFailures.length === 0) return null;
  const invalid = rowFailures.filter((failure) => failure.failureType === "invalid").length;
  const duplicate = rowFailures.filter((failure) => failure.failureType === "duplicate").length;
  const database = rowFailures.filter((failure) => failure.failureType === "database_error").length;
  return `GSC import completed with ${invalid} invalid rows, ${duplicate} duplicate rows, and ${database} database row failures.`;
}

function requiredTrimmed(value: string | null | undefined, fieldName: string): string {
  const trimmed = cleanOptionalText(value);
  if (!trimmed) throw new GscImportValidationError(`${fieldName} is required.`);
  return trimmed;
}

function requiredString(value: string | null | undefined, fieldName: string): string {
  if (typeof value !== "string") throw new GscImportValidationError(`${fieldName} is required.`);
  if (!value.trim()) throw new GscImportValidationError(`${fieldName} is required.`);
  return value;
}

function requiredIsoDate(value: string | null | undefined, fieldName: string): string {
  const trimmed = requiredTrimmed(value, fieldName);
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (!ISO_DATE_PATTERN.test(trimmed) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new GscImportValidationError(`${fieldName} must be a valid ISO date in YYYY-MM-DD format.`);
  }
  return trimmed;
}

function cleanOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHAR_PATTERN, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return cleaned || null;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return Object.assign(new Error(error.message), error);
  }
  return new Error("Unknown GSC import database error.");
}
