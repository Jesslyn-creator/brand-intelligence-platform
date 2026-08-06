import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.cwd();
const gsc = await import(pathToFileURL(join(root, "src", "lib", "csv", "gsc.ts")).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parse(csvText, overrides = {}) {
  return gsc.parseGscCsvPreview(csvText, {
    market: "SG",
    language: "en",
    sourceFileName: "gsc-export.csv",
    ...overrides
  });
}

function assertNoFileErrors(preview, label) {
  assert(preview.fileErrors.length === 0, `${label}: expected no file errors, got ${preview.fileErrors.join("; ")}`);
}

function assertFileError(preview, expected, label) {
  assert(preview.fileErrors.some((message) => message.includes(expected)), `${label}: expected file error containing "${expected}"`);
}

function assertInvalidMessage(preview, expected, label) {
  const messages = preview.invalidRows.flatMap((row) => row.messages);
  assert(messages.some((message) => message.includes(expected)), `${label}: expected invalid message containing "${expected}"`);
}

{
  const preview = parse("Query,Clicks,Impressions,CTR,Position\ntransfer helper cost,10,\"1,000\",12.5%,3.2");
  assertNoFileErrors(preview, "standard query export");
  assert(preview.validRows.length === 1, "standard query export should have one valid row");
  const row = preview.validRows[0];
  assert(row.dataRowNumber === 1, "first parsed data row should be data row 1");
  assert(row.evidence.sourceType === "gsc_csv", "source type should be gsc_csv");
  assert(row.evidence.evidenceText === "transfer helper cost", "query should become evidence text");
  assert(row.evidence.metrics.clicks === 10, "clicks should parse");
  assert(row.evidence.metrics.impressions === 1000, "impressions should parse with thousands separator");
  assert(row.evidence.metrics.ctr === 0.125, "CTR percentage should parse to decimal");
  assert(row.evidence.metrics.position === 3.2, "position should parse as decimal");
  assert(row.evidence.sourceRecordReference === "gsc-export.csv#row-1", "source reference should use filename and data-row number");
}

{
  const quotedComma = parse("Query,Clicks\n\"helper, transfer cost\",1");
  const escapedQuote = parse("Query,Clicks\n\"helper \"\"cost\"\"\",1");
  assert(quotedComma.validRows[0].evidence.evidenceText === "helper, transfer cost", "quoted comma query should parse");
  assert(escapedQuote.validRows[0].evidence.evidenceText === "helper \"cost\"", "escaped quote query should parse");
}

{
  const preview = parse("Query,Page,Clicks\ntransfer helper cost,https://example.com/helpers,4");
  assertNoFileErrors(preview, "query plus page");
  assert(preview.validRows[0].evidence.sourceUrl === "https://example.com/helpers", "page should become source URL");
  assert(preview.validRows[0].evidence.metrics.page === "https://example.com/helpers", "page should be preserved in metrics");
}

{
  const preview = parse("Query,Page,Country,Device\nblank optionals,,,");
  assertNoFileErrors(preview, "blank optional fields");
  const evidence = preview.validRows[0].evidence;
  assert(evidence.sourceUrl === null, "blank page should become null sourceUrl");
  assert(evidence.metrics.page === null, "blank page should become null metric");
  assert(evidence.metrics.country === null, "blank country should become null");
  assert(evidence.metrics.device === null, "blank device should become null");
}

{
  const preview = parse("Query,Country,Device,Date\ntransfer helper cost,sg,DESKTOP,2026-08-06");
  assertNoFileErrors(preview, "query plus country/device/date");
  const metrics = preview.validRows[0].evidence.metrics;
  assert(metrics.country === "sg", "country should be preserved");
  assert(metrics.device === "DESKTOP", "device should be preserved");
  assert(metrics.date === "2026-08-06", "date should be preserved");
  assert(preview.validRows[0].evidence.sourceDate === "2026-08-06", "date should become sourceDate");
}

{
  const preview = parse("\uFEFF Query ,  Clicks  \ntransfer helper cost,1");
  assertNoFileErrors(preview, "BOM/header normalization");
  assert(preview.validRows.length === 1, "BOM and whitespace header normalization should work");
  assert(gsc.normalizeGscHeader("\uFEFF Query ") === "query", "header normalization should remove BOM and trim");
}

{
  assertFileError(parse("Query, query\nfirst,second"), "Duplicate normalized header: query", "duplicate normalized Query headers rejected");
  assertFileError(parse("Query,Clicks, clicks\nrow,1,2"), "Duplicate normalized header: clicks", "duplicate normalized optional headers rejected");
  assertFileError(parse("Query,Page, page\nrow,https://a.example,https://b.example"), "Duplicate normalized header: page", "duplicate normalized Page headers rejected");
}

{
  const preview = parse("Clicks,Impressions\n1,2");
  assertFileError(preview, "Query column is required", "missing Query header");
}

{
  const preview = parse("Page,Clicks\nhttps://example.com,1");
  assertFileError(preview, "Query column is required", "Pages-only export rejected");
}

{
  const preview = parse("Query,Clicks\n,1");
  assertNoFileErrors(preview, "blank query row");
  assert(preview.validRows.length === 0, "blank query should not produce valid row");
  assertInvalidMessage(preview, "Query is required", "blank query invalid");
}

{
  const preview = parse("Query,Clicks\nvalid clicks,0\ninvalid clicks,-1");
  assertNoFileErrors(preview, "clicks valid and invalid");
  assert(preview.validRows.length === 1, "valid clicks row should pass");
  assertInvalidMessage(preview, "clicks must be a non-negative integer", "negative clicks invalid");
}

{
  for (const malformed of ["1,2,3", "12,34", "1,,000"]) {
    const preview = parse(`Query,Clicks\nbad thousands,"${malformed}"`);
    assertNoFileErrors(preview, `malformed thousands separator ${malformed}`);
    assertInvalidMessage(preview, "clicks must be a non-negative integer", `malformed thousands separator ${malformed} invalid`);
  }
}

{
  const preview = parse("Query,Clicks\ndecimal clicks,1.5");
  assertNoFileErrors(preview, "decimal clicks");
  assertInvalidMessage(preview, "clicks must be a non-negative integer", "decimal clicks rejected");
}

{
  const preview = parse("Query,Impressions\nnegative impressions,-1\ncurrency impressions,$100\nscientific impressions,1e3");
  assertNoFileErrors(preview, "malformed thousands separator");
  assert(preview.invalidRows.length === 3, "additional invalid impressions variants should all be invalid");
  assertInvalidMessage(preview, "impressions must be a non-negative integer", "additional invalid impressions variants rejected");
}

{
  const preview = parse("Query,Impressions\nvalid impressions,\"1,000\"\ninvalid impressions,12.5");
  assertNoFileErrors(preview, "impressions valid and invalid");
  assert(preview.validRows[0].evidence.metrics.impressions === 1000, "valid impressions should parse");
  assertInvalidMessage(preview, "impressions must be a non-negative integer", "decimal impressions invalid");
}

{
  const percentage = parse("Query,CTR\npercent ctr,12.5%");
  const decimal = parse("Query,CTR\ndecimal ctr,0.125");
  assert(percentage.validRows[0].evidence.metrics.ctr === 0.125, "CTR percentage should parse");
  assert(decimal.validRows[0].evidence.metrics.ctr === 0.125, "CTR decimal should parse");
}

{
  const ambiguous = parse("Query,CTR\nambiguous ctr,12.5");
  const outside = parse("Query,CTR\noutside ctr,125%");
  assertInvalidMessage(ambiguous, "greater than 1 must include a percent sign", "ambiguous bare CTR rejected");
  assertInvalidMessage(outside, "CTR must resolve to a value from 0 through 1", "CTR outside 0 through 1 rejected");
}

{
  const preview = parse("Query,Position\ndecimal position,2.7\ninvalid position,0");
  assert(preview.validRows[0].evidence.metrics.position === 2.7, "decimal position should parse");
  assertInvalidMessage(preview, "position must be a positive number", "invalid position rejected");
}

{
  const valid = parse("Query,Date\niso date,2026-08-06");
  const invalid = parse("Query,Date\nambiguous date,08/06/2026");
  const impossible = parse("Query,Date\nimpossible date,2026-02-30");
  assert(valid.validRows[0].evidence.sourceDate === "2026-08-06", "ISO date should parse");
  assertInvalidMessage(invalid, "date must be an ISO date", "ambiguous date rejected");
  assertInvalidMessage(impossible, "date must be an ISO date", "impossible ISO date rejected");
}

{
  const preview = parse("Query,Clicks\n=SUM(A1:A2),1\n+plus query,1\n-minus query,1\n@handle query,1");
  assertNoFileErrors(preview, "formula-like query");
  assert(preview.validRows[0].evidence.evidenceText === "=SUM(A1:A2)", "formula-like equals query should be preserved without apostrophe prefix");
  assert(preview.validRows[1].evidence.evidenceText === "+plus query", "formula-like plus query should be preserved");
  assert(preview.validRows[2].evidence.evidenceText === "-minus query", "formula-like minus query should be preserved");
  assert(preview.validRows[3].evidence.evidenceText === "@handle query", "formula-like at query should be preserved");
}

{
  const preview = parse("Query,Clicks\n转让女佣费用,1");
  assertNoFileErrors(preview, "Unicode query");
  assert(preview.validRows[0].evidence.evidenceText === "转让女佣费用", "Unicode query should be preserved");
}

{
  const preview = parse("Query,Clicks\n\"transfer\u0000 helper\",1");
  assertNoFileErrors(preview, "control-character handling");
  assert(preview.validRows[0].evidence.evidenceText === "transfer helper", "unsafe control characters should be removed");
}

{
  const preview = parse("Query,Clicks,Extra Column\nseparate raw row,1,not persisted");
  assertNoFileErrors(preview, "raw preview separated");
  assert(preview.validRows[0].rawPreviewRow["extra column"] === "not persisted", "raw preview row should retain extra parsed data");
  assert(!("rawRecord" in preview.validRows[0].evidence), "normalized draft must not include rawRecord");
  assert(!("extra column" in preview.validRows[0].evidence.metrics), "unknown columns must not enter normalized metrics");
}

{
  const preview = parse("Query,Clicks\nvalid row,1\n,2\nsecond valid,3");
  assertNoFileErrors(preview, "mixed rows");
  assert(preview.validRows.length === 2, "mixed file should preserve valid rows");
  assert(preview.invalidRows.length === 1, "mixed file should preserve invalid rows");
  assert(preview.invalidRows[0].dataRowNumber === 2, "invalid row data number should be correct");
  assert(preview.validRows[1].dataRowNumber === 3, "later valid data row number should be correct");
  assert(preview.summary.totalRows === 3, "summary total rows should count data rows");
  assert(preview.summary.validRowCount === 2, "summary valid count should be correct");
  assert(preview.summary.invalidRowCount === 1, "summary invalid count should be correct");
}

{
  const preview = parse("Query,Clicks\n,not-a-number\n,also-bad");
  assertNoFileErrors(preview, "all-invalid rows");
  assert(preview.validRows.length === 0, "all-invalid file should have zero valid rows");
  assert(preview.invalidRows.length === 2, "all-invalid file should return invalid rows");
  assert(preview.summary.totalRows === 2, "all-invalid summary should count data rows");
  assert(preview.summary.validRowCount === 0, "all-invalid summary should count zero valid rows");
  assert(preview.summary.invalidRowCount === 2, "all-invalid summary should count invalid rows");
}

{
  const lf = parse("Query,Clicks\nlf row,1\nsecond lf row,2");
  const crlf = parse("Query,Clicks\r\ncrlf row,1\r\nsecond crlf row,2\r\n");
  const trailingBlankLines = parse("Query,Clicks\nfirst row,1\n\n\n");
  assert(lf.validRows.length === 2, "LF input should parse");
  assert(crlf.validRows.length === 2, "CRLF input should parse");
  assert(trailingBlankLines.validRows.length === 1, "trailing blank lines should be skipped");
}

{
  const preview = parse("Query,Clicks\n\"first physical line\nsecond physical line\",1\nnext,2");
  assertNoFileErrors(preview, "quoted multiline field");
  assert(preview.validRows[0].dataRowNumber === 1, "quoted multiline first row should keep ordinal data row 1");
  assert(preview.validRows[1].dataRowNumber === 2, "dataRowNumber should remain ordinal, not physical line");
  assert(preview.validRows[0].evidence.evidenceText === "first physical line\nsecond physical line", "quoted multiline field should preserve normalized newline");
}

{
  assertFileError(parse("   "), "CSV is empty", "empty file");
}

{
  const rows = Array.from({ length: gsc.GSC_CSV_MAX_DATA_ROWS }, (_, index) => `query ${index},1`).join("\n");
  const preview = parse(`Query,Clicks\n${rows}`);
  assertNoFileErrors(preview, "maximum row limit boundary");
  assert(preview.validRows.length === gsc.GSC_CSV_MAX_DATA_ROWS, "exact row limit should be accepted");
}

{
  const rows = Array.from({ length: gsc.GSC_CSV_MAX_DATA_ROWS + 1 }, (_, index) => `query ${index},1`).join("\n");
  const preview = parse(`Query,Clicks\n${rows}`);
  assertFileError(preview, "exceeds the limit", "maximum row limit");
}

{
  const preview = parse(`Query\n${"a".repeat(gsc.GSC_CSV_MAX_BYTES + 1)}`);
  assertFileError(preview, "exceeds the limit", "maximum byte limit");
}

{
  const preview = parse(`Query\n${"界".repeat(Math.ceil(gsc.GSC_CSV_MAX_BYTES / 3) + 1)}`);
  assertFileError(preview, "exceeds the limit", "multibyte Unicode byte limit");
}

{
  const preview = parse("Query,Clicks\nfilename cleanup,1", {
    sourceFileName: "  GSC\r\n导出.csv\u0000  "
  });
  assert(preview.validRows[0].evidence.sourceRecordReference === "GSC\n导出.csv#row-1", "cleaned source filename should be used only in sourceRecordReference");
  assert(preview.validRows[0].evidence.evidenceText === "filename cleanup", "source filename cleanup must not affect evidence text");
}

{
  const preview = parse("Query,Clicks\n\"unterminated,1");
  assertFileError(preview, "CSV parse error", "fatal parse error behavior");
  assert(preview.validRows.length === 0 && preview.invalidRows.length === 0, "Papa Parse structural errors reject the whole file in Stage 2A");
}

console.log("GSC CSV parser checks passed.");
