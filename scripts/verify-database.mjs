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

const missing = required.filter((fragment) => !migration.toLowerCase().includes(fragment.toLowerCase()));
const missingPhase11 = requiredPhase11.filter((fragment) => !phase11.toLowerCase().includes(fragment.toLowerCase()));
if (missing.length || missingPhase11.length) {
  console.error(`Migration is missing required fragments:\n${missing.join("\n")}`);
  if (missingPhase11.length) console.error(`Phase 1.1 migration is missing required fragments:\n${missingPhase11.join("\n")}`);
  process.exit(1);
}

const forbiddenOutsideSeed = ["Nation" + " Maid Agency", "nation" + "maid.com.sg"];
if (!forbiddenOutsideSeed.every((fragment) => seed.includes(fragment))) {
  console.error("Seed data does not contain the approved first-project brand seed.");
  process.exit(1);
}

console.log("Database verification passed: constraints, RLS, claiming, attempts, and seed boundaries are present.");
