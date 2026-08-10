import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pageSource = read("src/app/evidence/import/page.tsx");
const componentSource = read("src/features/evidence/evidence-import-client.tsx");
const actionsSource = read("src/features/evidence/actions.ts");
const homeSource = read("src/app/page.tsx");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, text, message) {
  assert(source.includes(text), message);
}

function excludes(source, text, message) {
  assert(!source.includes(text), message);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function testRouteAndProjectContext() {
  includes(pageSource, 'import { getWorkspace } from "@/db/queries/workspace";', "Evidence Import page should reuse workspace query");
  includes(pageSource, "searchParams?.project_id", "Evidence Import page should accept project_id from current project selection");
  includes(pageSource, "<EvidenceImportClient", "Evidence Import page should render the client form component");
  includes(homeSource, "/evidence/import?project_id=", "Overview should link to the Evidence Import route with project context");
}

function testActionBoundaryUsage() {
  includes(componentSource, "importGscCsvEvidenceAction", "GSC action should be imported by UI");
  includes(componentSource, "createManualCustomerEnquiryEvidenceAction", "Customer enquiry action should be imported by UI");
  includes(componentSource, "createManualCompetitorTopicEvidenceAction", "Competitor topic action should be imported by UI");
  excludes(componentSource, "createSupabase", "UI must not create Supabase clients");
  excludes(componentSource, "supabase-js", "UI must not import Supabase browser clients");
  excludes(componentSource, "createSupabaseServiceClient", "UI must not import service-role helpers");
  excludes(componentSource, "dangerouslySetInnerHTML", "UI must not render raw HTML");
  excludes(componentSource, "localStorage", "UI must not persist CSV content in localStorage");
  excludes(componentSource, "sessionStorage", "UI must not persist CSV content in sessionStorage");
  excludes(componentSource, "console.log", "UI must not log uploaded CSV contents");
}

function testGscFormSurface() {
  for (const field of ["project_id", "market", "language", "report_date_start", "report_date_end", "import_name", "csv_file"]) {
    includes(componentSource, `name="${field}"`, `GSC form should include ${field}`);
  }
  excludes(componentSource, 'name="source_file_name"', "GSC form must not expose caller-controlled source_file_name");
  includes(actionsSource, "sourceFileName: fileResult.file.name", "Action should use File.name as sourceFileName");
  includes(componentSource, "Maximum size is 1 MB", "GSC file limit should be visible");
  includes(componentSource, "English query-based Google Search Console CSV exports", "Supported GSC export scope should be visible");
  excludes(componentSource, "parseGscCsvPreview", "UI must not parse CSV in the browser");
}

function testManualFormSurface() {
  for (const field of ["project_id", "market", "language", "evidence_text", "source_date", "source_url", "topic"]) {
    includes(componentSource, `name="${field}"`, `Manual forms should include ${field}`);
  }
  for (const forbidden of ["imported_by", "status", "dedupe_hash", "successful_record_count", "duplicate_record_count", "failed_record_count"]) {
    excludes(componentSource, `name="${forbidden}"`, `Manual forms must not expose ${forbidden}`);
  }
  includes(componentSource, "Customer Enquiry", "Customer enquiry tab should render");
  includes(componentSource, "Competitor Topic", "Competitor topic tab should render");
}

function testResultRenderingAndPendingState() {
  includes(componentSource, "pendingSubmission", "UI should track the active pending submission");
  includes(componentSource, "pendingSubmissionRef.current", "UI should synchronously block repeated submissions");
  includes(componentSource, "disabled={pendingSubmission !== null}", "Mutation controls should disable while any submission is pending");
  assert(count(componentSource, /disabled=\{pendingSubmission !== null\}/g) >= 3, "Tabs, project selector, and submit buttons should lock while pending");
  includes(componentSource, "Importing...", "GSC pending label should be visible");
  includes(componentSource, "Saving enquiry...", "Customer pending label should be visible");
  includes(componentSource, "Saving topic...", "Competitor pending label should be visible");
  includes(componentSource, "Batch status", "GSC result should show batch status");
  includes(componentSource, "Total parsed rows", "GSC result should show total parsed rows");
  includes(componentSource, "Inserted records", "GSC result should show inserted count");
  includes(componentSource, "Duplicates", "GSC result should show duplicates");
  includes(componentSource, "Invalid / failed rows", "GSC result should show invalid and failed rows");
  includes(componentSource, "Row failures", "Row failures should have a compact details area");
  includes(componentSource, "failure.failureType", "Row failures should render safe failure types");
  includes(componentSource, "failure.messages.map", "Row failures should render safe service messages");
  excludes(componentSource, "rawPreviewRow", "UI must not render raw CSV preview rows");
}

function testStateIsolation() {
  includes(componentSource, "const gscFormRef", "GSC form should have an isolated ref");
  includes(componentSource, "const customerFormRef", "Customer form should have an isolated ref");
  includes(componentSource, "const competitorFormRef", "Competitor form should have an isolated ref");
  excludes(componentSource, "const formRef = useRef", "UI must not use one shared form ref");
  includes(componentSource, "gscFormRef.current?.reset()", "GSC completion should reset only the GSC form");
  includes(componentSource, "customerFormRef.current?.reset()", "Customer completion should reset only the customer form");
  includes(componentSource, "competitorFormRef.current?.reset()", "Competitor completion should reset only the competitor form");
  includes(componentSource, "key={`gsc-${selectedProject.id}`}", "GSC form should remount when project changes");
  includes(componentSource, "key={`customer-${selectedProject.id}`}", "Customer form should remount when project changes");
  includes(componentSource, "key={`competitor-${selectedProject.id}`}", "Competitor form should remount when project changes");
  includes(componentSource, "if (pendingSubmission) return;", "Tab/project changes should be ignored while pending");
  assert(count(componentSource, /setResult\(null\)/g) >= 3, "Tab/project/submission changes should clear stale result state");
  includes(componentSource, "setSelectedFileName(\"No file selected\")", "Tab/project changes or GSC reset should clear stale selected filename");
}

testRouteAndProjectContext();
testActionBoundaryUsage();
testGscFormSurface();
testManualFormSurface();
testResultRenderingAndPendingState();
testStateIsolation();

console.log("Evidence Import UI checks passed.");
