import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const TEST_CLIENT_FACTORY_SYMBOL = Symbol.for("brand-intelligence.evidence.supabaseClientFactory");
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_DB_URL = process.env.LOCAL_SUPABASE_DB_URL ?? null;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? readLocalJwtByRole("anon");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readLocalJwtByRole("service_role");

const ALLOWED_METRIC_KEYS = ["clicks", "country", "ctr", "date", "device", "impressions", "page", "position", "query"];
const ALLOWED_RAW_KEYS = ["clicks", "country", "ctr", "data_row_number", "date", "device", "impressions", "page", "position", "query", "report_date_end", "report_date_start", "source_record_reference"];

const service = await import(pathToFileURL(join(root, "src", "features", "evidence", "gsc-import.server.ts")).href);

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

function localClient(key, options = {}) {
  return createClient(SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    ...options
  });
}

async function assertLocalSupabaseAvailable(fetcher = fetch, supabaseUrl = SUPABASE_URL, anonKey = SUPABASE_ANON_KEY) {
  const response = await fetcher(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    }
  }).catch((error) => {
    throw new Error(`Local Supabase is not reachable at ${supabaseUrl}. Start it with: npx.cmd supabase start. Original error: ${error.message}`);
  });

  if (isReachableSupabaseGatewayStatus(response.status)) {
    return;
  }

  throw new Error(`Local Supabase responded with unexpected HTTP ${response.status}. Confirm it is healthy with: npx.cmd supabase status.`);
}

function isReachableSupabaseGatewayStatus(status) {
  return (status >= 200 && status < 300) || status === 401 || status === 403 || status === 404;
}

async function runAvailabilityProbeChecks() {
  await assertLocalSupabaseAvailable(async () => ({ status: 401, ok: false }), "http://local.test", "test-anon-key");

  await assertRejects(
    () => assertLocalSupabaseAvailable(async () => {
      throw new Error("connection refused");
    }, "http://local.test", "test-anon-key"),
    (error) => error.message.includes("not reachable") && error.message.includes("npx.cmd supabase start"),
    "connection failure availability probe"
  );

  await assertRejects(
    () => assertLocalSupabaseAvailable(async () => ({ status: 418, ok: false }), "http://local.test", "test-anon-key"),
    (error) => error.message.includes("unexpected HTTP 418") && error.message.includes("npx.cmd supabase status"),
    "unexpected HTTP availability probe"
  );
}

function readLocalJwtByRole(role) {
  const envKey = role === "anon" ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY";
  const dockerEnvPath = join(root, "supabase", ".temp", "start-secrets", "supabase_edge_runtime_important-architecture-requirement-build", "env", "docker.env");
  if (existsSync(dockerEnvPath)) {
    const discovered = readEnvFileValue(dockerEnvPath, envKey);
    if (discovered) return discovered;
  }

  const secretsDir = join(root, "supabase", ".temp", "start-secrets", "supabase_kong_important-architecture-requirement-build");
  for (let index = 0; index < 5; index += 1) {
    const secretPath = join(secretsDir, `secret-${index}`);
    if (!existsSync(secretPath)) continue;
    const token = readFileSync(secretPath, "utf8").trim();
    if (token && jwtRole(token) === role) return token;
  }
  throw new Error(`Unable to discover local Supabase ${role} key. Run npx.cmd supabase start or set the matching environment variable.`);
}

function readEnvFileValue(path, key) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    if (line.slice(0, separatorIndex) !== key) continue;
    return line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/u, "$1");
  }
  return null;
}

function jwtRole(token) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

async function directPostgresQuery(sql) {
  const tempDir = await mkdtemp(join(tmpdir(), "gsc-import-fixture-"));
  const sqlPath = join(tempDir, "query.sql");
  try {
    await writeFile(sqlPath, sql, "utf8");
    const connectionArgs = LOCAL_SUPABASE_DB_URL ? `--db-url ${LOCAL_SUPABASE_DB_URL}` : "--local";
    const command = `npx.cmd supabase db query ${connectionArgs} --file ${sqlPath}`;
    const { stdout } = await execFileAsync(
      "cmd.exe",
      ["/d", "/c", command],
      {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: tempDir,
          USERPROFILE: tempDir,
          XDG_CONFIG_HOME: tempDir,
          SUPABASE_TELEMETRY_DISABLED: "true"
        }
      }
    );
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      if (/^(DELETE|INSERT|UPDATE)\s+\d+/u.test(stdout.trim())) return [];
      throw new Error(`Local Postgres query did not return parseable JSON output. Output preview: ${stdout.slice(0, 300)}`);
    }
    return JSON.parse(stdout.slice(start, end + 1)).rows ?? [];
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  const text = String(value);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(text), `Invalid UUID fixture value: ${text}`);
  return `${sqlString(text)}::uuid`;
}

function sqlStringArray(values) {
  return `array[${values.map((value) => sqlString(value)).join(", ")}]`;
}

async function assertDirectPostgresCleanupRunsAfterFailure() {
  const name = `GSC Import Integration Cleanup Probe ${uniqueSuffix()}`;
  const inserted = await directPostgresQuery(`
    insert into public.organisations (organisation_name)
    values (${sqlString(name)})
    returning id
  `);
  const orgId = inserted[0]?.id;
  assert(orgId, "Expected direct Postgres cleanup probe organisation");

  try {
    throw new Error("intentional cleanup probe failure");
  } catch {
    await directPostgresQuery(`delete from public.organisations where id = ${sqlUuid(orgId)}`);
  }

  const rows = await directPostgresQuery(`select count(*)::int as count from public.organisations where id = ${sqlUuid(orgId)}`);
  assert(rows[0]?.count === 0, "Direct Postgres cleanup should run after failure");
}

async function withImportClient(client, fn) {
  globalThis[TEST_CLIENT_FACTORY_SYMBOL] = () => client;
  try {
    return await fn();
  } finally {
    delete globalThis[TEST_CLIENT_FACTORY_SYMBOL];
  }
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createTestUser(adminClient, email, password) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) throw error;
  return data.user;
}

async function createSignedInClient(email, password) {
  const client = localClient(SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  assert(data.user, `Expected signed-in user for ${email}`);
  return client;
}

async function setupFixtures(adminClient) {
  const suffix = uniqueSuffix();
  const password = `Password-${suffix}!`;
  const userAEmail = `gsc-import-a-${suffix}@example.test`;
  const userBEmail = `gsc-import-b-${suffix}@example.test`;
  let userA;
  let userB;

  try {
    userA = await createTestUser(adminClient, userAEmail, password);
    userB = await createTestUser(adminClient, userBEmail, password);

    const orgAName = `GSC Import Integration Org A ${suffix}`;
    const orgBName = `GSC Import Integration Org B ${suffix}`;
    const rows = await directPostgresQuery(`
      with inserted_orgs as (
        insert into public.organisations (organisation_name)
        values (${sqlString(orgAName)}), (${sqlString(orgBName)})
        returning id, organisation_name
      ),
      inserted_projects as (
        insert into public.projects (organisation_id, project_name, market, default_language)
        select
          id,
          case
            when organisation_name = ${sqlString(orgAName)} then ${sqlString(`GSC Import Integration Project A ${suffix}`)}
            else ${sqlString(`GSC Import Integration Project B ${suffix}`)}
          end,
          'SG',
          'en'
        from inserted_orgs
        returning id, organisation_id
      ),
      inserted_members as (
        insert into public.organisation_members (organisation_id, user_id)
        select
          id,
          case
            when organisation_name = ${sqlString(orgAName)} then ${sqlUuid(userA.id)}
            else ${sqlUuid(userB.id)}
          end
        from inserted_orgs
        returning organisation_id
      )
      select o.id as organisation_id, o.organisation_name, p.id as project_id
      from inserted_orgs o
      join inserted_projects p on p.organisation_id = o.id
      order by o.organisation_name
    `);

    const orgA = rows.find((row) => row.organisation_name === orgAName);
    const orgB = rows.find((row) => row.organisation_name === orgBName);
    assert(orgA && orgB, "Expected two test organisations and projects");

    return {
      suffix,
      password,
      userA,
      userB,
      userAEmail,
      userBEmail,
      orgIds: [orgA.organisation_id, orgB.organisation_id],
      projectAId: orgA.project_id,
      projectBId: orgB.project_id
    };
  } catch (error) {
    for (const userId of [userA?.id, userB?.id].filter(Boolean)) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    }
    throw error;
  }
}

async function cleanupFixtures(adminClient, fixtures) {
  if (!fixtures) return;
  const cleanupErrors = [];
  if (fixtures.orgIds?.length) {
    try {
      await directPostgresQuery(`delete from public.organisations where id = any(${sqlStringArray(fixtures.orgIds)}::uuid[])`);
    } catch (error) {
      cleanupErrors.push(error.message);
    }
  }
  for (const userId of [fixtures.userA?.id, fixtures.userB?.id].filter(Boolean)) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) cleanupErrors.push(error.message);
  }
  if (cleanupErrors.length) {
    throw new Error(`Cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}

function twoRowCsv() {
  return [
    "Query,Clicks,Impressions,CTR,Position,Page,Country,Device,Date,Unexpected Column",
    "maid agency singapore,10,100,10%,2.5,/maid-agency/,Singapore,Mobile,2026-07-15,do-not-persist",
    "transfer helper cost,8,80,10%,3.5,/transfer-helper/,Singapore,Desktop,2026-07-16,do-not-persist"
  ].join("\n");
}

function aggregateCsv(reportLabel) {
  return [
    "Query,Clicks,Impressions,CTR,Position,Page,Country,Device,Unexpected Column",
    `aggregate maid agency ${reportLabel},20,200,10%,4.5,/maid-agency/,Singapore,Mobile,do-not-persist`
  ].join("\n");
}

function deviceCsv() {
  return [
    "Query,Clicks,Impressions,CTR,Position,Page,Country,Device,Date",
    "device separation query,5,50,10%,2,/same-page/,Singapore,Mobile,2026-09-15",
    "device separation query,6,60,10%,2,/same-page/,Singapore,Desktop,2026-09-15"
  ].join("\n");
}

function largeCsv(rowCount) {
  const rows = ["Query,Clicks,Impressions,CTR,Position,Page,Country,Device"];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push(`chunked query ${index},${index + 1},${(index + 1) * 10},10%,${index + 1},/chunk-${index}/,Singapore,Mobile`);
  }
  return rows.join("\n");
}

async function importAs(client, input) {
  return withImportClient(client, () => service.importGscCsvEvidence(input));
}

async function fetchBatch(_adminClient, batchId) {
  const rows = await directPostgresQuery(`select * from public.evidence_import_batches where id = ${sqlUuid(batchId)}`);
  assert(rows.length === 1, `Expected one evidence_import_batches row for ${batchId}`);
  return rows[0];
}

async function fetchRecords(_adminClient, batchId) {
  return directPostgresQuery(`
    select *
    from public.evidence_records
    where import_batch_id = ${sqlUuid(batchId)}
    order by source_record_reference
  `);
}

function assertKeysOnly(object, allowedKeys, label) {
  const value = typeof object === "string" ? JSON.parse(object) : object;
  const actualKeys = Object.keys(value).sort();
  assert(JSON.stringify(actualKeys) === JSON.stringify([...allowedKeys].sort()), `${label}: expected allowlisted keys only, got ${actualKeys.join(", ")}`);
}

function jsonValue(object) {
  return typeof object === "string" ? JSON.parse(object) : object;
}

function dateOnly(value) {
  return typeof value === "string" ? value.slice(0, 10) : value;
}

function assertBatchCounts(batch, expected, label) {
  assert(batch.import_status === expected.status, `${label}: unexpected status ${batch.import_status}`);
  assert(batch.row_count === expected.rowCount, `${label}: unexpected row_count`);
  assert(batch.successful_record_count === expected.successful, `${label}: unexpected successful count`);
  assert(batch.duplicate_record_count === expected.duplicate, `${label}: unexpected duplicate count`);
  assert(batch.failed_record_count === expected.failed, `${label}: unexpected failed count`);
}

async function countProjectEvidence(_adminClient, projectId) {
  const rows = await directPostgresQuery(`select count(*)::int as count from public.evidence_records where project_id = ${sqlUuid(projectId)}`);
  return rows[0]?.count ?? 0;
}

async function assertFixtureCleanupDeletesOnlyFixtureRows(adminClient) {
  const suffix = uniqueSuffix();
  const fixtures = {
    orgIds: [],
    userA: await createTestUser(adminClient, `cleanup-a-${suffix}@example.test`, `Password-${suffix}!`),
    userB: await createTestUser(adminClient, `cleanup-b-${suffix}@example.test`, `Password-${suffix}!`)
  };
  try {
    const rows = await directPostgresQuery(`
      insert into public.organisations (organisation_name)
      values (${sqlString(`GSC Cleanup Org A ${suffix}`)}), (${sqlString(`GSC Cleanup Org B ${suffix}`)})
      returning id
    `);
    fixtures.orgIds = rows.map((row) => row.id);
    await cleanupFixtures(adminClient, fixtures);
    const remaining = await directPostgresQuery(`select count(*)::int as count from public.organisations where id = any(${sqlStringArray(fixtures.orgIds)}::uuid[])`);
    assert(remaining[0]?.count === 0, "Fixture cleanup should delete created organisations");
  } finally {
    await cleanupFixtures(adminClient, { ...fixtures, orgIds: [] }).catch(() => {});
  }
}

async function run() {
  await runAvailabilityProbeChecks();
  await assertLocalSupabaseAvailable();
  await assertDirectPostgresCleanupRunsAfterFailure();

  const adminClient = localClient(SUPABASE_SERVICE_ROLE_KEY);
  await assertFixtureCleanupDeletesOnlyFixtureRows(adminClient);

  let fixtures;
  try {
    fixtures = await setupFixtures(adminClient);
    const userAClient = await createSignedInClient(fixtures.userAEmail, fixtures.password);
    const userBClient = await createSignedInClient(fixtures.userBEmail, fixtures.password);

    const firstResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: twoRowCsv(),
      sourceFileName: `gsc-july-${fixtures.suffix}.csv`,
      importName: "GSC July integration import",
      reportDateStart: "2026-07-01",
      reportDateEnd: "2026-07-31"
    });
    assert(firstResult.batchStatus === "completed", "Successful import should complete");
    assert(firstResult.insertedRecordCount === 2, "Successful import should insert two rows");

    const firstBatch = await fetchBatch(adminClient, firstResult.batchId);
    assert(firstBatch.source_type === "gsc_csv", "Batch source type should be gsc_csv");
    assert(firstBatch.imported_by === fixtures.userA.id, "Batch imported_by should be user A");
    assert(dateOnly(firstBatch.source_date_start) === "2026-07-01", "Batch report start should persist");
    assert(dateOnly(firstBatch.source_date_end) === "2026-07-31", "Batch report end should persist");
    assertBatchCounts(firstBatch, { status: "completed", rowCount: 2, successful: 2, duplicate: 0, failed: 0 }, "successful import batch");

    const firstRecords = await fetchRecords(adminClient, firstResult.batchId);
    assert(firstRecords.length === 2, "Successful import should persist two evidence records");
    for (const record of firstRecords) {
      assert(record.project_id === fixtures.projectAId, "Evidence record project should be project A");
      assert(record.import_batch_id === firstResult.batchId, "Evidence record should reference batch");
      assert(record.source_type === "gsc_csv", "Evidence record source type should be gsc_csv");
      assert(record.topic === null, "GSC evidence topic should be null");
      assert(typeof record.dedupe_hash === "string" && record.dedupe_hash.length === 64, "Evidence dedupe hash should be populated");
      assertKeysOnly(record.metrics, ALLOWED_METRIC_KEYS, "metrics JSON");
      assertKeysOnly(record.raw_record, ALLOWED_RAW_KEYS, "raw_record JSON");
      assert(!("Unexpected Column" in jsonValue(record.metrics)), "Unknown CSV columns must not enter metrics");
      assert(!("Unexpected Column" in jsonValue(record.raw_record)), "Unknown CSV columns must not enter raw_record");
    }

    const maidRecord = firstRecords.find((record) => record.evidence_text === "maid agency singapore");
    assert(maidRecord, "Expected maid agency row");
    assert(dateOnly(maidRecord.source_date) === "2026-07-15", "Row-level date should persist");
    assert(maidRecord.source_url === "/maid-agency/", "Page should persist as source_url");
    assert(jsonValue(maidRecord.metrics).clicks === 10, "Clicks should persist in metrics");
    assert(jsonValue(maidRecord.raw_record).report_date_start === "2026-07-01", "Raw record should include report start");

    const duplicateResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: twoRowCsv(),
      sourceFileName: `gsc-july-duplicate-${fixtures.suffix}.csv`,
      importName: "GSC July duplicate integration import",
      reportDateStart: "2026-07-01",
      reportDateEnd: "2026-07-31"
    });
    const duplicateBatch = await fetchBatch(adminClient, duplicateResult.batchId);
    assertBatchCounts(duplicateBatch, { status: "completed", rowCount: 2, successful: 0, duplicate: 2, failed: 0 }, "duplicate import batch");
    assert((await fetchRecords(adminClient, duplicateResult.batchId)).length === 0, "Duplicate import should create no evidence records");

    const aggregateJulyResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: aggregateCsv("period"),
      sourceFileName: `gsc-aggregate-july-${fixtures.suffix}.csv`,
      importName: "GSC aggregate July integration import",
      reportDateStart: "2026-07-01",
      reportDateEnd: "2026-07-31"
    });
    const aggregateAugustResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: aggregateCsv("period"),
      sourceFileName: `gsc-aggregate-august-${fixtures.suffix}.csv`,
      importName: "GSC aggregate August integration import",
      reportDateStart: "2026-08-01",
      reportDateEnd: "2026-08-31"
    });
    const [julyAggregateRecord] = await fetchRecords(adminClient, aggregateJulyResult.batchId);
    const [augustAggregateRecord] = await fetchRecords(adminClient, aggregateAugustResult.batchId);
    assert(julyAggregateRecord.dedupe_hash !== augustAggregateRecord.dedupe_hash, "Different report periods should produce different dedupe hashes");

    const deviceResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: deviceCsv(),
      sourceFileName: `gsc-device-${fixtures.suffix}.csv`,
      importName: "GSC device integration import",
      reportDateStart: "2026-09-01",
      reportDateEnd: "2026-09-30"
    });
    const deviceRecords = await fetchRecords(adminClient, deviceResult.batchId);
    assert(deviceRecords.length === 2, "Mobile and Desktop rows should both be stored");
    assert(deviceRecords[0].dedupe_hash !== deviceRecords[1].dedupe_hash, "Mobile and Desktop hashes should differ");
    assertBatchCounts(await fetchBatch(adminClient, deviceResult.batchId), { status: "completed", rowCount: 2, successful: 2, duplicate: 0, failed: 0 }, "device import batch");

    const beforeProjectBCount = await countProjectEvidence(adminClient, fixtures.projectBId);
    await assertRejects(
      () => importAs(userAClient, {
        projectId: fixtures.projectBId,
        market: "SG",
        language: "en",
        csvText: twoRowCsv(),
        sourceFileName: `gsc-cross-project-${fixtures.suffix}.csv`,
        importName: "GSC cross project rejected import",
        reportDateStart: "2026-10-01",
        reportDateEnd: "2026-10-31"
      }),
      (error) => error.name === "GscImportDatabaseError" && !String(error.message).includes("duplicate"),
      "user A project B import"
    );
    assert((await countProjectEvidence(adminClient, fixtures.projectBId)) === beforeProjectBCount, "User A must not create project B evidence");

    const userBProjectResult = await importAs(userBClient, {
      projectId: fixtures.projectBId,
      market: "SG",
      language: "en",
      csvText: "Query,Clicks,Impressions,CTR,Position,Page,Country,Device\nproject b query,1,10,10%,1,/project-b/,Singapore,Mobile",
      sourceFileName: `gsc-project-b-${fixtures.suffix}.csv`,
      importName: "GSC project B writable by user B",
      reportDateStart: "2026-10-01",
      reportDateEnd: "2026-10-31"
    });
    assert(userBProjectResult.insertedRecordCount === 1, "User B should write project B evidence");
    const { data: projectBRowsForUserA, error: userAReadBError } = await userAClient
      .from("evidence_records")
      .select("id")
      .eq("project_id", fixtures.projectBId);
    if (userAReadBError) throw userAReadBError;
    assert(projectBRowsForUserA.length === 0, "User A should not read project B evidence");

    const largeResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: largeCsv(101),
      sourceFileName: `gsc-large-${fixtures.suffix}.csv`,
      importName: "GSC 101 row integration import",
      reportDateStart: "2026-11-01",
      reportDateEnd: "2026-11-30"
    });
    assert(largeResult.batchStatus === "completed", "101-row import should complete");
    assert(largeResult.insertedRecordCount === 101, "101-row import should insert 101 records");

    const largeDuplicateResult = await importAs(userAClient, {
      projectId: fixtures.projectAId,
      market: "SG",
      language: "en",
      csvText: largeCsv(101),
      sourceFileName: `gsc-large-duplicate-${fixtures.suffix}.csv`,
      importName: "GSC 101 row duplicate integration import",
      reportDateStart: "2026-11-01",
      reportDateEnd: "2026-11-30"
    });
    assert(largeDuplicateResult.batchStatus === "completed", "101-row duplicate import should complete");
    assert(largeDuplicateResult.insertedRecordCount === 0, "101-row duplicate import should insert no records");
    assert(largeDuplicateResult.duplicateRecordCount === 101, "101-row duplicate import should identify 101 duplicates");

    console.log("GSC import integration checks passed.");
  } finally {
    try {
      await cleanupFixtures(adminClient, fixtures);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      delete globalThis[TEST_CLIENT_FACTORY_SYMBOL];
    }
  }
}

await run();
