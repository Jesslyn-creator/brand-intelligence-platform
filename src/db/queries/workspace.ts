import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type SupabaseAny = ReturnType<typeof createSupabaseServiceClient> & {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

function serviceClient(): SupabaseAny {
  return createSupabaseServiceClient() as SupabaseAny;
}

export async function getWorkspace(projectId?: string) {
  const supabase = serviceClient();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (projectsError) throw projectsError;

  const selectedProject = projectId
    ? projects?.find((project: any) => project.id === projectId)
    : projects?.[0];

  if (!selectedProject) {
    return {
      projects: [],
      selectedProject: null,
      organisation: null,
      targetBrand: null,
      competitorBrands: [],
      promptSets: [],
      prompts: [],
      runs: [],
      runSummaries: [],
      results: []
    };
  }

  const [
    organisationResult,
    projectBrandsResult,
    promptSetsResult,
    promptsResult,
    versionsResult,
    runsResult,
    providerRunsResult,
    itemsResult,
    responsesResult,
    analysesResult,
    citationsResult
  ] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", selectedProject.organisation_id).single(),
    supabase.from("project_brands").select("*, brands(*, brand_aliases(*), brand_domains(*))").eq("project_id", selectedProject.id).eq("active", true),
    supabase.from("prompt_sets").select("*").eq("project_id", selectedProject.id).eq("active", true).order("created_at", { ascending: false }),
    supabase.from("prompts").select("*").eq("project_id", selectedProject.id).eq("active", true).order("created_at", { ascending: false }),
    supabase.from("prompt_versions").select("*").eq("project_id", selectedProject.id).order("version_number", { ascending: false }),
    supabase.from("evaluation_runs").select("*").eq("project_id", selectedProject.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("provider_test_runs").select("*").eq("project_id", selectedProject.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("test_run_items").select("*").eq("project_id", selectedProject.id),
    supabase.from("responses").select("*").eq("project_id", selectedProject.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("response_analyses").select("*").eq("project_id", selectedProject.id).eq("is_current", true).eq("analysis_status", "completed"),
    supabase.from("citations").select("*").eq("project_id", selectedProject.id)
  ]);

  for (const result of [
    organisationResult,
    projectBrandsResult,
    promptSetsResult,
    promptsResult,
    versionsResult,
    runsResult,
    providerRunsResult,
    itemsResult,
    responsesResult,
    analysesResult,
    citationsResult
  ]) {
    if (result.error) throw result.error;
  }

  const projectBrands = projectBrandsResult.data ?? [];
  const promptVersions = versionsResult.data ?? [];
  const responses = responsesResult.data ?? [];
  const analysesByResponseId = new Map((analysesResult.data ?? []).map((analysis: any) => [analysis.response_id, analysis]));
  const citationsByResponseId = new Map<string, any[]>();

  for (const citation of citationsResult.data ?? []) {
    const existing = citationsByResponseId.get(citation.response_id) ?? [];
    existing.push(citation);
    citationsByResponseId.set(citation.response_id, existing);
  }

  const items = itemsResult.data ?? [];
  const providerRuns = providerRunsResult.data ?? [];
  const runSummaries = providerRuns.map((run: any) => {
    const runItems = items.filter((item: any) => item.provider_test_run_id === run.id);
    const evaluation = (runsResult.data ?? []).find((item: any) => item.id === run.evaluation_run_id);
    return {
      ...run,
      evaluation_name: evaluation?.evaluation_name ?? "Evaluation",
      pending: runItems.filter((item: any) => item.status === "pending").length,
      running: runItems.filter((item: any) => item.status === "running").length,
      completed: runItems.filter((item: any) => item.status === "completed").length,
      failed: runItems.filter((item: any) => item.status === "failed").length
    };
  });

  return {
    projects: projects ?? [],
    selectedProject,
    organisation: organisationResult.data,
    targetBrand: projectBrands.find((link: any) => link.brand_role === "target")?.brands ?? null,
    competitorBrands: projectBrands.filter((link: any) => link.brand_role === "competitor").map((link: any) => link.brands),
    promptSets: promptSetsResult.data ?? [],
    prompts: (promptsResult.data ?? []).map((prompt: any) => ({
      ...prompt,
      latest_version: promptVersions.find((version: any) => version.prompt_id === prompt.id)
    })),
    runs: runsResult.data ?? [],
    providerRuns,
    runSummaries,
    results: responses.map((response: any) => ({
      response,
      analysis: analysesByResponseId.get(response.id),
      citations: citationsByResponseId.get(response.id) ?? []
    }))
  };
}
