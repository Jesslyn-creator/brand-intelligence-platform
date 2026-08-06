import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.cwd();
const dedupe = await import(pathToFileURL(join(root, "src", "features", "evidence", "dedupe.ts")).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertSameHash(left, right, label) {
  const [leftHash, rightHash] = await Promise.all([left, right]);
  assert(leftHash === rightHash, `${label}: expected hashes to match`);
}

async function assertDifferentHash(left, right, label) {
  const [leftHash, rightHash] = await Promise.all([left, right]);
  assert(leftHash !== rightHash, `${label}: expected hashes to differ`);
}

const manualCustomer = {
  projectId: "11111111-1111-4111-8111-111111111111",
  evidenceKind: "manual_customer_enquiry",
  sourceType: "customer_enquiry",
  market: "SG",
  language: "en",
  evidenceText: "How much does a transfer helper cost?",
  topic: "Transfer helper cost",
  sourceDate: "2026-08-06",
  sourceUrl: null,
  sourceRecordReference: null,
  importName: "Manual customer enquiry",
  metrics: {},
  rawRecord: {}
};

const manualCompetitor = {
  projectId: "11111111-1111-4111-8111-111111111111",
  evidenceKind: "manual_competitor_topic",
  sourceType: "competitor_topic",
  market: "SG",
  language: "en",
  evidenceText: "Competitor topic: urgent replacement helpers",
  topic: "Urgent replacement helpers",
  sourceDate: null,
  sourceUrl: "https://example.com/topics",
  sourceRecordReference: null,
  importName: "Manual competitor topic",
  metrics: {},
  rawRecord: {}
};

{
  const customerHash = await dedupe.evidenceDedupeHash(manualCustomer);
  const competitorHash = await dedupe.evidenceDedupeHash(manualCompetitor);
  assert(customerHash === "272b20a9bd83af443dd9f4267d2c4286a22157fa66750068ffb35bb560b5b7f8", "manual customer enquiry hash fixture must remain stable");
  assert(competitorHash === "f50cabe162e0c944f0916f0dc2fad139c19feab6529a2c22b589e4f9e0edba04", "manual competitor topic hash fixture must remain stable");
}

{
  const equivalentCustomer = {
    ...manualCustomer,
    evidenceText: "  HOW   MUCH does a transfer helper cost?  ",
    topic: " transfer   helper COST "
  };
  await assertSameHash(
    dedupe.evidenceDedupeHash(manualCustomer),
    dedupe.evidenceDedupeHash(equivalentCustomer),
    "manual whitespace and casing normalization"
  );

  const emptyUrl = { ...manualCustomer, sourceUrl: "" };
  await assertSameHash(
    dedupe.evidenceDedupeHash(manualCustomer),
    dedupe.evidenceDedupeHash(emptyUrl),
    "manual empty-string sourceUrl remains equivalent to null"
  );
}

function gsc(overrides = {}) {
  return {
    sourceType: "gsc_csv",
    query: "maid agency singapore",
    page: "/maid-agency/",
    country: "Singapore",
    device: "Mobile",
    rowDate: null,
    reportDateStart: "2026-07-01",
    reportDateEnd: "2026-07-31",
    market: "SG",
    language: "en",
    ...overrides
  };
}

{
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ device: "Mobile" })), dedupe.gscEvidenceDedupeHash(gsc({ device: "Desktop" })), "GSC Mobile and Desktop rows");
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ country: "Singapore" })), dedupe.gscEvidenceDedupeHash(gsc({ country: "Malaysia" })), "GSC country dimension");
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ page: "/maid-agency/" })), dedupe.gscEvidenceDedupeHash(gsc({ page: "/maid-agency/pricing/" })), "GSC page dimension");
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ rowDate: "2026-07-01" })), dedupe.gscEvidenceDedupeHash(gsc({ rowDate: "2026-07-02" })), "GSC row date dimension");
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ reportDateStart: "2026-07-01", reportDateEnd: "2026-07-31" })), dedupe.gscEvidenceDedupeHash(gsc({ reportDateStart: "2026-08-01", reportDateEnd: "2026-08-31" })), "GSC report period dimension");
  await assertDifferentHash(dedupe.gscEvidenceDedupeHash(gsc({ rowDate: null, reportDateStart: "2026-07-01", reportDateEnd: "2026-07-31" })), dedupe.gscEvidenceDedupeHash(gsc({ rowDate: null, reportDateStart: "2026-08-01", reportDateEnd: "2026-08-31" })), "GSC July and August aggregate reports without row date");
}

{
  const base = gsc();
  await assertSameHash(dedupe.gscEvidenceDedupeHash(base), dedupe.gscEvidenceDedupeHash({ ...base, clicks: 1 }), "GSC clicks excluded from identity");
  await assertSameHash(dedupe.gscEvidenceDedupeHash(base), dedupe.gscEvidenceDedupeHash({ ...base, impressions: 100 }), "GSC impressions excluded from identity");
  await assertSameHash(dedupe.gscEvidenceDedupeHash(base), dedupe.gscEvidenceDedupeHash({ ...base, ctr: 0.5 }), "GSC CTR excluded from identity");
  await assertSameHash(dedupe.gscEvidenceDedupeHash(base), dedupe.gscEvidenceDedupeHash({ ...base, position: 2.4 }), "GSC position excluded from identity");
}

{
  await assertSameHash(
    dedupe.gscEvidenceDedupeHash(gsc({ country: "Singapore", device: "Mobile", market: "SG", language: "EN" })),
    dedupe.gscEvidenceDedupeHash(gsc({ country: " singapore ", device: " mobile ", market: "sg", language: "en" })),
    "GSC country/device/market/language casing canonicalization"
  );

  await assertSameHash(
    dedupe.gscEvidenceDedupeHash(gsc({ page: null, country: null, device: null })),
    dedupe.gscEvidenceDedupeHash(gsc({ page: "   ", country: "", device: " " })),
    "GSC blank optional fields canonicalize to null"
  );

  await assertSameHash(
    dedupe.gscEvidenceDedupeHash(gsc({ query: "  maid agency singapore\u0000 " })),
    dedupe.gscEvidenceDedupeHash(gsc({ query: "maid agency singapore" })),
    "GSC leading/trailing whitespace and unsafe controls"
  );

  const unicode = gsc({ query: "转让女佣费用 = + - @", country: "Singapore" });
  const unicodePayload = dedupe.buildGscEvidenceIdentityPayload(unicode);
  assert(unicodePayload.query === "转让女佣费用 = + - @", "GSC normal Unicode and formula-like query text must be preserved");

  await assertDifferentHash(
    dedupe.gscEvidenceDedupeHash(gsc({ page: "/maid-agency/" })),
    dedupe.gscEvidenceDedupeHash(gsc({ page: "/maid-agency" })),
    "GSC page trailing slash remains identity-significant"
  );

  await assertDifferentHash(
    dedupe.gscEvidenceDedupeHash(gsc({ reportDateStart: "2026-07-01", reportDateEnd: "2026-07-31" })),
    dedupe.gscEvidenceDedupeHash(gsc({ reportDateStart: "2026-07-02", reportDateEnd: "2026-07-31" })),
    "GSC report period start remains identity-significant"
  );
}

{
  const payloadA = {
    source_type: "gsc_csv",
    query: "maid agency singapore",
    page: "/maid-agency/",
    country: "singapore",
    device: "mobile",
    row_date: null,
    report_date_start: "2026-07-01",
    report_date_end: "2026-07-31",
    market: "sg",
    language: "en"
  };
  const payloadB = {
    language: "en",
    market: "sg",
    report_date_end: "2026-07-31",
    report_date_start: "2026-07-01",
    row_date: null,
    device: "mobile",
    country: "singapore",
    page: "/maid-agency/",
    query: "maid agency singapore",
    source_type: "gsc_csv"
  };
  await assertSameHash(
    dedupe.hashEvidenceIdentityPayload(payloadA),
    dedupe.hashEvidenceIdentityPayload(payloadB),
    "shared hash mechanism ignores property insertion order"
  );
  await assertSameHash(
    dedupe.gscEvidenceDedupeHash(gsc()),
    dedupe.gscEvidenceDedupeHash(gsc()),
    "GSC identity hash is deterministic across repeated calls"
  );
}

console.log("Evidence identity checks passed.");
