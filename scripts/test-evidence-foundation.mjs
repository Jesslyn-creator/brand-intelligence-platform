import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.evidence.supabaseClientFactory");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const validation = await import(pathToFileURL(join(root, "src", "features", "evidence", "validation.ts")).href);
const repository = await import(pathToFileURL(join(root, "src", "features", "evidence", "repository.server.ts")).href);

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

  limit(value) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    return this.resolve("maybeSingle");
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

function baseInput(overrides = {}) {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    market: "SG",
    language: "en",
    evidenceText: "How much does a transfer helper cost?",
    topic: "Transfer helper cost",
    ...overrides
  };
}

function queryCalls(client, table, action) {
  return client.calls.filter((call) => call.kind === "query" && call.table === table && (!action || call.action === action));
}

function fromCalls(client, table) {
  return client.calls.filter((call) => call.kind === "from" && (!table || call.table === table));
}

function assertInsertOrder(client, firstTable, secondTable) {
  const firstIndex = client.calls.findIndex((call) => call.kind === "query" && call.table === firstTable && call.action === "insert");
  const secondIndex = client.calls.findIndex((call) => call.kind === "query" && call.table === secondTable && call.action === "insert");
  assert(firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex, `${firstTable} must be inserted before ${secondTable}`);
}

const validCustomerEnquiry = validation.validateManualEvidenceInput({
  projectId: "11111111-1111-4111-8111-111111111111",
  evidenceKind: "manual_customer_enquiry",
  market: "SG",
  language: "en",
  evidenceText: "How much does a transfer helper cost?",
  sourceDate: "2026-08-06"
});
assert(validCustomerEnquiry.sourceType === "customer_enquiry", "Manual customer enquiries must map to customer_enquiry source_type");

const validCompetitorTopic = validation.validateManualEvidenceInput({
  projectId: "11111111-1111-4111-8111-111111111111",
  evidenceKind: "manual_competitor_topic",
  market: "SG",
  language: "en",
  evidenceText: "A competitor ranks for emergency replacement topics."
});
assert(validCompetitorTopic.sourceType === "competitor_topic", "Manual competitor topics must map to competitor_topic source_type");

await assertRejects(
  () => validation.validateManualEvidenceInput({
    projectId: "not-a-uuid",
    evidenceKind: "manual_customer_enquiry",
    market: "SG",
    language: "en",
    evidenceText: "Valid content"
  }),
  (error) => error.message.includes("projectId must be a valid UUID"),
  "invalid UUID validation"
);

await assertRejects(
  () => validation.validateManualEvidenceInput({
    projectId: "11111111-1111-4111-8111-111111111111",
    evidenceKind: "manual_customer_enquiry",
    market: "SG",
    language: "en",
    evidenceText: " "
  }),
  (error) => error.message.includes("evidenceText is required"),
  "empty evidence text validation"
);

await assertRejects(
  () => validation.validateManualEvidenceInput({
    projectId: "11111111-1111-4111-8111-111111111111",
    evidenceKind: "manual_customer_enquiry",
    market: "SG",
    language: "en",
    evidenceText: "Valid content",
    sourceDate: "2026-99-99"
  }),
  (error) => error.message.includes("sourceDate must be a valid ISO date"),
  "invalid source date validation"
);

{
  const client = createMockSupabase({ authError: new Error("not authenticated"), results: [] });
  await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (error) => error.message === "not authenticated",
    "unauthenticated user"
  );
  assert(fromCalls(client).length === 0, "Unauthenticated user must stop before database inserts");
}

{
  const client = createMockSupabase({
    results: [{ data: { id: "existing-record" }, error: null }]
  });
  await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (error) => error.name === "DuplicateEvidenceError" && error.existingEvidenceRecordId === "existing-record",
    "duplicate pre-check"
  );
  assert(fromCalls(client, "evidence_import_batches").length === 0, "Duplicate pre-check must not create a batch");
}

{
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-1" }, error: null },
      {
        data: {
          id: "record-1",
          project_id: baseInput().projectId,
          import_batch_id: "batch-1",
          source_type: "customer_enquiry",
          source_record_reference: "manual:customer_enquiry:batch-1",
          dedupe_hash: "hash-1"
        },
        error: null
      },
      { data: null, error: null }
    ]
  });

  const result = await withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput()));
  const batchInsert = queryCalls(client, "evidence_import_batches", "insert")[0];
  const recordInsert = queryCalls(client, "evidence_records", "insert")[0];
  const batchCompletion = queryCalls(client, "evidence_import_batches", "update")[0];

  assert(result.importBatchId === "batch-1", "Successful customer enquiry should return batch id");
  assert(batchInsert.payload.imported_by === "22222222-2222-4222-8222-222222222222", "Authenticated user must be used for imported_by");
  assert(batchInsert.payload.source_type === "customer_enquiry", "Customer enquiry batch must use canonical source type");
  assert(recordInsert.payload.source_type === "customer_enquiry", "Customer enquiry record must use canonical source type");
  assert(batchCompletion.payload.import_status === "completed", "Successful batch must be completed");
  assert(batchCompletion.payload.successful_record_count === 1, "Successful batch must count one record");
  assertInsertOrder(client, "evidence_import_batches", "evidence_records");
}

{
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-2" }, error: null },
      {
        data: {
          id: "record-2",
          project_id: baseInput().projectId,
          import_batch_id: "batch-2",
          source_type: "competitor_topic",
          source_record_reference: "manual:competitor_topic:batch-2",
          dedupe_hash: "hash-2"
        },
        error: null
      },
      { data: null, error: null }
    ]
  });

  await withMockClient(client, () => repository.createManualCompetitorTopicEvidence(baseInput({
    evidenceText: "Competitor topic: urgent replacement helpers"
  })));
  const batchInsert = queryCalls(client, "evidence_import_batches", "insert")[0];
  const recordInsert = queryCalls(client, "evidence_records", "insert")[0];

  assert(batchInsert.payload.source_type === "competitor_topic", "Competitor topic batch must use canonical source type");
  assert(recordInsert.payload.source_type === "competitor_topic", "Competitor topic record must use canonical source type");
  assert(typeof recordInsert.payload.dedupe_hash === "string" && recordInsert.payload.dedupe_hash.length === 64, "Competitor topic must execute dedupe hashing");
}

{
  const batchError = dbError("batch insert failed");
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: null, error: batchError }
    ]
  });

  const error = await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (caught) => caught === batchError,
    "batch insert failure"
  );
  assert(error === batchError, "Batch insert failure must preserve original database error");
  assert(fromCalls(client, "evidence_records").length === 1, "Duplicate pre-check may read evidence_records");
  assert(queryCalls(client, "evidence_records", "insert").length === 0, "Evidence insert must not be attempted after batch insert failure");
}

{
  const recordError = dbError("record insert failed");
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-3" }, error: null },
      { data: null, error: recordError },
      { data: null, error: dbError("cleanup failed") }
    ]
  });

  const error = await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (caught) => caught === recordError,
    "evidence record insert failure"
  );
  const batchFailure = queryCalls(client, "evidence_import_batches", "update")[0];
  assert(error === recordError, "Record insert failure must remain the main thrown error");
  assert(batchFailure.payload.import_status === "failed", "Record insert failure must mark batch failed");
  assert(batchFailure.payload.failed_record_count === 1, "Record insert failure must count one failed record");
}

{
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-4" }, error: null },
      { data: null, error: dbError("duplicate key", "23505") },
      { data: null, error: null },
      { data: { id: "record-race" }, error: null }
    ]
  });

  await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (error) => error.name === "DuplicateEvidenceError" && error.existingEvidenceRecordId === "record-race",
    "unique-constraint race"
  );
  const batchPartial = queryCalls(client, "evidence_import_batches", "update")[0];
  assert(batchPartial.payload.import_status === "partial", "Unique violation must mark batch partial");
  assert(batchPartial.payload.duplicate_record_count === 1, "Unique violation must count one duplicate record");
}

{
  const completionError = dbError("batch completion failed");
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-5" }, error: null },
      {
        data: {
          id: "record-5",
          project_id: baseInput().projectId,
          import_batch_id: "batch-5",
          source_type: "customer_enquiry",
          source_record_reference: "manual:customer_enquiry:batch-5",
          dedupe_hash: "hash-5"
        },
        error: null
      },
      { data: null, error: completionError }
    ]
  });

  await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (error) => error.name === "BatchFinalizationError"
      && error.message.includes("could not be marked completed")
      && error.evidenceRecord.id === "record-5"
      && error.cause === completionError,
    "batch completion update failure"
  );
}

{
  const rlsError = dbError("permission denied for table evidence_records", "42501");
  const client = createMockSupabase({
    results: [
      { data: null, error: null },
      { data: { id: "batch-6" }, error: null },
      { data: null, error: rlsError },
      { data: null, error: null }
    ]
  });

  const error = await assertRejects(
    () => withMockClient(client, () => repository.createManualCustomerEnquiryEvidence(baseInput())),
    (caught) => caught === rlsError,
    "RLS or permission error"
  );
  assert(error.name !== "DuplicateEvidenceError", "Permission errors must not be converted into duplicate errors");
}

const repositoryText = readFileSync(join(root, "src", "features", "evidence", "repository.server.ts"), "utf8");
const exportedNames = Object.keys(repository).sort();
assert(
  JSON.stringify(exportedNames) === JSON.stringify(["createManualCompetitorTopicEvidence", "createManualCustomerEnquiryEvidence"].sort()),
  "Evidence repository production exports must be limited to the two manual creation functions"
);
assert(repositoryText.includes("import \"server-only\""), "Evidence repository must remain server-only");
assert(!repositoryText.includes("createSupabaseServiceClient"), "Evidence repository must not import the service-role client");

process.env.NODE_ENV = originalNodeEnv;
console.log("Evidence foundation checks passed.");
