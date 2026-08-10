import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.opportunities.supabaseClientFactory");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const validation = await import(pathToFileURL(join(root, "src", "features", "opportunities", "validation.ts")).href);
const queries = await import(pathToFileURL(join(root, "src", "features", "opportunities", "queries.server.ts")).href);

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";

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
    this.filters = [];
    this.inFilters = [];
    this.selection = null;
    this.orderValue = null;
    this.limitValue = null;
  }

  select(selection) {
    this.selection = selection;
    if (!this.action) this.action = "select";
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

  order(column, options) {
    this.orderValue = { column, options };
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  then(resolve, reject) {
    return this.resolve("then").then(resolve, reject);
  }

  resolve(terminal) {
    const operation = {
      kind: "query",
      table: this.table,
      action: this.action,
      filters: this.filters,
      inFilters: this.inFilters,
      selection: this.selection,
      order: this.orderValue,
      limit: this.limitValue,
      terminal
    };
    this.calls.push(operation);

    const result = this.results.shift();
    if (!result) throw new Error(`No mocked result for ${this.table}.${this.action}.${terminal}`);
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

function queryCalls(client, table) {
  return client.calls.filter((call) => call.kind === "query" && (!table || call.table === table));
}

function fromCalls(client, table) {
  return client.calls.filter((call) => call.kind === "from" && (!table || call.table === table));
}

function filterValue(call, column) {
  return call.filters.find((filter) => filter.column === column)?.value;
}

function inFilterValue(call, column) {
  return call.inFilters.find((filter) => filter.column === column)?.values;
}

function opportunityRow(overrides = {}) {
  return {
    id: "opportunity-1",
    topic: "Transfer helper cost",
    normalized_topic: "transfer helper cost",
    status: "new",
    final_priority: null,
    market: "SG",
    language: "en",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-02T00:00:00.000Z",
    ...overrides
  };
}

function okRows(data) {
  return { data, error: null };
}

function baseListInput(overrides = {}) {
  return {
    projectId: PROJECT_A,
    ...overrides
  };
}

assert(validation.normalizeTopicForLookup("  Transfer   Helper COST  ") === "transfer helper cost", "normalized topic trims, lowercases, and collapses repeated ASCII spaces");
assert(validation.normalizeTopicForLookup("\tTransfer\tHelper\tCost\t") === "transfer helper cost", "normalized topic collapses tabs");
assert(validation.normalizeTopicForLookup("\nTransfer\nHelper\nCost\n") === "transfer helper cost", "normalized topic collapses newlines");
assert(validation.normalizeTopicForLookup(" \tTransfer \n Helper\r\n Cost\f ") === "transfer helper cost", "normalized topic collapses mixed ordinary whitespace");
assert(validation.normalizeTopicForLookup("CAFÉ Helper") === "café helper", "normalized topic preserves normal Unicode text while lowercasing");
assert(validation.normalizeTopicForLookup("") === null, "empty normalized topic becomes null");
assert(validation.normalizeTopicForLookup(" \n\t ") === null, "whitespace-only normalized topic becomes null");
assert(validation.normalizeTopicForLookup("maid agency singapore") !== "maid agency", "normalized topic does not use fuzzy matching");

assertRejects(
  () => Promise.resolve(validation.validatePromptOpportunitiesListInput(baseListInput({ status: "invalid" }))),
  (error) => error.name === "PromptOpportunityValidationError" && error.message.includes("status"),
  "invalid status rejected"
);

assertRejects(
  () => Promise.resolve(validation.validatePromptOpportunitiesListInput(baseListInput({ priority: "urgent" }))),
  (error) => error.name === "PromptOpportunityValidationError" && error.message.includes("priority"),
  "invalid priority rejected"
);

assert(validation.validatePromptOpportunitiesListInput(baseListInput()).limit === 50, "default list limit is 50");
assert(validation.validatePromptOpportunitiesListInput(baseListInput({ limit: 250 })).limit === 100, "list limit is capped at 100");
assertRejects(
  () => Promise.resolve(validation.validatePromptOpportunitiesListInput(baseListInput({ market: " " }))),
  (error) => error.message.includes("market cannot be blank"),
  "blank market filter rejected"
);

{
  const client = createMockSupabase({ user: null, results: [] });
  await assertRejects(
    () => withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput())),
    (error) => error.message.includes("Authenticated user is required"),
    "unauthenticated user"
  );
  assert(fromCalls(client).length === 0, "unauthenticated read stops before data queries");
}

{
  const client = createMockSupabase({
    authError: new Error("auth session missing"),
    results: []
  });
  await assertRejects(
    () => withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput())),
    (error) => error.message === "auth session missing",
    "auth.getUser error"
  );
  assert(fromCalls(client).length === 0, "auth failure stops before data queries");
}

{
  const client = createMockSupabase({
    results: [
      okRows([opportunityRow(), opportunityRow({ id: "opportunity-2", status: "approved", final_priority: "high" })]),
      okRows([
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "gsc_csv" } },
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "customer_enquiry" } },
        { prompt_opportunity_id: "opportunity-2", evidence_records: { source_type: "gsc_csv" } }
      ])
    ]
  });

  const result = await withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput()));
  const opportunityQuery = queryCalls(client, "prompt_opportunities")[0];
  const summaryQuery = queryCalls(client, "prompt_opportunity_evidence")[0];

  assert(result.length === 2, "list returns opportunity rows");
  assert(filterValue(opportunityQuery, "project_id") === PROJECT_A, "projectId is always included in opportunity query");
  assert(opportunityQuery.limit === 50, "default limit applied to opportunity query");
  assert(summaryQuery.selection === "prompt_opportunity_id, evidence_records(source_type)", "summary query selects only source type evidence relation");
  assert(inFilterValue(summaryQuery, "prompt_opportunity_id").length === 2, "summary query fetches returned opportunity IDs in one query");
  assert(queryCalls(client, "prompt_opportunity_evidence").length === 1, "evidence summary avoids N+1 queries");
  assert(result[0].evidenceCount === 2, "linked evidence count is correct");
  assert(result[0].evidenceSourceTypes.join(",") === "gsc_csv,customer_enquiry", "unique source types are correct");
  assert(!("raw_record" in result[0]), "list item does not expose raw_record");
  assert(!("metrics" in result[0]), "list item does not expose metrics");
}

{
  const client = createMockSupabase({
    results: [
      okRows([opportunityRow({ id: "opportunity-filtered" })]),
      okRows([{ prompt_opportunity_id: "opportunity-filtered", evidence_records: { source_type: "competitor_topic" } }])
    ]
  });

  await withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput({
    status: "new",
    priority: "high",
    market: "SG",
    language: "en",
    limit: 10
  })));
  const opportunityQuery = queryCalls(client, "prompt_opportunities")[0];

  assert(filterValue(opportunityQuery, "status") === "new", "status filter is applied");
  assert(filterValue(opportunityQuery, "final_priority") === "high", "priority filters final_priority");
  assert(filterValue(opportunityQuery, "market") === "SG", "market filter is applied");
  assert(filterValue(opportunityQuery, "language") === "en", "language filter is applied");
  assert(opportunityQuery.limit === 10, "explicit limit is applied");
}

{
  const client = createMockSupabase({
    results: [
      okRows([
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "gsc_csv" } },
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "gsc_csv" } },
        { prompt_opportunity_id: "opportunity-2", evidence_records: { source_type: "gsc_csv" } }
      ]),
      okRows([opportunityRow({ id: "opportunity-1" }), opportunityRow({ id: "opportunity-2" })]),
      okRows([
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "gsc_csv" } },
        { prompt_opportunity_id: "opportunity-1", evidence_records: { source_type: "customer_enquiry" } },
        { prompt_opportunity_id: "opportunity-2", evidence_records: { source_type: "gsc_csv" } },
        { prompt_opportunity_id: "opportunity-2", evidence_records: { source_type: "competitor_topic" } }
      ])
    ]
  });

  const result = await withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput({ sourceType: "gsc_csv" })));
  const sourcePrefilter = queryCalls(client, "prompt_opportunity_evidence")[0];
  const opportunityQuery = queryCalls(client, "prompt_opportunities")[0];

  assert(sourcePrefilter.selection === "prompt_opportunity_id, evidence_records!inner(source_type)", "sourceType filter uses evidence join prefilter");
  assert(filterValue(sourcePrefilter, "project_id") === PROJECT_A, "sourceType prefilter is project-scoped");
  assert(filterValue(sourcePrefilter, "evidence_records.source_type") === "gsc_csv", "sourceType filter is allowlisted and applied");
  assert(sourcePrefilter.limit === 500, "sourceType prefilter is bounded");
  assert(inFilterValue(opportunityQuery, "id").join(",") === "opportunity-1,opportunity-2", "opportunity query is constrained to source-matched IDs");
  assert(result[0].evidenceCount === 2, "sourceType filter does not change total evidence count");
}

{
  const client = createMockSupabase({
    results: [
      okRows([])
    ]
  });

  const result = await withMockClient(client, () => queries.getPromptOpportunitiesList(baseListInput({ sourceType: "google_ads_search_terms_csv" })));
  assert(result.length === 0, "sourceType filter with no matches returns empty list");
  assert(queryCalls(client, "prompt_opportunities").length === 0, "no opportunity query is made when source prefilter returns no IDs");
}

{
  const client = createMockSupabase({
    results: [
      okRows([opportunityRow({
        id: "duplicate-1",
        topic: "Transfer helper cost",
        normalized_topic: "transfer helper cost",
        status: "under_review"
      })])
    ]
  });

  const duplicates = await withMockClient(client, () => queries.findNormalizedTopicDuplicates({
    projectId: PROJECT_A,
    topic: " Transfer   Helper Cost ",
    market: "SG",
    language: "en"
  }));
  const duplicateQuery = queryCalls(client, "prompt_opportunities")[0];

  assert(duplicates.length === 1, "same normalized topic duplicate is returned");
  assert(filterValue(duplicateQuery, "project_id") === PROJECT_A, "duplicate lookup is project-scoped");
  assert(filterValue(duplicateQuery, "normalized_topic") === "transfer helper cost", "duplicate lookup uses normalized topic");
  assert(filterValue(duplicateQuery, "market") === "SG", "duplicate lookup includes market");
  assert(filterValue(duplicateQuery, "language") === "en", "duplicate lookup includes language");
  assert(inFilterValue(duplicateQuery, "status").join(",") === "new,under_review,approved,exploratory", "duplicate lookup excludes terminal statuses");
}

{
  const client = createMockSupabase({
    results: [
      okRows([])
    ]
  });

  await withMockClient(client, () => queries.findNormalizedTopicDuplicates({
    projectId: PROJECT_B,
    topic: "Transfer helper cost",
    market: "MY",
    language: "ms",
    limit: 5
  }));
  const duplicateQuery = queryCalls(client, "prompt_opportunities")[0];
  assert(filterValue(duplicateQuery, "project_id") === PROJECT_B, "duplicate lookup cannot ask outside the supplied project query scope");
  assert(filterValue(duplicateQuery, "market") === "MY", "different market is queried explicitly rather than matched broadly");
  assert(filterValue(duplicateQuery, "language") === "ms", "different language is queried explicitly rather than matched broadly");
  assert(duplicateQuery.limit === 5, "duplicate lookup respects validated limit");
}

const querySource = readFileSync(join(root, "src", "features", "opportunities", "queries.server.ts"), "utf8");
const testSource = readFileSync(join(root, "scripts", "test-opportunities-read.mjs"), "utf8");
assert(querySource.includes('import "server-only"'), "queries module must be server-only");
assert(!querySource.includes("createSupabaseServiceClient"), "opportunity reads must not import service-role client");
assert(!querySource.includes("SUPABASE_SERVICE_ROLE_KEY"), "opportunity reads must not reference service-role credentials");
assert(!querySource.includes("globalThis"), "production queries module must not use a global test seam");
assert(!querySource.includes("NODE_ENV"), "production queries module must not use NODE_ENV dependency bypasses");
assert(testSource.includes("TEST_CLIENT_FACTORY_SYMBOL"), "authenticated Supabase dependency is supplied by the test harness, not production code");

process.env.NODE_ENV = originalNodeEnv;
console.log("opportunities read tests passed");
