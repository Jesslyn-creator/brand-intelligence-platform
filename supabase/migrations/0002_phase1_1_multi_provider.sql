create table if not exists public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_set_id uuid not null,
  evaluation_name text not null,
  repetitions integer not null default 1 check (repetitions > 0),
  system_instruction text not null,
  generation_config jsonb not null default '{}'::jsonb,
  web_search_config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled', 'partial')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  foreign key (prompt_set_id, project_id) references public.prompt_sets(id, project_id),
  unique (id, project_id)
);

create table if not exists public.provider_test_runs (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null,
  project_id uuid not null,
  prompt_set_id uuid not null,
  generation_provider text not null,
  generation_model text not null,
  provider_sdk_name text,
  provider_sdk_version text,
  capability_snapshot jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  pricing_effective_date date,
  estimated_cost_currency text not null default 'USD',
  provider_run_config jsonb not null default '{}'::jsonb,
  runner_version text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled', 'partial', 'unsupported')),
  unsupported_reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  foreign key (evaluation_run_id, project_id) references public.evaluation_runs(id, project_id) on delete cascade,
  foreign key (prompt_set_id, project_id) references public.prompt_sets(id, project_id),
  unique (id, project_id),
  unique (evaluation_run_id, generation_provider, generation_model)
);

alter table public.test_runs
  add column if not exists evaluation_run_id uuid,
  add column if not exists provider_test_run_id uuid,
  add column if not exists generation_provider text,
  add column if not exists generation_model text;

alter table public.test_run_items
  alter column test_run_id drop not null,
  add column if not exists provider_test_run_id uuid;

alter table public.responses
  alter column test_run_id drop not null,
  add column if not exists provider_test_run_id uuid,
  add column if not exists generation_provider text,
  add column if not exists generation_model text,
  add column if not exists provider_response_id text,
  add column if not exists native_request_payload jsonb,
  add column if not exists native_raw_response jsonb,
  add column if not exists normalized_answer_text text,
  add column if not exists native_usage jsonb,
  add column if not exists normalized_usage jsonb,
  add column if not exists finish_reason text,
  add column if not exists tool_call_metadata jsonb not null default '{}'::jsonb,
  add column if not exists search_metadata jsonb not null default '{}'::jsonb,
  add column if not exists web_grounding_status text not null default 'not_requested' check (web_grounding_status in ('not_requested', 'grounded', 'ungrounded', 'unsupported', 'failed')),
  add column if not exists provider_error jsonb;

alter table public.citations
  add column if not exists native_citation jsonb not null default '{}'::jsonb,
  add column if not exists title text,
  add column if not exists cited_text text,
  add column if not exists start_index integer,
  add column if not exists end_index integer,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

alter table public.response_analyses
  add column if not exists analysis_provider text,
  add column if not exists manual_review_status text not null default 'not_reviewed' check (manual_review_status in ('not_reviewed', 'flagged', 'reviewed')),
  add column if not exists audit_flag boolean not null default false,
  add column if not exists audit_notes text;

update public.test_runs
set generation_provider = coalesce(generation_provider, provider),
    generation_model = coalesce(generation_model, model)
where generation_provider is null or generation_model is null;

insert into public.evaluation_runs (
  id,
  project_id,
  prompt_set_id,
  evaluation_name,
  repetitions,
  system_instruction,
  generation_config,
  web_search_config,
  status,
  created_at,
  started_at,
  completed_at
)
select
  gen_random_uuid(),
  tr.project_id,
  tr.prompt_set_id,
  tr.run_name,
  tr.repetitions,
  tr.system_instruction,
  tr.generation_config,
  tr.web_search_config,
  tr.status,
  tr.created_at,
  tr.started_at,
  tr.completed_at
from public.test_runs tr
where tr.evaluation_run_id is null;

update public.test_runs tr
set evaluation_run_id = er.id
from public.evaluation_runs er
where tr.evaluation_run_id is null
  and er.project_id = tr.project_id
  and er.prompt_set_id = tr.prompt_set_id
  and er.evaluation_name = tr.run_name
  and er.created_at = tr.created_at;

insert into public.provider_test_runs (
  evaluation_run_id,
  project_id,
  prompt_set_id,
  generation_provider,
  generation_model,
  provider_sdk_name,
  provider_sdk_version,
  capability_snapshot,
  pricing_snapshot,
  provider_run_config,
  runner_version,
  status,
  created_at,
  started_at,
  completed_at
)
select
  tr.evaluation_run_id,
  tr.project_id,
  tr.prompt_set_id,
  coalesce(tr.generation_provider, tr.provider),
  coalesce(tr.generation_model, tr.model),
  'openai',
  null,
  '{"supports_web_grounding":true,"supports_citations":true,"supports_structured_output":true}'::jsonb,
  '{"estimate_available":false}'::jsonb,
  jsonb_build_object(
    'legacy_test_run_id', tr.id,
    'system_instruction', tr.system_instruction,
    'generation_config', tr.generation_config,
    'web_search_config', tr.web_search_config
  ),
  tr.runner_version,
  tr.status,
  tr.created_at,
  tr.started_at,
  tr.completed_at
from public.test_runs tr
where tr.provider_test_run_id is null
on conflict (evaluation_run_id, generation_provider, generation_model) do nothing;

update public.test_runs tr
set provider_test_run_id = ptr.id
from public.provider_test_runs ptr
where tr.provider_test_run_id is null
  and ptr.evaluation_run_id = tr.evaluation_run_id
  and ptr.generation_provider = coalesce(tr.generation_provider, tr.provider)
  and ptr.generation_model = coalesce(tr.generation_model, tr.model);

update public.test_run_items tri
set provider_test_run_id = tr.provider_test_run_id
from public.test_runs tr
where tri.provider_test_run_id is null
  and tri.test_run_id = tr.id;

update public.responses r
set provider_test_run_id = tr.provider_test_run_id,
    generation_provider = coalesce(r.generation_provider, tr.generation_provider, tr.provider),
    generation_model = coalesce(r.generation_model, tr.generation_model, tr.model),
    provider_response_id = coalesce(r.provider_response_id, r.openai_response_id),
    native_request_payload = coalesce(r.native_request_payload, r.request_payload),
    native_raw_response = coalesce(r.native_raw_response, r.raw_response),
    normalized_answer_text = coalesce(r.normalized_answer_text, r.answer_text),
    native_usage = coalesce(r.native_usage, r.usage),
    normalized_usage = coalesce(r.normalized_usage, r.usage)
from public.test_runs tr
where r.test_run_id = tr.id;

update public.response_analyses
set analysis_provider = coalesce(analysis_provider, 'openai')
where analysis_provider is null;

alter table public.test_run_items
  add constraint test_run_items_provider_run_fk
  foreign key (provider_test_run_id, project_id) references public.provider_test_runs(id, project_id);

alter table public.responses
  add constraint responses_provider_run_fk
  foreign key (provider_test_run_id, project_id) references public.provider_test_runs(id, project_id);

alter table public.response_analyses
  alter column analysis_provider set not null;

create index if not exists evaluation_runs_project_created_idx on public.evaluation_runs(project_id, created_at desc);
create index if not exists provider_test_runs_evaluation_provider_idx on public.provider_test_runs(evaluation_run_id, generation_provider, status);
create index if not exists test_run_items_provider_status_idx on public.test_run_items(provider_test_run_id, status, created_at);
create index if not exists responses_provider_run_created_idx on public.responses(provider_test_run_id, created_at);
create index if not exists responses_generation_provider_model_idx on public.responses(project_id, generation_provider, generation_model);

create or replace function public.claim_provider_test_run_items(
  target_provider_test_run_id uuid,
  batch_size integer,
  worker_id text,
  max_attempts integer default 3,
  stale_after interval default interval '10 minutes'
)
returns table (
  id uuid,
  project_id uuid,
  provider_test_run_id uuid,
  test_run_id uuid,
  prompt_version_id uuid,
  repetition_index integer,
  claim_token uuid,
  attempt_number integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate_items as (
    select tri.id
    from public.test_run_items tri
    where tri.provider_test_run_id = target_provider_test_run_id
      and (
        tri.status = 'pending'
        or (
          tri.status = 'running'
          and tri.claimed_at < now() - stale_after
        )
        or (
          tri.status = 'failed'
          and tri.attempt_count < max_attempts
        )
      )
    order by tri.created_at, tri.repetition_index
    for update skip locked
    limit greatest(1, batch_size)
  ),
  claimed as (
    update public.test_run_items tri
    set status = 'running',
        attempt_count = tri.attempt_count + 1,
        worker_id = claim_provider_test_run_items.worker_id,
        claim_token = gen_random_uuid(),
        claimed_at = now(),
        started_at = coalesce(tri.started_at, now()),
        last_error = null
    from candidate_items ci
    where tri.id = ci.id
    returning tri.id, tri.project_id, tri.provider_test_run_id, tri.test_run_id, tri.prompt_version_id, tri.repetition_index, tri.claim_token, tri.attempt_count
  )
  select claimed.id, claimed.project_id, claimed.provider_test_run_id, claimed.test_run_id, claimed.prompt_version_id, claimed.repetition_index, claimed.claim_token, claimed.attempt_count
  from claimed;
end;
$$;

drop function if exists public.record_completed_analysis(uuid, uuid, text, text, text, integer, boolean, boolean, integer, numeric, boolean, numeric, jsonb);

create or replace function public.record_completed_analysis(
  target_project_id uuid,
  target_response_id uuid,
  target_analysis_provider text,
  target_analysis_model text,
  target_analysis_prompt_version text,
  target_analysis_schema_version text,
  target_analysis_version integer,
  target_brand_mentioned boolean,
  target_brand_recommended boolean,
  target_brand_rank integer,
  target_recommendation_strength numeric,
  target_official_domain_cited boolean,
  target_confidence_score numeric,
  target_classification jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  update public.response_analyses
  set is_current = false,
      superseded_at = now()
  where response_id = target_response_id
    and is_current = true
    and analysis_status = 'completed';

  insert into public.response_analyses (
    project_id,
    response_id,
    analysis_provider,
    analysis_version,
    analysis_model,
    analysis_prompt_version,
    analysis_schema_version,
    analysis_status,
    target_brand_mentioned,
    target_brand_recommended,
    target_brand_rank,
    recommendation_strength,
    official_domain_cited,
    confidence_score,
    classification,
    is_current
  )
  values (
    target_project_id,
    target_response_id,
    target_analysis_provider,
    target_analysis_version,
    target_analysis_model,
    target_analysis_prompt_version,
    target_analysis_schema_version,
    'completed',
    target_brand_mentioned,
    target_brand_recommended,
    target_brand_rank,
    target_recommendation_strength,
    target_official_domain_cited,
    target_confidence_score,
    target_classification,
    true
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke execute on function public.claim_provider_test_run_items(uuid, integer, text, integer, interval) from public, anon, authenticated;
revoke execute on function public.record_completed_analysis(uuid, uuid, text, text, text, text, integer, boolean, boolean, integer, numeric, boolean, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.claim_provider_test_run_items(uuid, integer, text, integer, interval) to service_role;
grant execute on function public.record_completed_analysis(uuid, uuid, text, text, text, text, integer, boolean, boolean, integer, numeric, boolean, numeric, jsonb) to service_role;

alter table public.evaluation_runs enable row level security;
alter table public.provider_test_runs enable row level security;

create policy evaluation_runs_project_access on public.evaluation_runs
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy provider_test_runs_project_access on public.provider_test_runs
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));
