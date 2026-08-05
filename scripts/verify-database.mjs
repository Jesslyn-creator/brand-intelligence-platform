import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0001_phase1_core.sql", "utf8");
const seed = readFileSync("supabase/seed.sql", "utf8");

const required = [
  "unique (test_run_item_id, attempt_number)",
  "successful_response_id uuid",
  "organisation_id uuid not null references public.organisations",
  "response_analyses_one_current_completed_idx",
  "for update skip locked",
  "claim_token uuid",
  "worker_id text",
  "enable row level security",
  "record_completed_analysis",
  "foreign key (prompt_set_id, project_id) references public.prompt_sets",
  "prevent_response_attempt_mutation",
  "revoke execute on function public.claim_test_run_items"
];

const phase11 = readFileSync("supabase/migrations/0002_phase1_1_multi_provider.sql", "utf8");
const phase12 = readFileSync("supabase/migrations/0003_phase1_2a_prompt_opportunities.sql", "utf8");
const requiredPhase11 = [
  "create table if not exists public.evaluation_runs",
  "create table if not exists public.provider_test_runs",
  "native_request_payload jsonb",
  "native_raw_response jsonb",
  "normalized_usage jsonb",
  "web_grounding_status text",
  "claim_provider_test_run_items",
  "target_analysis_provider text",
  "manual_review_status text"
];
const requiredPhase12 = [
  "create table public.evidence_import_batches",
  "create table public.evidence_records",
  "create table public.prompt_opportunities",
  "create table public.prompt_opportunity_evidence",
  "create table public.prompt_opportunity_candidates",
  "create table public.prompt_candidate_evidence",
  "create table public.prompt_opportunity_reviews",
  "create table public.prompt_opportunity_promotions",
  "create table public.prompt_promotion_evidence",
  "unique (project_id, source_type, dedupe_hash)",
  "foreign key (prompt_opportunity_id, project_id) references public.prompt_opportunities",
  "foreign key (evidence_record_id, project_id) references public.evidence_records",
  "ensure_prompt_opportunity_status_transition",
  "ensure_prompt_opportunity_promotion_allowed",
  "ensure_prompt_candidate_evidence_is_linked_to_opportunity",
  "ensure_prompt_promotion_evidence_is_linked_to_opportunity",
  "ensure_prompt_opportunity_review_candidate_matches",
  "promote_prompt_opportunity",
  "for update",
  "prevent_prompt_review_mutation",
  "prevent_prompt_promotion_mutation",
  "prevent_prompt_promotion_evidence_mutation",
  "prevent_prompt_version_mutation",
  "refresh_updated_at",
  "source_date_start > new.source_date_end",
  "final_priority_by uuid",
  "final_priority_at timestamptz",
  "suggested_priority_rationale jsonb",
  "alter table public.evidence_import_batches enable row level security",
  "grant select, insert, update, delete on public.evidence_import_batches to authenticated",
  "grant select, insert, update, delete on public.prompt_candidate_evidence to authenticated",
  "grant select, insert on public.prompt_opportunity_reviews to authenticated",
  "grant select, insert on public.prompt_opportunity_promotions to authenticated",
  "grant select, insert on public.prompt_promotion_evidence to authenticated",
  "create policy evidence_import_batches_project_access",
  "create policy prompt_opportunity_reviews_project_select",
  "create policy prompt_opportunity_reviews_project_insert",
  "create policy prompt_opportunity_promotions_project_select",
  "create policy prompt_opportunity_promotions_project_insert",
  "create policy prompt_promotion_evidence_project_select",
  "create policy prompt_promotion_evidence_project_insert",
  "revoke execute on function public.promote_prompt_opportunity"
];

const missing = required.filter((fragment) => !migration.toLowerCase().includes(fragment.toLowerCase()));
const missingPhase11 = requiredPhase11.filter((fragment) => !phase11.toLowerCase().includes(fragment.toLowerCase()));
const missingPhase12 = requiredPhase12.filter((fragment) => !phase12.toLowerCase().includes(fragment.toLowerCase()));
const forbiddenPhase12 = [
  "source_evidence_ids",
  "evidence_ids",
  "uuid[]",
  "opportunity_score",
  "numeric opportunity score"
].filter((fragment) => phase12.toLowerCase().includes(fragment.toLowerCase()));

if (missing.length || missingPhase11.length || missingPhase12.length || forbiddenPhase12.length) {
  console.error(`Migration is missing required fragments:\n${missing.join("\n")}`);
  if (missingPhase11.length) console.error(`Phase 1.1 migration is missing required fragments:\n${missingPhase11.join("\n")}`);
  if (missingPhase12.length) console.error(`Phase 1.2A migration is missing required fragments:\n${missingPhase12.join("\n")}`);
  if (forbiddenPhase12.length) console.error(`Phase 1.2A migration includes forbidden fragments:\n${forbiddenPhase12.join("\n")}`);
  process.exit(1);
}

const forbiddenOutsideSeed = ["Nation" + " Maid Agency", "nation" + "maid.com.sg"];
if (!forbiddenOutsideSeed.every((fragment) => seed.includes(fragment))) {
  console.error("Seed data does not contain the approved first-project brand seed.");
  process.exit(1);
}

console.log("Database verification passed: constraints, RLS, claiming, attempts, prompt opportunities, and seed boundaries are present.");
