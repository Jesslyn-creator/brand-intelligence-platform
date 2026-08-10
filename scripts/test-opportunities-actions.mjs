import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.opportunities.supabaseClientFactory");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const actions = await import(pathToFileURL(join(root, "src", "features", "opportunities", "actions.ts")).href);
const validation = await import(pathToFileURL(join(root, "src", "features", "opportunities", "validation.ts")).href);

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_A = "80000000-0000-4000-8000-000000000001";
const EVIDENCE_B = "80000000-0000-4000-8000-000000000003";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createForm(overrides = {}) {
  const form = new FormData();
  const values = {
    project_id: PROJECT_A,
    topic: "Transfer helper cost",
    market: "SG",
    language: "en",
    intent: "recommendation",
    evidence_record_ids: [EVIDENCE_A],
    ...overrides
  };

  for (const [key, value] of Object.entries(values)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else {
      form.set(key, value);
    }
  }
  return form;
}

function createMockSupabase({ user = { id: "22222222-2222-4222-8222-222222222222" }, authError = null, rpcResults = [] } = {}) {
  const calls = [];
  const remainingResults = [...rpcResults];
  return {
    calls,
    auth: {
      async getUser() {
        calls.push({ kind: "auth.getUser" });
        return { data: { user }, error: authError };
      }
    },
    async rpc(fn, args) {
      calls.push({ kind: "rpc", fn, args });
      const result = remainingResults.shift();
      if (!result) throw new Error(`No mocked RPC result for ${fn}`);
      return result;
    },
    from(table) {
      calls.push({ kind: "from", table });
      return new MockQuery(table, calls, remainingResults);
    }
  };
}

class MockQuery {
  constructor(table, calls, results) {
    this.table = table;
    this.calls = calls;
    this.results = results;
    this.filters = [];
    this.inFilters = [];
    this.selection = null;
    this.orderValue = null;
    this.limitValue = null;
  }

  select(selection) {
    this.selection = selection;
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

  insert() {
    throw new Error(`Unexpected direct insert into ${this.table}`);
  }

  then(resolve, reject) {
    const operation = {
      kind: "query",
      table: this.table,
      filters: this.filters,
      inFilters: this.inFilters,
      selection: this.selection,
      order: this.orderValue,
      limit: this.limitValue
    };
    this.calls.push(operation);
    const result = this.results.shift();
    if (!result) throw new Error(`No mocked query result for ${this.table}`);
    return Promise.resolve(result).then(resolve, reject);
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

function rpcCalls(client) {
  return client.calls.filter((call) => call.kind === "rpc");
}

function authCalls(client) {
  return client.calls.filter((call) => call.kind === "auth.getUser");
}

function duplicateRows() {
  return [
    {
      id: "90000000-0000-4000-8000-000000000001",
      topic: "Transfer helper cost",
      normalized_topic: "transfer helper cost",
      status: "new",
      market: "SG",
      language: "en",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z"
    }
  ];
}

function okRows(data) {
  return { data, error: null };
}

function okRpc(id = "99000000-0000-4000-8000-000000000001") {
  return { data: id, error: null };
}

{
  const client = createMockSupabase({ user: null });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm()));
  assert(result.kind === "auth_error", "unauthenticated user returns auth_error");
  assert(authCalls(client).length === 1, "auth is checked once on unauthenticated path");
  assert(rpcCalls(client).length === 0, "unauthenticated path does not call RPC");
  assert(client.calls.every((call) => call.kind !== "from"), "unauthenticated path does not perform duplicate lookup");
}

for (const [label, form] of [
  ["missing project", createForm({ project_id: null })],
  ["invalid project UUID", createForm({ project_id: "not-a-uuid" })],
  ["empty topic", createForm({ topic: " " })],
  ["invalid intent", createForm({ intent: "urgent" })],
  ["no evidence IDs", createForm({ evidence_record_ids: [] })],
  ["malformed evidence ID", createForm({ evidence_record_ids: ["not-a-uuid"] })],
  ["duplicate evidence IDs", createForm({ evidence_record_ids: [EVIDENCE_A, EVIDENCE_A] })],
  ["too many evidence IDs", createForm({ evidence_record_ids: Array.from({ length: validation.maxCreateEvidenceRecordIds() + 1 }, (_, index) => `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`) })]
]) {
  const client = createMockSupabase();
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(form));
  assert(result.kind === "validation_error", `${label} returns validation_error`);
  assert(rpcCalls(client).length === 0, `${label} does not call RPC`);
}

{
  const client = createMockSupabase({ rpcResults: [okRows(duplicateRows())] });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm()));
  assert(result.kind === "duplicate_warning", "duplicate without ack returns warning");
  assert(rpcCalls(client).length === 0, "duplicate without ack does not call create RPC");
  assert(result.duplicates.length === 1, "duplicate warning returns duplicate metadata");
  assert(Object.keys(result.duplicates[0]).sort().join(",") === "id,language,market,status,topic", "duplicate metadata is allowlisted");
}

{
  const client = createMockSupabase({ rpcResults: [okRows(duplicateRows()), okRpc()] });
  const form = createForm({ duplicate_warning_ack: "true" });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(form));
  assert(result.kind === "created", "duplicate with explicit true ack creates opportunity");
  assert(rpcCalls(client).at(-1).fn === "create_prompt_opportunity_with_evidence", "acknowledged duplicate calls create RPC");
}

{
  const client = createMockSupabase({ rpcResults: [okRows(duplicateRows())] });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm({ duplicate_warning_ack: "yes" })));
  assert(result.kind === "duplicate_warning", "non-explicit ack value is not treated as acknowledged");
  assert(rpcCalls(client).length === 0, "non-explicit ack does not call create RPC after warning");
}

{
  const client = createMockSupabase({ rpcResults: [okRows([]), okRpc()] });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm({ evidence_record_ids: [EVIDENCE_A, EVIDENCE_B] })));
  const createCall = rpcCalls(client).at(-1);
  assert(result.kind === "created" && result.opportunityId === "99000000-0000-4000-8000-000000000001", "successful RPC returns opportunityId");
  assert(createCall.fn === "create_prompt_opportunity_with_evidence", "only approved create RPC is called");
  assert(createCall.args.target_project_id === PROJECT_A, "project maps to target_project_id");
  assert(createCall.args.target_topic === "Transfer helper cost", "topic maps to target_topic");
  assert(createCall.args.target_market === "SG", "market maps to target_market");
  assert(createCall.args.target_language === "en", "language maps to target_language");
  assert(createCall.args.target_intent === "recommendation", "intent maps to target_intent");
  assert(createCall.args.target_evidence_record_ids.join(",") === `${EVIDENCE_A},${EVIDENCE_B}`, "evidence IDs map exactly once");
  assert(!("created_by" in createCall.args) && !("linked_by" in createCall.args) && !("status" in createCall.args) && !("final_priority" in createCall.args), "caller-controlled DB fields are not forwarded");
}

{
  const form = createForm({ created_by: "attacker", status: "approved", final_priority: "high", opportunity_id: "fake" });
  const client = createMockSupabase({ rpcResults: [okRows([]), okRpc()] });
  await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(form));
  const args = rpcCalls(client).at(-1).args;
  assert(!Object.keys(args).some((key) => ["created_by", "status", "final_priority", "opportunity_id"].includes(key)), "unknown and forbidden form fields are ignored");
}

{
  const client = createMockSupabase({ rpcResults: [okRows([]), { data: null, error: { code: "42501", message: "permission denied for table prompt_opportunities" } }] });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm()));
  assert(result.kind === "permission_error", "permission-like RPC error maps safely");
  assert(!result.message.includes("prompt_opportunities"), "permission message does not leak table name");
}

{
  const client = createMockSupabase({ rpcResults: [okRows([]), { data: null, error: { code: "P0001", message: "One or more evidence records were not found for the project." } }] });
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm()));
  assert(result.kind === "database_error", "generic RPC error maps to database_error");
  assert(!result.message.includes("evidence records were not found"), "database error does not leak raw RPC message");
}

{
  const client = createMockSupabase({ rpcResults: [okRows([])] });
  client.rpc = async (fn, args) => {
    client.calls.push({ kind: "rpc", fn, args });
    if (fn === "create_prompt_opportunity_with_evidence") throw new Error("boom");
    return okRows([]);
  };
  const result = await withMockClient(client, () => actions.createPromptOpportunityFromEvidenceAction(createForm()));
  assert(result.kind === "unknown_error", "unexpected JS exception maps to unknown_error");
  assert(!result.message.includes("boom"), "unknown error does not leak thrown message");
}

const actionSource = readFileSync(join(root, "src", "features", "opportunities", "actions.ts"), "utf8");
assert(actionSource.includes('"use server"'), "action module must be a server action module");
assert(!actionSource.includes("createSupabaseServiceClient"), "action must not import service-role client");
assert(!actionSource.includes('from("prompt_opportunities").insert') && !actionSource.includes("from('prompt_opportunities').insert"), "action must not directly insert opportunities");
assert(!actionSource.includes('from("prompt_opportunity_evidence").insert') && !actionSource.includes("from('prompt_opportunity_evidence').insert"), "action must not directly insert opportunity evidence links");
assert(actionSource.includes('rpc("create_prompt_opportunity_with_evidence"'), "action must use the approved RPC mutation path");
assert(!actionSource.includes("globalThis"), "action must not expose a production test seam");

process.env.NODE_ENV = originalNodeEnv;
console.log("opportunities action tests passed");

