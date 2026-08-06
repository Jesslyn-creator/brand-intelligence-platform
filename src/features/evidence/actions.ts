"use server";

import { GSC_CSV_MAX_BYTES } from "@/lib/csv/gsc";
import { importGscCsvEvidence } from "./gsc-import.server";
import { createManualCompetitorTopicEvidence, createManualCustomerEnquiryEvidence } from "./repository.server";

type ErrorType = "authentication" | "validation" | "file" | "duplicate" | "permission" | "database" | "finalization" | "unknown";
type ImportStatus = "completed" | "failed" | "partial";
type GscRowFailure = {
  dataRowNumber?: number;
  sourceRecordReference?: string;
  failureType: "invalid" | "duplicate" | "database_error";
  messages: string[];
};

type GscActionResult =
  | {
      ok: true;
      batchId: string | null;
      batchStatus: ImportStatus;
      counts: {
        totalParsedRows: number;
        validRowCount: number;
        invalidRowCount: number;
        insertedRecordCount: number;
        duplicateRecordCount: number;
        failedRecordCount: number;
      };
      fileErrors: string[];
      rowFailures: GscRowFailure[];
      message: string;
    }
  | {
      ok: false;
      errorType: ErrorType;
      message: string;
      batchId?: string | null;
      batchStatus?: ImportStatus;
      counts?: {
        totalParsedRows: number;
        validRowCount: number;
        invalidRowCount: number;
        insertedRecordCount: number;
        duplicateRecordCount: number;
        failedRecordCount: number;
      };
      fileErrors?: string[];
      rowFailures?: GscRowFailure[];
    };

type ManualActionResult =
  | {
      ok: true;
      importBatchId: string;
      evidenceRecordId: string;
      duplicate: false;
      message: string;
    }
  | {
      ok: false;
      errorType: ErrorType;
      message: string;
      duplicate?: boolean;
      existingEvidenceRecordId?: string;
      importBatchId?: string;
      evidenceRecordId?: string;
    };

type EvidenceServices = {
  importGscCsvEvidence: typeof importGscCsvEvidence;
  createManualCustomerEnquiryEvidence: typeof createManualCustomerEnquiryEvidence;
  createManualCompetitorTopicEvidence: typeof createManualCompetitorTopicEvidence;
};

const TEST_SERVICES_SYMBOL = Symbol.for("brand-intelligence.evidence.actionServices");

type TestGlobal = typeof globalThis & {
  [TEST_SERVICES_SYMBOL]?: Partial<EvidenceServices>;
};

export async function importGscCsvEvidenceAction(formData: FormData): Promise<GscActionResult> {
  const fileResult = fileFromFormData(formData);
  if (!fileResult.ok) return fileResult.result;

  let csvText: string;
  try {
    csvText = await fileResult.file.text();
  } catch {
    return {
      ok: false,
      errorType: "file",
      message: "Could not read the uploaded CSV file."
    };
  }

  try {
    const result = await services().importGscCsvEvidence({
      projectId: requiredString(formData, "project_id"),
      market: requiredString(formData, "market"),
      language: requiredString(formData, "language"),
      reportDateStart: requiredString(formData, "report_date_start"),
      reportDateEnd: requiredString(formData, "report_date_end"),
      importName: optionalString(formData, "import_name"),
      sourceFileName: fileResult.file.name,
      csvText
    });

    const mapped = mapGscResult(result);
    if (mapped.batchStatus === "failed" && mapped.batchId === null && mapped.fileErrors.length > 0) {
      return {
        ok: false,
        errorType: "file",
        message: "The CSV file could not be imported. Review the file errors and try again.",
        ...mapped
      };
    }

    return {
      ok: true,
      message: mapped.batchStatus === "completed" ? "GSC evidence import completed." : "GSC evidence import finished with issues.",
      ...mapped
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function createManualCustomerEnquiryEvidenceAction(formData: FormData): Promise<ManualActionResult> {
  return createManualEvidenceAction(formData, "customer");
}

export async function createManualCompetitorTopicEvidenceAction(formData: FormData): Promise<ManualActionResult> {
  return createManualEvidenceAction(formData, "competitor");
}

async function createManualEvidenceAction(formData: FormData, kind: "customer" | "competitor"): Promise<ManualActionResult> {
  try {
    const input = {
      projectId: requiredString(formData, "project_id"),
      market: requiredString(formData, "market"),
      language: requiredString(formData, "language"),
      evidenceText: requiredString(formData, "evidence_text"),
      sourceDate: optionalString(formData, "source_date"),
      sourceUrl: optionalString(formData, "source_url"),
      topic: optionalString(formData, "topic")
    };

    const result = kind === "customer"
      ? await services().createManualCustomerEnquiryEvidence(input)
      : await services().createManualCompetitorTopicEvidence(input);

    return {
      ok: true,
      importBatchId: result.importBatchId,
      evidenceRecordId: result.evidenceRecord.id,
      duplicate: false,
      message: "Evidence record created."
    };
  } catch (error) {
    return mapActionError(error);
  }
}

function fileFromFormData(formData: FormData): { ok: true; file: File } | { ok: false; result: GscActionResult } {
  const value = formData.get("csv_file");
  if (!value) {
    return { ok: false, result: fileError("Upload a CSV file.") };
  }

  if (!(value instanceof File)) {
    return { ok: false, result: fileError("The uploaded CSV must be a file.") };
  }

  if (value.size <= 0) {
    return { ok: false, result: fileError("The uploaded CSV file is empty.") };
  }

  if (value.size > GSC_CSV_MAX_BYTES) {
    return { ok: false, result: fileError(`The uploaded CSV file exceeds the ${GSC_CSV_MAX_BYTES} byte limit.`) };
  }

  return { ok: true, file: value };
}

function fileError(message: string): GscActionResult {
  return {
    ok: false,
    errorType: "file",
    message,
    batchId: null,
    batchStatus: "failed",
    counts: emptyCounts(),
    fileErrors: [message],
    rowFailures: []
  };
}

function mapGscResult(result: Awaited<ReturnType<typeof importGscCsvEvidence>>) {
  return {
    batchId: result.batchId,
    batchStatus: result.batchStatus,
    counts: {
      totalParsedRows: result.totalParsedRows,
      validRowCount: result.validRowCount,
      invalidRowCount: result.invalidRowCount,
      insertedRecordCount: result.insertedRecordCount,
      duplicateRecordCount: result.duplicateRecordCount,
      failedRecordCount: result.failedRecordCount
    },
    fileErrors: result.fileErrors,
    rowFailures: result.rowFailures
  };
}

function mapActionError(error: unknown): GscActionResult & ManualActionResult {
  const name = errorName(error);
  if (name === "GscBatchFinalizationError") {
    const batchId = error && typeof error === "object" && "batchId" in error && typeof error.batchId === "string" ? error.batchId : undefined;
    return {
      ok: false,
      errorType: "finalization",
      message: "Evidence may have been created, but the import batch could not be finalized. Refresh before retrying.",
      batchId
    } as GscActionResult & ManualActionResult;
  }

  if (name === "BatchFinalizationError") {
    const evidenceRecord = error && typeof error === "object" && "evidenceRecord" in error && error.evidenceRecord && typeof error.evidenceRecord === "object" ? error.evidenceRecord as { id?: unknown; import_batch_id?: unknown } : null;
    return {
      ok: false,
      errorType: "finalization",
      message: "Evidence was created, but the import batch could not be finalized. Refresh before retrying.",
      evidenceRecordId: typeof evidenceRecord?.id === "string" ? evidenceRecord.id : undefined,
      importBatchId: typeof evidenceRecord?.import_batch_id === "string" ? evidenceRecord.import_batch_id : undefined
    } as GscActionResult & ManualActionResult;
  }

  if (name === "DuplicateEvidenceError") {
    const existingEvidenceRecordId = error && typeof error === "object" && "existingEvidenceRecordId" in error && typeof error.existingEvidenceRecordId === "string" ? error.existingEvidenceRecordId : undefined;
    return {
      ok: false,
      errorType: "duplicate",
      duplicate: true,
      existingEvidenceRecordId,
      message: "This evidence already exists for the project."
    } as GscActionResult & ManualActionResult;
  }

  if (name === "EvidenceValidationError" || name === "GscImportValidationError" || error instanceof TypeError) {
    return {
      ok: false,
      errorType: "validation",
      message: safeValidationMessage(error)
    } as GscActionResult & ManualActionResult;
  }

  if (isAuthenticationError(error)) {
    return {
      ok: false,
      errorType: "authentication",
      message: "Sign in before importing evidence."
    } as GscActionResult & ManualActionResult;
  }

  if (isPermissionError(error)) {
    return {
      ok: false,
      errorType: "permission",
      message: "You do not have access to import evidence for this project."
    } as GscActionResult & ManualActionResult;
  }

  if (isDatabaseError(error)) {
    return {
      ok: false,
      errorType: "database",
      message: "Evidence could not be saved. Try again later."
    } as GscActionResult & ManualActionResult;
  }

  return {
    ok: false,
    errorType: "unknown",
    message: "Evidence import failed. Try again later."
  } as GscActionResult & ManualActionResult;
}

function requiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${key} is required.`);
  return value.trim();
}

function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function emptyCounts() {
  return {
    totalParsedRows: 0,
    validRowCount: 0,
    invalidRowCount: 0,
    insertedRecordCount: 0,
    duplicateRecordCount: 0,
    failedRecordCount: 0
  };
}

function services(): EvidenceServices {
  const testServices = process.env.NODE_ENV === "test" ? (globalThis as TestGlobal)[TEST_SERVICES_SYMBOL] : undefined;
  return {
    importGscCsvEvidence: testServices?.importGscCsvEvidence ?? importGscCsvEvidence,
    createManualCustomerEnquiryEvidence: testServices?.createManualCustomerEnquiryEvidence ?? createManualCustomerEnquiryEvidence,
    createManualCompetitorTopicEvidence: testServices?.createManualCompetitorTopicEvidence ?? createManualCompetitorTopicEvidence
  };
}

function errorName(error: unknown): string | null {
  return error && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name : null;
}

function safeValidationMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Check the evidence import fields and try again.";
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("authenticated user is required") || message.includes("auth session missing") || message.includes("jwt");
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "42501" || code === "PGRST301" || message.includes("permission denied") || message.includes("row-level security") || message.includes("rls");
}

function isDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error || errorName(error) === "GscImportDatabaseError";
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
}
