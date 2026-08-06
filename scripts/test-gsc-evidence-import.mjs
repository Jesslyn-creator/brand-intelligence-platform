import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.evidence.supabaseClientFactory");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const service = await import(pathToFileURL(join(root, "src", "features", "evidence", "gsc-import.server.ts")).href);
const dedupe = await import(pathToFileURL(join(root, "src", "features", "evidence", "dedupe.ts")).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn, predicate, label) {
  try {
    await fn();
  } catch (error) {
    assert(predicate(error), `${label}: unexpected error ${error.name}: ${error.message}`);
    return error;
  }
  throw new Error(`${label}: expected rejection`);
}

function dbError(message, code) {
  return { message, code: code ?? "PGRST000" };
}

function baseInput(overrides = {}) {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    market: "SG",
    language: "en",
    sourceFileName: "gsc-export.csv",
    importName: "July GSC import",
    reportDateStart: "2026-07-01",
    reportDateEnd: "2026-07-31",
    csvText: "Query,Clicks,Impressions,CTR,Position,Page,Country,Device,Date\nmaid agency singapore,10,100,10%,2.5,/maid-agency/,Singapore,Mobile,2026-07-15",
    ...overrides
  };
}

function createMockSupabase({ user = { id: "22222222-2222-4222-8222-222222222222" }, authError = null, results }) {
  const calls = [];
  const remainingResults = [...results];
  const client = {
    calls,
    auth: {
      async getUser() {
        calls.push({ kind: "auth.getUser" });
        return { data: { user }, error: authError };
      }
    },
    from(table) {
      const query = new MockQuery(table, calls, remainingResults);
      calls.push({ kind: "from", table });
      return query;
    }
  };
  return client;
}

class MockQuery {
  constructor(table, calls, results) {
    this.table = table;
    this.calls = calls;
    this.results = results;
    this.action = null;
    this.payload = null;
    this.filters = [];
    this.inFilters = [];
    this.selection = null;
  }

  select(selection) {
    this.selection = selection;
    if (!this.action) this.action = "select";
    return this;
  }

  insert(payload) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  in(column, values) {
    this.inFilters.push({ column, values });
    return this;
  }

  single() {
    return this.resolve("single");
  }

  then(resolve, reject) {
    return this.resolve("then").then(resolve, reject);
  }

  resolve(terminal) {
    const operation = {
      kind: "query",
      table: this.table,
      action: this.action,
      payload: this.payload,
      filters: this.filters,
      inFilters: this.inFilters,
      selection: this.selection,
      terminal
    };
    this.calls.push(operation);

    const result = this.results.shift();
    if (!result) {
      throw new Error(`No mocked result for ${this.table}.${this.action}.${terminal}`);
    }

    return Promise.resolve(result);
  }
}

async function withMockClient(client, fn) {
  globalThis[TEST_CLIENT_FACTORY_SYMBOL] = () => client;
  try {
    return await fn();
  } finally {
    delete globalThis[TEST_CLIENT_FACTORY_SYMBOL];
  }
}

function queryCalls(client, table, action) {
  return client.calls.filter((call) => call.kind === "query" && call.table === table && (!action || call.action === action));
}

function fromCalls(client, table) {
  return client.calls.filter((call) => call.kind === "from" && (!table || call.table === table));
}

function assertFinalizedCountInvariant(client, label) {
  const batchInsert = queryCalls(client, "evidence_import_batches", "insert")[0];
  const finalization = queryCalls(client, "evidence_import_batches", "update").at(-1);
  assert(batchInsert, `${label}: expected batch insert`);
  assert(finalization, `${label}: expected batch finalization`);
  const rowCount = batchInsert.payload.row_count;
  const successful = finalization.payload.successful_record_count ?? 0;
  const duplicate = finalization.payload.duplicate_record_count ?? 0;
  const failed = finalization.payload.failed_record_count ?? 0;
  assert(rowCount === successful + duplicate + failed, `${label}: finalized counts must add up to row_count`);
}

function batchResult(id = "batch-1") {
  return { data: { id }, error: null };
}

function lookupResult(rows = []) {
  return { data: rows, error: null };
}

function okResult() {
  return { data: null, error: null };
}

async function gscHash(overrides = {}) {
  return dedupe.gscEvidenceDedupeHash({
    sourceType: "gsc_csv",
    query: "maid agency singapore",
    page: "/maid-agency/",
    country: "Singapore",
    device: "Mobile",
    rowDate: "2026-07-15",
    reportDateStart: "2026-07-01",
    reportDateEnd: "2026-07-31",
    market: "SG",
    language: "en",
    ...overrides
  });
}

{
  const client = createMockSupabase({ authError: new Error("not authenticated"), results: [] });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput({
      projectId: "not-a-uuid",
      csvText: "Query, query\nfirst,second"
    }))),
    (error) => error.message === "not authenticated",
    "unauthenticated import"
  );
  assert(fromCalls(client).length === 0, "Unauthenticated import must stop before validation, parsing, and database work");
}

{
  const client = createMockSupabase({ results: [] });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput({ reportDateStart: "" }))),
    (error) => error.name === "GscImportValidationError" && error.message.includes("reportDateStart is required"),
    "missing reportDateStart"
  );
  assert(fromCalls(client).length === 0, "Invalid reportDateStart must not create database work after auth");
}

{
  const client = createMockSupabase({ results: [] });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput({ reportDateEnd: "2026-02-30" }))),
    (error) => error.name === "GscImportValidationError" && error.message.includes("reportDateEnd must be a valid ISO date"),
    "impossible reportDateEnd"
  );
  assert(fromCalls(client).length === 0, "Invalid reportDateEnd must not create database work after auth");
}

{
  const client = createMockSupabase({ results: [] });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput({ reportDateStart: "2026-08-01", reportDateEnd: "2026-07-31" }))),
    (error) => error.name === "GscImportValidationError" && error.message.includes("on or before"),
    "start after end"
  );
  assert(fromCalls(client).length === 0, "Invalid report range must not create database work after auth");
}

{
  const client = createMockSupabase({ results: [] });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText: "Query, query\nfirst,second" })));
  assert(result.batchId === null, "File-level parser error must not create a batch");
  assert(result.fileErrors.some((message) => message.includes("Duplicate normalized header: query")), "File-level parser error should be returned");
  assert(fromCalls(client).length === 0, "File-level parser error must not create database work after auth");
}

{
  const batchError = dbError("batch insert failed", "42501");
  const client = createMockSupabase({
    results: [{ data: null, error: batchError }]
  });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput())),
    (error) => error.name === "GscImportDatabaseError"
      && error.batchId === null
      && error.cause === batchError,
    "batch creation failure"
  );
  assert(queryCalls(client, "evidence_records", "select").length === 0, "Batch creation failure must not run duplicate lookup");
  assert(queryCalls(client, "evidence_records", "insert").length === 0, "Batch creation failure must not insert evidence");
}

{
  const client = createMockSupabase({
    results: [batchResult("batch-valid"), lookupResult([]), okResult(), okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput()));
  const batchInsert = queryCalls(client, "evidence_import_batches", "insert")[0];
  const recordInsert = queryCalls(client, "evidence_records", "insert")[0];
  const finalization = queryCalls(client, "evidence_import_batches", "update")[0];

  assert(result.batchId === "batch-valid", "Valid import should return batch id");
  assert(result.batchStatus === "completed", "Full success should complete");
  assert(batchInsert.payload.imported_by === "22222222-2222-4222-8222-222222222222", "imported_by must come from authenticated user");
  assert(batchInsert.payload.source_type === "gsc_csv", "Batch source type must be gsc_csv");
  assert(batchInsert.payload.source_date_start === "2026-07-01", "Batch report start must be persisted");
  assert(batchInsert.payload.source_date_end === "2026-07-31", "Batch report end must be persisted");
  assert(recordInsert.payload.source_type === "gsc_csv", "Record source type must be gsc_csv");
  assert(recordInsert.payload.source_date === "2026-07-15", "Row-level date must be stored separately");
  assert(recordInsert.payload.source_url === "/maid-agency/", "Page must persist as source URL");
  assert(recordInsert.payload.metrics.query === "maid agency singapore", "Known metrics must persist");
  assert(recordInsert.payload.metrics.clicks === 10, "Clicks metric must persist");
  assert(recordInsert.payload.metrics.impressions === 100, "Impressions metric must persist");
  assert(recordInsert.payload.metrics.ctr === 0.1, "CTR metric must persist");
  assert(recordInsert.payload.metrics.position === 2.5, "Position metric must persist");
  assert(!("unknown" in recordInsert.payload.metrics), "Unknown metrics must not persist");
  assert(recordInsert.payload.raw_record.report_date_start === "2026-07-01", "Raw allowlist must include report start");
  assert(recordInsert.payload.raw_record.report_date_end === "2026-07-31", "Raw allowlist must include report end");
  assert(recordInsert.payload.raw_record.data_row_number === 1, "Raw allowlist must include data row number");
  assert(!("Unexpected Column" in recordInsert.payload.raw_record), "Unknown columns must not persist to raw_record");
  assert(finalization.payload.import_status === "completed", "Full success finalization status");
  assert(finalization.payload.successful_record_count === 1, "Full success inserted count");
  assert(finalization.payload.duplicate_record_count === 0, "Full success duplicate count");
  assert(finalization.payload.failed_record_count === 0, "Full success failed count");
  assertFinalizedCountInvariant(client, "full success");
}

{
  const csvText = "Query,Clicks\nvalid query,1\n,2";
  const client = createMockSupabase({
    results: [batchResult("batch-invalid"), lookupResult([]), okResult(), okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText })));
  const finalization = queryCalls(client, "evidence_import_batches", "update")[0];

  assert(result.batchStatus === "partial", "Inserted plus invalid rows should be partial");
  assert(result.invalidRowCount === 1, "Parser-invalid row count should be returned");
  assert(result.failedRecordCount === 1, "Parser-invalid rows count as failed records");
  assert(result.rowFailures.some((failure) => failure.failureType === "invalid" && failure.dataRowNumber === 2), "Parser-invalid row failure should be returned");
  assert(queryCalls(client, "evidence_records", "insert").length === 1, "Parser-invalid rows must not be inserted");
  assert(finalization.payload.failed_record_count === 1, "Parser-invalid count must be finalized");
  assertFinalizedCountInvariant(client, "inserted plus parser invalid");
}

{
  const csvText = "Query,Clicks\n,1\n,2";
  const client = createMockSupabase({
    results: [batchResult("batch-all-invalid"), okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText })));
  const finalization = queryCalls(client, "evidence_import_batches", "update")[0];

  assert(result.batchStatus === "failed", "All invalid rows should fail");
  assert(result.failedRecordCount === 2, "All invalid rows count as failed");
  assert(queryCalls(client, "evidence_records", "select").length === 0, "All invalid rows should skip duplicate lookup");
  assert(queryCalls(client, "evidence_records", "insert").length === 0, "All invalid rows should not insert");
  assert(finalization.payload.import_status === "failed", "All invalid status finalized");
  assertFinalizedCountInvariant(client, "all invalid");
}

{
  const csvText = "Query,Clicks,Page,Country,Device\nsame query,1,/same,Singapore,Mobile\nsame query,2,/same,Singapore,Mobile";
  const client = createMockSupabase({
    results: [batchResult("batch-in-file-dup"), lookupResult([]), okResult(), okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText })));
  const lookup = queryCalls(client, "evidence_records", "select")[0];

  assert(result.batchStatus === "partial", "Inserted plus in-file duplicate should be partial");
  assert(result.duplicateRecordCount === 1, "In-file duplicate should count as duplicate");
  assert(lookup.inFilters[0].values.length === 1, "In-file duplicate later occurrence must not be looked up");
  assert(queryCalls(client, "evidence_records", "insert").length === 1, "In-file duplicate later occurrence must not be inserted");
  assertFinalizedCountInvariant(client, "inserted plus duplicate");
}

{
  const existingHash = await gscHash();
  const client = createMockSupabase({
    results: [batchResult("batch-db-dup"), lookupResult([{ dedupe_hash: existingHash }]), okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput()));

  assert(result.batchStatus === "completed", "All DB duplicates should complete");
  assert(result.insertedRecordCount === 0, "Existing DB duplicate should not insert");
  assert(result.duplicateRecordCount === 1, "Existing DB duplicate should count");
  assert(queryCalls(client, "evidence_records", "insert").length === 0, "Existing DB duplicate should skip insert");
  assertFinalizedCountInvariant(client, "all duplicate");
}

{
  const client = createMockSupabase({
    results: [batchResult("batch-race"), lookupResult([]), { data: null, error: dbError("duplicate key", "23505") }, okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput()));

  assert(result.batchStatus === "completed", "All duplicate race rows should complete");
  assert(result.duplicateRecordCount === 1, "23505 race should count as duplicate");
  assert(result.failedRecordCount === 0, "23505 race should not count as failed");
  assert(result.rowFailures[0].failureType === "duplicate", "23505 race should be classified as duplicate");
}

{
  const rlsError = dbError("permission denied for table evidence_records", "42501");
  const client = createMockSupabase({
    results: [batchResult("batch-rls"), { data: null, error: rlsError }, okResult()]
  });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput())),
    (error) => error.name === "GscImportDatabaseError" && error.batchId === "batch-rls" && error.cause.message.includes("permission denied"),
    "lookup permission error"
  );
  assert(queryCalls(client, "evidence_records", "insert").length === 0, "Lookup permission error must not proceed to insert");
}

{
  const client = createMockSupabase({
    results: [batchResult("batch-db-fail"), lookupResult([]), { data: null, error: dbError("insert denied", "42501") }, okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput()));

  assert(result.batchStatus === "failed", "All DB failures should fail");
  assert(result.failedRecordCount === 1, "DB insert failure should count as failed");
  assert(result.rowFailures[0].failureType === "database_error", "Non-23505 insert error should be database_error");
  assertFinalizedCountInvariant(client, "all DB failure");
}

{
  const csvText = "Query,Clicks\ninserted row,1\nfailed row,2";
  const client = createMockSupabase({
    results: [batchResult("batch-insert-db-fail"), lookupResult([]), okResult(), { data: null, error: dbError("insert denied", "42501") }, okResult()]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText })));
  const finalization = queryCalls(client, "evidence_import_batches", "update")[0];

  assert(result.batchStatus === "partial", "Inserted plus DB failure should be partial");
  assert(result.insertedRecordCount === 1, "Inserted plus DB failure should count successful record");
  assert(result.failedRecordCount === 1, "Inserted plus DB failure should count failed record");
  assert(result.duplicateRecordCount === 0, "Inserted plus DB failure should not count duplicates");
  assert(finalization.payload.successful_record_count === 1, "Inserted plus DB failure successful count finalized");
  assert(finalization.payload.failed_record_count === 1, "Inserted plus DB failure failed count finalized");
  assert(finalization.payload.duplicate_record_count === 0, "Inserted plus DB failure duplicate count finalized");
  assertFinalizedCountInvariant(client, "inserted plus DB failure");
}

{
  const csvText = "Query,Clicks\nexisting duplicate,1\ninsert denied,2";
  const firstHash = await dedupe.gscEvidenceDedupeHash({
    sourceType: "gsc_csv",
    query: "existing duplicate",
    page: null,
    country: null,
    device: null,
    rowDate: null,
    reportDateStart: "2026-07-01",
    reportDateEnd: "2026-07-31",
    market: "SG",
    language: "en"
  });
  const client = createMockSupabase({
    results: [
      batchResult("batch-dup-fail"),
      lookupResult([{ dedupe_hash: firstHash }]),
      { data: null, error: dbError("insert denied", "42501") },
      okResult()
    ]
  });
  const result = await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText })));

  assert(result.batchStatus === "partial", "Duplicates plus DB failures with no inserts should be partial");
  assert(result.duplicateRecordCount === 1, "Existing duplicate should count");
  assert(result.failedRecordCount === 1, "DB failure should count");
  assertFinalizedCountInvariant(client, "duplicate plus DB failure");
}

{
  const client = createMockSupabase({
    results: [
      batchResult("batch-finalize-fail"),
      lookupResult([]),
      okResult(),
      { data: null, error: dbError("batch finalization failed") }
    ]
  });
  await assertRejects(
    () => withMockClient(client, () => service.importGscCsvEvidence(baseInput())),
    (error) => error.name === "GscBatchFinalizationError"
      && error.batchId === "batch-finalize-fail"
      && error.attemptedCounts.inserted === 1
      && error.attemptedCounts.status === "completed"
      && error.cause.message === "batch finalization failed"
      && error.message.includes("evidence records may already have been inserted")
      && error.message.includes("batch may remain in pending state")
      && error.message.includes("not rolled back"),
    "batch finalization failure"
  );
}

{
  const mobileHash = await gscHash({ device: "Mobile" });
  const desktopHash = await gscHash({ device: "Desktop" });
  const julyHash = await gscHash({ rowDate: null, reportDateStart: "2026-07-01", reportDateEnd: "2026-07-31" });
  const augustHash = await gscHash({ rowDate: null, reportDateStart: "2026-08-01", reportDateEnd: "2026-08-31" });
  const metricA = await gscHash({ clicks: 1, impressions: 100, ctr: 0.1, position: 2 });
  const metricB = await gscHash({ clicks: 999, impressions: 9999, ctr: 0.9, position: 8 });

  assert(mobileHash !== desktopHash, "Mobile/Desktop rows must remain distinct");
  assert(julyHash !== augustHash, "July/August report periods must remain distinct");
  assert(metricA === metricB, "Metric changes alone must not alter identity");
}

{
  const rows = Array.from({ length: 100 }, (_, index) => `boundary query ${index},${index + 1}`).join("\n");
  const results = [batchResult("batch-100-boundary"), lookupResult([]), ...Array.from({ length: 100 }, okResult), okResult()];
  const client = createMockSupabase({ results });
  await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText: `Query,Clicks\n${rows}` })));
  const lookups = queryCalls(client, "evidence_records", "select");

  assert(lookups.length === 1, "Exactly 100 hashes should create exactly one lookup call");
  assert(lookups[0].inFilters[0].values.length === 100, "Exactly 100 hash lookup chunk should contain 100 hashes");
  assertFinalizedCountInvariant(client, "100 hash lookup boundary");
}

{
  const rows = Array.from({ length: 101 }, (_, index) => `query ${index},${index + 1}`).join("\n");
  const results = [batchResult("batch-chunks"), lookupResult([]), lookupResult([]), ...Array.from({ length: 101 }, okResult), okResult()];
  const client = createMockSupabase({ results });
  await withMockClient(client, () => service.importGscCsvEvidence(baseInput({ csvText: `Query,Clicks\n${rows}` })));
  const lookups = queryCalls(client, "evidence_records", "select");
  const inserts = queryCalls(client, "evidence_records", "insert");

  assert(lookups.length === 2, "More than 100 hashes should create multiple lookup calls");
  assert(lookups[0].inFilters[0].values.length === 100, "First lookup chunk should contain 100 hashes");
  assert(lookups[1].inFilters[0].values.length === 1, "Second lookup chunk should contain remaining hash");
  assert(inserts.length === 101, "All unique rows should be inserted sequentially");
  const insertIndexes = inserts.map((insert) => client.calls.indexOf(insert));
  assert(insertIndexes.every((value, index) => index === 0 || insertIndexes[index - 1] < value), "Insert calls should be ordered deterministically");
  assertFinalizedCountInvariant(client, "101 hash lookup boundary");
}

{
  const serviceText = readFileSync(join(root, "src", "features", "evidence", "gsc-import.server.ts"), "utf8");
  const exportedNames = Object.keys(service).sort();
  assert(JSON.stringify(exportedNames) === JSON.stringify(["importGscCsvEvidence"]), "GSC import production export surface must expose only importGscCsvEvidence");
  assert(serviceText.includes("import \"server-only\""), "GSC import service must remain server-only");
  assert(!serviceText.includes("createSupabaseServiceClient"), "GSC import service must not import the service-role client");
  assert(!serviceText.includes("Promise.all"), "GSC import service must not use Promise.all across rows");
}

process.env.NODE_ENV = originalNodeEnv;
console.log("GSC evidence import checks passed.");
