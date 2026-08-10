"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import type { RefObject } from "react";
import {
  createManualCompetitorTopicEvidenceAction,
  createManualCustomerEnquiryEvidenceAction,
  importGscCsvEvidenceAction
} from "./actions";

type ProjectOption = {
  id: string;
  projectName: string;
  market: string;
  language: string;
};

type ActionResult = Awaited<ReturnType<typeof importGscCsvEvidenceAction>>
  | Awaited<ReturnType<typeof createManualCustomerEnquiryEvidenceAction>>
  | Awaited<ReturnType<typeof createManualCompetitorTopicEvidenceAction>>;

type EvidenceImportClientProps = {
  projects: ProjectOption[];
  initialProjectId: string;
};

type TabId = "gsc" | "customer" | "competitor";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "gsc", label: "Google Search Console" },
  { id: "customer", label: "Customer Enquiry" },
  { id: "competitor", label: "Competitor Topic" }
];

export function EvidenceImportClient({ projects, initialProjectId }: EvidenceImportClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("gsc");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedFileName, setSelectedFileName] = useState("No file selected");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<TabId | null>(null);
  const [, startTransition] = useTransition();
  const pendingSubmissionRef = useRef<TabId | null>(null);
  const gscFormRef = useRef<HTMLFormElement>(null);
  const customerFormRef = useRef<HTMLFormElement>(null);
  const competitorFormRef = useRef<HTMLFormElement>(null);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId]
  );

  function submitGsc(formData: FormData) {
    runSubmission("gsc", async () => importGscCsvEvidenceAction(formData), (actionResult) => {
      if (actionResult.ok) {
        gscFormRef.current?.reset();
        setSelectedFileName("No file selected");
      }
    });
  }

  function submitCustomer(formData: FormData) {
    runSubmission("customer", async () => createManualCustomerEnquiryEvidenceAction(formData), (actionResult) => {
      if (actionResult.ok) customerFormRef.current?.reset();
    });
  }

  function submitCompetitor(formData: FormData) {
    runSubmission("competitor", async () => createManualCompetitorTopicEvidenceAction(formData), (actionResult) => {
      if (actionResult.ok) competitorFormRef.current?.reset();
    });
  }

  function runSubmission(tab: TabId, action: () => Promise<ActionResult>, onComplete: (actionResult: ActionResult) => void) {
    if (pendingSubmissionRef.current) return;
    pendingSubmissionRef.current = tab;
    setPendingSubmission(tab);
    setResult(null);

    startTransition(async () => {
      try {
        const actionResult = await action();
        if (pendingSubmissionRef.current === tab) {
          setResult(actionResult);
          onComplete(actionResult);
        }
      } catch {
        if (pendingSubmissionRef.current === tab) {
          setResult({
            ok: false,
            errorType: "unknown",
            message: "Evidence import failed. Try again later."
          } as ActionResult);
        }
      } finally {
        if (pendingSubmissionRef.current === tab) {
          pendingSubmissionRef.current = null;
          setPendingSubmission(null);
        }
      }
    });
  }

  if (!selectedProject) {
    return (
      <section className="panel stack">
        <h2>No projects available</h2>
        <p className="empty">Create a project before importing evidence.</p>
      </section>
    );
  }

  return (
    <section className="panel stack evidence-import-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Evidence import</p>
          <h2>Add source evidence</h2>
          <p className="empty">Imported evidence can later be reviewed and promoted into prompt opportunities.</p>
        </div>
        <span className="badge">{selectedProject.projectName}</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Evidence import type">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "tab active" : "tab"}
            disabled={pendingSubmission !== null}
            onClick={() => {
              if (pendingSubmission) return;
              setActiveTab(tab.id);
              setResult(null);
              setSelectedFileName("No file selected");
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <label className="stack evidence-field">
        <span>Project</span>
        <select
          name="project-selector"
          value={selectedProject.id}
          disabled={pendingSubmission !== null}
          onChange={(event) => {
            if (pendingSubmission) return;
            setSelectedProjectId(event.target.value);
            setResult(null);
            setSelectedFileName("No file selected");
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectName}
            </option>
          ))}
        </select>
      </label>

      {activeTab === "gsc" ? (
        <form key={`gsc-${selectedProject.id}`} ref={gscFormRef} action={submitGsc} className="stack evidence-form" aria-describedby="gsc-help">
          <input type="hidden" name="project_id" value={selectedProject.id} />
          <div className="inline-fields">
            <TextInput name="market" label="Market" defaultValue={selectedProject.market} required />
            <TextInput name="language" label="Language" defaultValue={selectedProject.language} required />
          </div>
          <div className="inline-fields">
            <TextInput name="report_date_start" label="Report date start" type="date" required />
            <TextInput name="report_date_end" label="Report date end" type="date" required />
          </div>
          <TextInput name="import_name" label="Import name" placeholder="Optional" />
          <label className="stack evidence-field">
            <span>CSV file</span>
            <input
              name="csv_file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "No file selected")}
            />
          </label>
          <p id="gsc-help" className="empty">
            Selected file: {selectedFileName}. Maximum size is 1 MB. This version supports English query-based Google Search Console CSV exports.
          </p>
          <button type="submit" disabled={pendingSubmission !== null}>{pendingSubmission === "gsc" ? "Importing..." : "Import GSC CSV"}</button>
        </form>
      ) : null}

      {activeTab === "customer" ? (
        <ManualEvidenceForm
          key={`customer-${selectedProject.id}`}
          formRef={customerFormRef}
          selectedProject={selectedProject}
          pendingSubmission={pendingSubmission}
          submitAction={submitCustomer}
          submitLabel="Save customer enquiry"
          pendingLabel="Saving enquiry..."
          evidenceLabel="Evidence text"
          evidencePlaceholder="Paste the customer question or enquiry text"
        />
      ) : null}

      {activeTab === "competitor" ? (
        <ManualEvidenceForm
          key={`competitor-${selectedProject.id}`}
          formRef={competitorFormRef}
          selectedProject={selectedProject}
          pendingSubmission={pendingSubmission}
          submitAction={submitCompetitor}
          submitLabel="Save competitor topic"
          pendingLabel="Saving topic..."
          evidenceLabel="Evidence text / topic"
          evidencePlaceholder="Describe the competitor topic evidence"
        />
      ) : null}

      <EvidenceResult result={result} />
    </section>
  );
}

function ManualEvidenceForm({
  formRef,
  selectedProject,
  pendingSubmission,
  submitAction,
  submitLabel,
  pendingLabel,
  evidenceLabel,
  evidencePlaceholder
}: {
  formRef: RefObject<HTMLFormElement>;
  selectedProject: ProjectOption;
  pendingSubmission: TabId | null;
  submitAction: (formData: FormData) => void;
  submitLabel: string;
  pendingLabel: string;
  evidenceLabel: string;
  evidencePlaceholder: string;
}) {
  return (
    <form ref={formRef} action={submitAction} className="stack evidence-form">
      <input type="hidden" name="project_id" value={selectedProject.id} />
      <div className="inline-fields">
        <TextInput name="market" label="Market" defaultValue={selectedProject.market} required />
        <TextInput name="language" label="Language" defaultValue={selectedProject.language} required />
      </div>
      <label className="stack evidence-field">
        <span>{evidenceLabel}</span>
        <textarea name="evidence_text" placeholder={evidencePlaceholder} required />
      </label>
      <div className="inline-fields">
        <TextInput name="source_date" label="Source date" type="date" />
        <TextInput name="source_url" label="Source URL" type="url" placeholder="Optional" />
      </div>
      <TextInput name="topic" label="Topic" placeholder="Optional" />
      <button type="submit" disabled={pendingSubmission !== null}>
        {pendingSubmission === "customer" && submitLabel === "Save customer enquiry" ? pendingLabel : null}
        {pendingSubmission === "competitor" && submitLabel === "Save competitor topic" ? pendingLabel : null}
        {pendingSubmission === null || (pendingSubmission === "gsc") ? submitLabel : null}
      </button>
    </form>
  );
}

function TextInput({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="stack evidence-field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} />
    </label>
  );
}

function EvidenceResult({ result }: { result: ActionResult | null }) {
  if (!result) return null;

  return (
    <section className={result.ok ? "result-box success" : "result-box error-box"} aria-live="polite">
      <h3>{result.ok ? "Import result" : "Import issue"}</h3>
      <p>{result.message}</p>
      {"counts" in result && result.counts ? (
        <dl className="result-grid">
          <ResultMetric label="Batch status" value={"batchStatus" in result ? result.batchStatus ?? "-" : "-"} />
          <ResultMetric label="Total parsed rows" value={result.counts.totalParsedRows} />
          <ResultMetric label="Inserted records" value={result.counts.insertedRecordCount} />
          <ResultMetric label="Duplicates" value={result.counts.duplicateRecordCount} />
          <ResultMetric label="Invalid / failed rows" value={result.counts.invalidRowCount + result.counts.failedRecordCount} />
          <ResultMetric label="Batch ID" value={"batchId" in result && result.batchId ? result.batchId : "-"} />
        </dl>
      ) : null}

      {"importBatchId" in result && result.importBatchId ? (
        <dl className="result-grid">
          <ResultMetric label="Import batch ID" value={result.importBatchId} />
          <ResultMetric label="Evidence record ID" value={"evidenceRecordId" in result && result.evidenceRecordId ? result.evidenceRecordId : "-"} />
        </dl>
      ) : null}

      {"fileErrors" in result && result.fileErrors?.length ? (
        <div className="result-details">
          <h4>File messages</h4>
          <ul>
            {result.fileErrors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {"rowFailures" in result && result.rowFailures?.length ? (
        <details className="result-details">
          <summary>Row failures ({result.rowFailures.length})</summary>
          <div className="row-failures">
            {result.rowFailures.map((failure, index) => (
              <article key={`${failure.dataRowNumber ?? "row"}-${failure.failureType}-${index}`} className="row-failure">
                <strong>Row {failure.dataRowNumber ?? "-"} - {failure.failureType}</strong>
                {failure.messages.map((message, messageIndex) => (
                  <p key={`${message}-${messageIndex}`}>{message}</p>
                ))}
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
