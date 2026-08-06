import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GSC_CSV_MAX_BYTES } from "../src/lib/csv/gsc.ts";

const root = process.cwd();
const TEST_SERVICES_SYMBOL = Symbol.for("brand-intelligence.evidence.actionServices");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const actions = await import(pathToFileURL(join(root, "src", "features", "evidence", "actions.ts")).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: expected ${expected}, got ${actual}`);
}

function resetServices() {
  delete globalThis[TEST_SERVICES_SYMBOL];
}

async function withServices(services, fn) {
  globalThis[TEST_SERVICES_SYMBOL] = services;
  try {
    return await fn();
  } finally {
    resetServices();
  }
}

function gscFormData(overrides = {}) {
  const formData = new FormData();
  formData.set("project_id", overrides.projectId ?? "11111111-1111-4111-8111-111111111111");
  formData.set("market", overrides.market ?? "SG");
  formData.set("language", overrides.language ?? "en");
  formData.set("report_date_start", overrides.reportDateStart ?? "2026-07-01");
  formData.set("report_date_end", overrides.reportDateEnd ?? "2026-07-31");
  if ("importName" in overrides) formData.set("import_name", overrides.importName);
  else formData.set("import_name", "July GSC import");
  if ("sourceFileName" in overrides) formData.set("source_file_name", overrides.sourceFileName);
  if ("csvFile" in overrides) formData.set("csv_file", overrides.csvFile);
  else formData.set("csv_file", new File(["Query\nmaid agency singapore"], "gsc-export.csv", { type: "text/csv" }));
  return formData;
}

function manualFormData(overrides = {}) {
  const formData = new FormData();
  formData.set("project_id", overrides.projectId ?? "11111111-1111-4111-8111-111111111111");
  formData.set("market", overrides.market ?? "SG");
  formData.set("language", overrides.language ?? "en");
  formData.set("evidence_text", overrides.evidenceText ?? "How much does a transfer helper cost?");
  formData.set("source_date", overrides.sourceDate ?? "2026-07-15");
  formData.set("source_url", overrides.sourceUrl ?? "https://example.test/enquiry");
  formData.set("topic", overrides.topic ?? "transfer helper cost");
  if ("importedBy" in overrides) formData.set("imported_by", overrides.importedBy);
  if ("dedupeHash" in overrides) formData.set("dedupe_hash", overrides.dedupeHash);
  return formData;
}

function gscSuccessResult(overrides = {}) {
  return {
    batchId: Object.hasOwn(overrides, "batchId") ? overrides.batchId : "22222222-2222-4222-8222-222222222222",
    totalParsedRows: overrides.totalParsedRows ?? 2,
    validRowCount: overrides.validRowCount ?? 2,
    invalidRowCount: overrides.invalidRowCount ?? 0,
    insertedRecordCount: overrides.insertedRecordCount ?? 2,
    duplicateRecordCount: overrides.duplicateRecordCount ?? 0,
    failedRecordCount: overrides.failedRecordCount ?? 0,
    batchStatus: overrides.batchStatus ?? "completed",
    rowFailures: overrides.rowFailures ?? [],
    fileErrors: overrides.fileErrors ?? []
  };
}

function manualSuccessResult(overrides = {}) {
  return {
    importBatchId: overrides.importBatchId ?? "33333333-3333-4333-8333-333333333333",
    evidenceRecord: {
      id: overrides.evidenceRecordId ?? "44444444-4444-4444-8444-444444444444",
      project_id: "11111111-1111-4111-8111-111111111111",
      import_batch_id: overrides.importBatchId ?? "33333333-3333-4333-8333-333333333333",
      source_type: "customer_enquiry",
      source_record_reference: "manual:customer_enquiry:33333333-3333-4333-8333-333333333333",
      dedupe_hash: "hash"
    },
    dedupeHash: "hash"
  };
}

function namedError(name, message, extras = {}) {
  return Object.assign(new Error(message), { name, ...extras });
}

async function testGscMissingAndInvalidFiles() {
  let result = await actions.importGscCsvEvidenceAction(gscFormData({ csvFile: undefined }));
  assertEqual(result.ok, false, "missing file rejected");
  assertEqual(result.errorType, "file", "missing file error type");

  const formData = gscFormData();
  formData.set("csv_file", "not-a-file");
  result = await actions.importGscCsvEvidenceAction(formData);
  assertEqual(result.ok, false, "non-File rejected");
  assertEqual(result.errorType, "file", "non-File error type");

  result = await actions.importGscCsvEvidenceAction(gscFormData({ csvFile: new File([""], "empty.csv") }));
  assertEqual(result.ok, false, "empty file rejected");
  assertEqual(result.errorType, "file", "empty file error type");
}

async function testOversizedFileRejectedBeforeText() {
  class ThrowingLargeFile extends File {
    async text() {
      throw new Error("text should not be called");
    }
  }

  const file = new ThrowingLargeFile(["x".repeat(GSC_CSV_MAX_BYTES + 1)], "large.csv");
  const result = await actions.importGscCsvEvidenceAction(gscFormData({ csvFile: file }));
  assertEqual(result.ok, false, "oversized file rejected");
  assertEqual(result.errorType, "file", "oversized file error type");
  assert(result.message.includes("exceeds"), "oversized message should be safe");
}

async function testGscDelegationAndSuccessMapping() {
  let call;
  const result = await withServices({
    async importGscCsvEvidence(input) {
      call = input;
      return gscSuccessResult();
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData({ sourceFileName: "caller-override.csv" })));

  assertEqual(result.ok, true, "GSC success mapped");
  assertEqual(result.batchId, "22222222-2222-4222-8222-222222222222", "GSC batch ID mapped");
  assertEqual(result.counts.insertedRecordCount, 2, "GSC counts mapped");
  assertEqual(call.projectId, "11111111-1111-4111-8111-111111111111", "project_id passed");
  assertEqual(call.market, "SG", "market passed");
  assertEqual(call.language, "en", "language passed");
  assertEqual(call.reportDateStart, "2026-07-01", "report start passed");
  assertEqual(call.reportDateEnd, "2026-07-31", "report end passed");
  assertEqual(call.importName, "July GSC import", "import name passed");
  assertEqual(call.sourceFileName, "gsc-export.csv", "File.name used as sourceFileName");
  assert(!call.csvText.includes("caller-override"), "caller source_file_name override ignored");
  assert(call.csvText.includes("maid agency singapore"), "valid File read server-side");
}

async function testGscFileLevelAndErrorMapping() {
  let result = await withServices({
    async importGscCsvEvidence() {
      return gscSuccessResult({
        batchId: null,
        batchStatus: "failed",
        totalParsedRows: 0,
        validRowCount: 0,
        invalidRowCount: 0,
        insertedRecordCount: 0,
        fileErrors: ["Unsupported GSC CSV: a Query column is required."]
      });
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData()));
  assertEqual(result.ok, false, "parser file-level failure mapped as failure");
  assertEqual(result.errorType, "file", "parser failure error type");
  assertEqual(result.batchId, null, "parser failure does not invent batch");

  result = await withServices({
    async importGscCsvEvidence() {
      throw namedError("GscBatchFinalizationError", "raw db detail", {
        batchId: "batch-finalization"
      });
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData()));
  assertEqual(result.ok, false, "GSC finalization failure mapped");
  assertEqual(result.errorType, "finalization", "GSC finalization error type");
  assertEqual(result.batchId, "batch-finalization", "GSC finalization batch ID exposed");
  assert(!result.message.includes("raw db detail"), "GSC finalization raw message hidden");

  result = await withServices({
    async importGscCsvEvidence() {
      throw new Error("Authenticated user is required to import GSC evidence.");
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData()));
  assertEqual(result.errorType, "authentication", "GSC auth error mapped");

  result = await withServices({
    async importGscCsvEvidence() {
      throw Object.assign(new Error("permission denied for table evidence_records raw secret"), { code: "42501" });
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData()));
  assertEqual(result.errorType, "permission", "GSC permission error mapped");
  assert(!result.message.includes("evidence_records"), "permission raw message hidden");

  result = await withServices({
    async importGscCsvEvidence() {
      throw Object.assign(new Error("insert failed SQL detail"), { code: "XX000" });
    }
  }, () => actions.importGscCsvEvidenceAction(gscFormData()));
  assertEqual(result.errorType, "database", "GSC database error mapped");
  assert(!result.message.includes("SQL"), "database raw message hidden");
}

async function testManualCustomerAction() {
  let call;
  let result = await withServices({
    async createManualCustomerEnquiryEvidence(input) {
      call = input;
      return manualSuccessResult();
    }
  }, () => actions.createManualCustomerEnquiryEvidenceAction(manualFormData({
    sourceDate: " ",
    sourceUrl: "",
    topic: " "
  })));

  assertEqual(result.ok, true, "manual customer success mapped");
  assertEqual(result.importBatchId, "33333333-3333-4333-8333-333333333333", "manual customer batch ID mapped");
  assertEqual(result.evidenceRecordId, "44444444-4444-4444-8444-444444444444", "manual customer record ID mapped");
  assertEqual(call.projectId, "11111111-1111-4111-8111-111111111111", "manual customer project passed");
  assertEqual(call.evidenceText, "How much does a transfer helper cost?", "manual customer evidence text passed");
  assertEqual(call.sourceDate, null, "blank source date becomes null");
  assertEqual(call.sourceUrl, null, "blank source URL becomes null");
  assertEqual(call.topic, null, "blank topic becomes null");
  assert(!("imported_by" in call), "manual customer does not pass imported_by");
  assert(!("dedupe_hash" in call), "manual customer does not pass dedupe_hash");

  result = await withServices({
    async createManualCustomerEnquiryEvidence() {
      throw namedError("DuplicateEvidenceError", "duplicate raw", {
        existingEvidenceRecordId: "existing-record"
      });
    }
  }, () => actions.createManualCustomerEnquiryEvidenceAction(manualFormData()));
  assertEqual(result.errorType, "duplicate", "manual customer duplicate mapped");
  assertEqual(result.existingEvidenceRecordId, "existing-record", "manual customer duplicate ID mapped");

  result = await withServices({
    async createManualCustomerEnquiryEvidence() {
      throw namedError("EvidenceValidationError", "sourceDate must be a valid ISO date in YYYY-MM-DD format.");
    }
  }, () => actions.createManualCustomerEnquiryEvidenceAction(manualFormData()));
  assertEqual(result.errorType, "validation", "manual customer validation mapped");
  assert(result.message.includes("sourceDate"), "manual customer safe validation message preserved");
}

async function testManualCompetitorAction() {
  let call;
  let result = await withServices({
    async createManualCompetitorTopicEvidence(input) {
      call = input;
      return manualSuccessResult({
        importBatchId: "55555555-5555-4555-8555-555555555555",
        evidenceRecordId: "66666666-6666-4666-8666-666666666666"
      });
    }
  }, () => actions.createManualCompetitorTopicEvidenceAction(manualFormData({ evidenceText: "Competitor writes about transfer helpers" })));

  assertEqual(result.ok, true, "manual competitor success mapped");
  assertEqual(result.importBatchId, "55555555-5555-4555-8555-555555555555", "manual competitor batch ID mapped");
  assertEqual(call.evidenceText, "Competitor writes about transfer helpers", "manual competitor evidence text passed");

  result = await withServices({
    async createManualCompetitorTopicEvidence() {
      throw namedError("DuplicateEvidenceError", "duplicate raw");
    }
  }, () => actions.createManualCompetitorTopicEvidenceAction(manualFormData()));
  assertEqual(result.errorType, "duplicate", "manual competitor duplicate mapped");

  result = await withServices({
    async createManualCompetitorTopicEvidence() {
      throw Object.assign(new Error("permission denied for table evidence_records"), { code: "42501" });
    }
  }, () => actions.createManualCompetitorTopicEvidenceAction(manualFormData()));
  assertEqual(result.errorType, "permission", "manual competitor permission mapped");
  assert(!result.message.includes("evidence_records"), "manual competitor permission detail hidden");
}

function testArchitecture() {
  const modulePath = join(root, "src", "features", "evidence", "actions.ts");
  const source = readFileSync(modulePath, "utf8");
  const exportNames = Object.keys(actions).sort();
  assertEqual(JSON.stringify(exportNames), JSON.stringify([
    "createManualCompetitorTopicEvidenceAction",
    "createManualCustomerEnquiryEvidenceAction",
    "importGscCsvEvidenceAction"
  ].sort()), "only intended actions exported");
  assert(source.startsWith('"use server";'), "action module starts with use server directive");
  assert(!source.includes("createSupabaseServiceClient"), "action module does not import service-role client");
  assert(!source.includes("createSupabaseServerClient"), "action module does not create Supabase server client");
}

try {
  testArchitecture();
  await testGscMissingAndInvalidFiles();
  await testOversizedFileRejectedBeforeText();
  await testGscDelegationAndSuccessMapping();
  await testGscFileLevelAndErrorMapping();
  await testManualCustomerAction();
  await testManualCompetitorAction();
  console.log("Evidence action checks passed.");
} finally {
  resetServices();
  process.env.NODE_ENV = originalNodeEnv;
}
