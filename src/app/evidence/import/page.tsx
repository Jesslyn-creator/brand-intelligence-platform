import Link from "next/link";
import { getWorkspace } from "@/db/queries/workspace";
import { EvidenceImportClient } from "@/features/evidence/evidence-import-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    project_id?: string;
  };
};

export default async function EvidenceImportPage({ searchParams }: PageProps) {
  const workspace = await getWorkspace(searchParams?.project_id);

  if (!workspace.selectedProject) {
    return (
      <main>
        <section className="topbar compact-topbar">
          <div>
            <p className="eyebrow">Evidence</p>
            <h1>Import Evidence</h1>
          </div>
          <Link className="button-link secondary" href="/">Overview</Link>
        </section>
        <section className="shell single-column">
          <section className="panel stack">
            <h2>No active project</h2>
            <p className="empty">Create a project before importing evidence.</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="topbar compact-topbar">
        <div>
          <p className="eyebrow">Evidence</p>
          <h1>Import Evidence</h1>
        </div>
        <Link className="button-link secondary" href={`/?project_id=${workspace.selectedProject.id}`}>Overview</Link>
      </section>

      <section className="shell single-column">
        <EvidenceImportClient
          projects={workspace.projects.map((project: any) => ({
            id: project.id,
            projectName: project.project_name,
            market: project.market,
            language: project.default_language
          }))}
          initialProjectId={workspace.selectedProject.id}
        />
      </section>
    </main>
  );
}
