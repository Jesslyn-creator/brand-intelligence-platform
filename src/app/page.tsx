import { Fragment } from "react";
import Link from "next/link";
import { addCompetitorBrand, saveTargetBrand } from "@/features/brands/actions";
import { createPromptSet, importPromptCsv } from "@/features/prompt-sets/actions";
import { createProject } from "@/features/projects/actions";
import { createTestRun, processRun } from "@/features/runs/actions";
import { getWorkspace } from "@/db/queries/workspace";
import { classifierConfig } from "@/lib/ai/analysis/classifier.server";
import { providerOptionMetadata } from "@/lib/ai/providers/registry.server";
import { executionLimits } from "@/lib/config/limits.server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    project_id?: string;
  };
};

function listMetadata(items: Array<{ alias?: string; domain?: string; is_primary?: boolean; active?: boolean }> | undefined, key: "alias" | "domain") {
  const active = (items ?? []).filter((item) => item.active !== false);
  if (!active.length) return "None";
  return active.map((item) => key === "domain" && item.is_primary ? `${item[key]} (primary)` : item[key]).join(", ");
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function BrandCard({ brand, role }: { brand: any; role: string }) {
  return (
    <article className="brand-card">
      <div>
        <p className="eyebrow">{role}</p>
        <h3>{brand.brand_name}</h3>
      </div>
      <dl>
        <div>
          <dt>Aliases</dt>
          <dd>{listMetadata(brand.brand_aliases, "alias")}</dd>
        </div>
        <div>
          <dt>Domains</dt>
          <dd>{listMetadata(brand.brand_domains, "domain")}</dd>
        </div>
      </dl>
    </article>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const workspace = await getWorkspace(searchParams?.project_id);

  if (!workspace.selectedProject || !workspace.organisation) {
    return (
      <main>
        <section className="topbar">
          <div>
            <p className="eyebrow">Internal MVP</p>
            <h1>Brand Intelligence Admin</h1>
          </div>
        </section>
        <section className="shell">
          <form action={createProject} className="panel stack">
            <h2>Create First Project</h2>
            <input name="organisation_id" placeholder="Organisation ID" required />
            <input name="project_name" placeholder="Project name" required />
            <input name="market" placeholder="Market" required />
            <input name="default_language" placeholder="Default language" required />
            <button type="submit">Create project</button>
          </form>
        </section>
      </main>
    );
  }

  const project = workspace.selectedProject;
  const organisation = workspace.organisation;
  const providerOptions = providerOptionMetadata();
  const limits = executionLimits();
  const classifier = classifierConfig();
  const target = workspace.targetBrand;
  const latestRun = workspace.runSummaries[0];
  const completedAnalyses = workspace.results.filter((result: any) => result.analysis).length;
  const officialCitations = workspace.results.flatMap((result: any) => result.citations).filter((citation: any) => citation.is_official_domain).length;

  return (
    <main>
      <section className="topbar">
        <div>
          <p className="eyebrow">Internal MVP</p>
          <h1>Brand Intelligence Admin</h1>
        </div>
        <form className="stack" action="/">
          <label className="stack">
            <span>Project</span>
            <select name="project_id" defaultValue={project.id}>
              {workspace.projects.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.project_name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" type="submit">Switch</button>
        </form>
      </section>

      <section className="shell">
        <aside className="side">
          <section className="panel stack">
            <h2>Project Context</h2>
            <dl className="context-list">
              <div>
                <dt>Organisation</dt>
                <dd>{organisation.organisation_name}</dd>
              </div>
              <div>
                <dt>Market</dt>
                <dd>{project.market}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{project.default_language}</dd>
              </div>
            </dl>
            <Link className="button-link" href={`/evidence/import?project_id=${project.id}`}>Import evidence</Link>
          </section>

          <form action={createProject} className="panel stack">
            <h2>Create Project</h2>
            <input type="hidden" name="organisation_id" value={organisation.id} />
            <input name="project_name" placeholder="Project name" required />
            <input name="market" placeholder="Market" required />
            <input name="default_language" placeholder="Default language" required />
            <button type="submit">Create project</button>
          </form>
        </aside>

        <section className="main">
          <section className="grid-4">
            <Metric label="Pending" value={latestRun?.pending ?? 0} />
            <Metric label="Completed" value={latestRun?.completed ?? 0} />
            <Metric label="Failed" value={latestRun?.failed ?? 0} />
            <Metric label="Current analyses" value={completedAnalyses} />
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Brand configuration</p>
                <h2>{target?.brand_name ?? "No target brand configured"}</h2>
              </div>
              <span className="badge">{workspace.competitorBrands.length} competitors</span>
            </div>
            <div className="grid-3">
              {target ? <BrandCard brand={target} role="Target" /> : null}
              {workspace.competitorBrands.map((brand: any) => (
                <BrandCard key={brand.id} brand={brand} role="Competitor" />
              ))}
            </div>
          </section>

          <section className="grid-2">
            <form action={saveTargetBrand} className="panel stack">
              <h2>Target Brand</h2>
              <input type="hidden" name="project_id" value={project.id} />
              <input type="hidden" name="organisation_id" value={organisation.id} />
              <input type="hidden" name="brand_id" value={target?.id ?? ""} />
              <input name="brand_name" placeholder="Brand name" defaultValue={target?.brand_name ?? ""} required />
              <input name="aliases" placeholder="Aliases, comma separated" defaultValue={(target?.brand_aliases ?? []).map((item: any) => item.alias).join(", ")} />
              <input name="domains" placeholder="Domains, comma separated" defaultValue={(target?.brand_domains ?? []).map((item: any) => item.domain).join(", ")} />
              <button type="submit">Save target</button>
            </form>

            <form action={addCompetitorBrand} className="panel stack">
              <h2>Add Competitor</h2>
              <input type="hidden" name="project_id" value={project.id} />
              <input type="hidden" name="organisation_id" value={organisation.id} />
              <input name="brand_name" placeholder="Competitor brand name" required />
              <input name="aliases" placeholder="Aliases, comma separated" />
              <input name="domains" placeholder="Domains, comma separated" />
              <button type="submit">Add competitor</button>
            </form>
          </section>

          <section className="grid-2">
            <form action={createPromptSet} className="panel stack">
              <h2>Prompt Set</h2>
              <input type="hidden" name="project_id" value={project.id} />
              <input name="prompt_set_name" placeholder="Prompt set name" required />
              <textarea name="description" placeholder="Description" />
              <button type="submit">Create prompt set</button>
            </form>

            <form action={importPromptCsv} className="panel stack">
              <h2>CSV Prompt Import</h2>
              <input type="hidden" name="project_id" value={project.id} />
              <input type="hidden" name="market" value={project.market} />
              <input type="hidden" name="language" value={project.default_language} />
              <select name="prompt_set_id" required>
                {workspace.promptSets.map((set: any) => (
                  <option key={set.id} value={set.id}>{set.prompt_set_name}</option>
                ))}
              </select>
              <textarea name="csv_text" placeholder="prompt_text,category,intent&#10;Which providers are recommended?,Discovery,Recommendation" required />
              <button type="submit" disabled={!workspace.promptSets.length}>Import prompts</button>
            </form>
          </section>

          <section className="grid-2">
            <form action={createTestRun} className="panel stack">
              <h2>Create Evaluation</h2>
              <input type="hidden" name="project_id" value={project.id} />
              <input type="hidden" name="market" value={project.market} />
              <input type="hidden" name="language" value={project.default_language} />
              <select name="prompt_set_id" required>
                {workspace.promptSets.map((set: any) => (
                  <option key={set.id} value={set.id}>{set.prompt_set_name}</option>
                ))}
              </select>
              <input name="run_name" placeholder="Run name" required />
              <div className="stack">
                {providerOptions.map((option) => (
                  <label key={option.id} className="provider-option">
                    <input name="providers" type="checkbox" value={option.id} />
                    <span>{option.id}</span>
                    <input name={`${option.id}_model`} placeholder={`${option.id} model`} />
                    <small>
                      Grounding {option.capabilities.supports_web_grounding ? "yes" : "no"} · Citations {option.capabilities.supports_citations ? "yes" : "no"} · Cost {option.pricing.estimate_available ? "available" : "estimate unavailable"}
                    </small>
                  </label>
                ))}
              </div>
              <input name="repetitions" type="number" min={1} max={limits.maxRepetitionsPerProvider} defaultValue={1} required />
              <input name="temperature" type="number" min={0} max={2} step={0.1} defaultValue={0.2} />
              <select name="search_context_size" defaultValue="medium">
                <option value="low">Low search context</option>
                <option value="medium">Medium search context</option>
                <option value="high">High search context</option>
              </select>
              <textarea name="system_instruction" defaultValue="Answer as a careful market research assistant. Cite sources when available." required />
              <label>
                <input name="web_search_enabled" type="checkbox" /> Enable web search
              </label>
              <p className="empty">
                Limits: {limits.maxPromptsPerEvaluation} prompts, {limits.maxProvidersPerEvaluation} providers, {limits.maxRepetitionsPerProvider} repetitions, {limits.maxAttemptsPerItem} attempts. This form submission confirms multi-provider execution.
              </p>
              <button type="submit" disabled={!workspace.promptSets.length}>Create evaluation and provider runs</button>
            </form>

            <section className="panel stack">
              <h2>Provider Run Progress</h2>
              <div className="table runs-table">
                <div className="header">Evaluation</div>
                <div className="header">Provider</div>
                <div className="header">Pending</div>
                <div className="header">Completed</div>
                <div className="header">Failed</div>
                <div className="header">Process</div>
              {workspace.runSummaries.map((run: any) => (
                  <Fragment key={run.id}>
                    <div>{run.evaluation_name}</div>
                    <div>{run.generation_provider} / {run.generation_model}</div>
                    <div>{run.pending}</div>
                    <div>{run.completed}</div>
                    <div>{run.failed}</div>
                    <div>
                      <form action={processRun}>
                        <input type="hidden" name="provider_test_run_id" value={run.id} />
                        <input type="hidden" name="batch_size" value="3" />
                        <button type="submit" disabled={run.pending + run.failed + run.running === 0}>Batch</button>
                      </form>
                    </div>
                  </Fragment>
                ))}
              </div>
            </section>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Results</p>
                <h2>Current completed analysis only</h2>
                <p className="empty">Automated classification can be imperfect. Default classifier: {classifier.provider} / {classifier.model}. Analyses include audit flags for later human review.</p>
              </div>
              <span className="badge">{officialCitations} official citations</span>
            </div>
            <div className="table results-table">
              <div className="header">Provider</div>
              <div className="header">Answer</div>
              <div className="header">Mentioned</div>
              <div className="header">Recommended</div>
              <div className="header">Confidence</div>
              <div className="header">Citations</div>
              {workspace.results.map((result: any) => (
                <Fragment key={result.response.id}>
                  <div>{result.response.generation_provider ?? "unknown"} / {result.response.generation_model ?? "-"}</div>
                  <div>{result.response.normalized_answer_text ?? result.response.answer_text ?? result.response.error_message ?? "No answer text"}</div>
                  <div>{result.analysis?.target_brand_mentioned ? "Yes" : "No"}</div>
                  <div>{result.analysis?.target_brand_recommended ? "Yes" : "No"}</div>
                  <div>{result.analysis?.confidence_score ?? "-"}</div>
                  <div>{result.citations.map((citation: any) => citation.normalized_domain).join(", ") || "None"}</div>
                </Fragment>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
