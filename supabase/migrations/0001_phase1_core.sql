create extension if not exists pgcrypto;

create or replace function public.normalize_text(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function public.normalize_domain(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(regexp_replace(lower(trim(coalesce(value, ''))), '^https?://', ''), '^www\.', ''), '');
$$;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  organisation_name text not null,
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null,
  member_role text not null default 'admin' check (member_role in ('admin')),
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  project_name text not null,
  market text not null,
  default_language text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  brand_name text not null,
  created_at timestamptz not null default now(),
  unique (id, organisation_id)
);

create table public.brand_aliases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (public.normalize_text(alias)) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, normalized_alias)
);

create table public.brand_domains (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain text not null,
  normalized_domain text generated always as (public.normalize_domain(domain)) stored,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, normalized_domain)
);

create unique index brand_domains_one_primary_active_idx
  on public.brand_domains(brand_id)
  where is_primary = true and active = true;

create table public.project_brands (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organisation_id uuid not null,
  brand_id uuid not null,
  brand_role text not null check (brand_role in ('target', 'competitor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (project_id, organisation_id) references public.projects(id, organisation_id) on delete cascade,
  foreign key (brand_id, organisation_id) references public.brands(id, organisation_id) on delete cascade,
  unique (project_id, brand_id, brand_role)
);

create unique index project_brands_one_active_target_idx
  on public.project_brands(project_id)
  where brand_role = 'target' and active = true;

create table public.prompt_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_set_name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_set_id uuid not null,
  category text not null,
  intent text not null,
  market text not null,
  language text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (prompt_set_id, project_id) references public.prompt_sets(id, project_id) on delete cascade,
  unique (id, project_id)
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null,
  project_id uuid not null,
  version_number integer not null check (version_number > 0),
  prompt_text text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  foreign key (prompt_id, project_id) references public.prompts(id, project_id) on delete cascade,
  unique (prompt_id, version_number),
  unique (prompt_id, content_hash),
  unique (id, project_id)
);

create table public.test_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_set_id uuid not null,
  run_name text not null,
  provider text not null,
  model text not null,
  market text not null,
  language text not null,
  repetitions integer not null default 1 check (repetitions > 0),
  system_instruction text not null,
  generation_config jsonb not null default '{}'::jsonb,
  web_search_config jsonb not null default '{}'::jsonb,
  runner_version text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (prompt_set_id, project_id) references public.prompt_sets(id, project_id),
  unique (id, project_id)
);

create table public.test_run_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  test_run_id uuid not null,
  prompt_version_id uuid not null,
  repetition_index integer not null check (repetition_index > 0),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  worker_id text,
  claim_token uuid,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  successful_response_id uuid,
  created_at timestamptz not null default now(),
  foreign key (test_run_id, project_id) references public.test_runs(id, project_id) on delete cascade,
  foreign key (prompt_version_id, project_id) references public.prompt_versions(id, project_id),
  unique (test_run_id, prompt_version_id, repetition_index),
  unique (id, project_id)
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  test_run_id uuid not null,
  test_run_item_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  openai_response_id text,
  status text not null check (status in ('completed', 'failed', 'partial')),
  request_payload jsonb not null,
  raw_response jsonb,
  answer_text text,
  usage jsonb not null default '{}'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  foreign key (test_run_id, project_id) references public.test_runs(id, project_id),
  foreign key (test_run_item_id, project_id) references public.test_run_items(id, project_id),
  unique (test_run_item_id, attempt_number),
  unique (id, project_id)
);

alter table public.test_run_items
  add constraint test_run_items_successful_response_fk
  foreign key (successful_response_id, project_id) references public.responses(id, project_id);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  response_id uuid not null,
  url text not null,
  normalized_url text not null,
  domain text not null,
  normalized_domain text not null,
  matched_brand_id uuid,
  is_official_domain boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (response_id, project_id) references public.responses(id, project_id) on delete cascade,
  foreign key (matched_brand_id) references public.brands(id),
  unique (response_id, normalized_url)
);

create table public.response_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  response_id uuid not null,
  analysis_run_id uuid not null default gen_random_uuid(),
  analysis_version integer not null check (analysis_version > 0),
  analysis_model text not null,
  analysis_prompt_version text not null,
  analysis_schema_version text not null,
  analysis_status text not null check (analysis_status in ('pending', 'completed', 'failed')),
  analysis_error text,
  target_brand_mentioned boolean,
  target_brand_recommended boolean,
  target_brand_rank integer check (target_brand_rank is null or target_brand_rank > 0),
  recommendation_strength numeric check (recommendation_strength is null or (recommendation_strength >= 0 and recommendation_strength <= 1)),
  official_domain_cited boolean,
  confidence_score numeric check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  classification jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (response_id, project_id) references public.responses(id, project_id) on delete cascade,
  unique (response_id, analysis_version)
);

create unique index response_analyses_one_current_completed_idx
  on public.response_analyses(response_id)
  where is_current = true and analysis_status = 'completed';

create or replace function public.prevent_response_attempt_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Response attempts are immutable. Create a new attempt instead.';
end;
$$;

create trigger responses_no_update
  before update on public.responses
  for each row execute function public.prevent_response_attempt_mutation();

create trigger responses_no_delete
  before delete on public.responses
  for each row execute function public.prevent_response_attempt_mutation();

create or replace function public.ensure_citation_response_is_retained_output()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.responses r
    where r.id = new.response_id
      and r.project_id = new.project_id
      and r.status in ('completed', 'partial')
  ) then
    raise exception 'Citations may only attach to completed or meaningful partial responses.';
  end if;

  return new;
end;
$$;

create trigger citations_response_status_check
  before insert or update on public.citations
  for each row execute function public.ensure_citation_response_is_retained_output();

create trigger response_analyses_response_status_check
  before insert or update on public.response_analyses
  for each row execute function public.ensure_citation_response_is_retained_output();

create index organisation_members_user_idx on public.organisation_members(user_id);
create index projects_organisation_idx on public.projects(organisation_id);
create index brands_organisation_idx on public.brands(organisation_id);
create index brand_aliases_normalized_active_idx on public.brand_aliases(normalized_alias) where active = true;
create index brand_domains_normalized_active_idx on public.brand_domains(normalized_domain) where active = true;
create index project_brands_project_role_idx on public.project_brands(project_id, brand_role, active);
create index prompt_sets_project_active_idx on public.prompt_sets(project_id, active);
create index prompts_project_set_active_idx on public.prompts(project_id, prompt_set_id, active);
create index prompt_versions_prompt_version_idx on public.prompt_versions(prompt_id, version_number desc);
create index test_runs_project_created_idx on public.test_runs(project_id, created_at desc);
create index test_run_items_run_status_idx on public.test_run_items(test_run_id, status, created_at);
create index test_run_items_claim_idx on public.test_run_items(status, claimed_at);
create index responses_project_run_created_idx on public.responses(project_id, test_run_id, created_at);
create index citations_project_domain_idx on public.citations(project_id, normalized_domain);
create index response_analyses_project_response_created_idx on public.response_analyses(project_id, response_id, created_at desc);

create or replace function public.user_can_access_organisation(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = target_organisation_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.organisation_members om on om.organisation_id = p.organisation_id
    where p.id = target_project_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_access_brand(target_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brands b
    join public.organisation_members om on om.organisation_id = b.organisation_id
    where b.id = target_brand_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.claim_test_run_items(
  target_test_run_id uuid,
  batch_size integer,
  worker_id text,
  stale_after interval default interval '10 minutes'
)
returns table (
  id uuid,
  project_id uuid,
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
    where tri.test_run_id = target_test_run_id
      and (
        tri.status = 'pending'
        or (
          tri.status = 'running'
          and tri.claimed_at < now() - stale_after
        )
        or (
          tri.status = 'failed'
          and tri.attempt_count < 3
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
        worker_id = claim_test_run_items.worker_id,
        claim_token = gen_random_uuid(),
        claimed_at = now(),
        started_at = coalesce(tri.started_at, now()),
        last_error = null
    from candidate_items ci
    where tri.id = ci.id
    returning tri.id, tri.project_id, tri.test_run_id, tri.prompt_version_id, tri.repetition_index, tri.claim_token, tri.attempt_count
  )
  select claimed.id, claimed.project_id, claimed.test_run_id, claimed.prompt_version_id, claimed.repetition_index, claimed.claim_token, claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.complete_test_run_item(
  target_item_id uuid,
  target_claim_token uuid,
  target_response_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.test_run_items
  set status = 'completed',
      successful_response_id = target_response_id,
      completed_at = now(),
      last_error = null
  where id = target_item_id
    and claim_token = target_claim_token
    and status = 'running';

  if not found then
    raise exception 'No running test_run_item matched claim token';
  end if;
end;
$$;

create or replace function public.fail_test_run_item(
  target_item_id uuid,
  target_claim_token uuid,
  error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.test_run_items
  set status = 'failed',
      completed_at = now(),
      last_error = error_message
  where id = target_item_id
    and claim_token = target_claim_token
    and status = 'running';

  if not found then
    raise exception 'No running test_run_item matched claim token';
  end if;
end;
$$;

create or replace function public.record_completed_analysis(
  target_project_id uuid,
  target_response_id uuid,
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

revoke execute on function public.claim_test_run_items(uuid, integer, text, interval) from public, anon, authenticated;
revoke execute on function public.complete_test_run_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fail_test_run_item(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.record_completed_analysis(uuid, uuid, text, text, text, integer, boolean, boolean, integer, numeric, boolean, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.claim_test_run_items(uuid, integer, text, interval) to service_role;
grant execute on function public.complete_test_run_item(uuid, uuid, uuid) to service_role;
grant execute on function public.fail_test_run_item(uuid, uuid, text) to service_role;
grant execute on function public.record_completed_analysis(uuid, uuid, text, text, text, integer, boolean, boolean, integer, numeric, boolean, numeric, jsonb) to service_role;

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.projects enable row level security;
alter table public.brands enable row level security;
alter table public.brand_aliases enable row level security;
alter table public.brand_domains enable row level security;
alter table public.project_brands enable row level security;
alter table public.prompt_sets enable row level security;
alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.test_runs enable row level security;
alter table public.test_run_items enable row level security;
alter table public.responses enable row level security;
alter table public.citations enable row level security;
alter table public.response_analyses enable row level security;

create policy organisations_member_access on public.organisations
  for all using (public.user_can_access_organisation(id))
  with check (public.user_can_access_organisation(id));

create policy organisation_members_self_org_access on public.organisation_members
  for all using (public.user_can_access_organisation(organisation_id))
  with check (public.user_can_access_organisation(organisation_id));

create policy projects_member_access on public.projects
  for all using (public.user_can_access_organisation(organisation_id))
  with check (public.user_can_access_organisation(organisation_id));

create policy brands_member_access on public.brands
  for all using (public.user_can_access_organisation(organisation_id))
  with check (public.user_can_access_organisation(organisation_id));

create policy brand_aliases_member_access on public.brand_aliases
  for all using (public.user_can_access_brand(brand_id))
  with check (public.user_can_access_brand(brand_id));

create policy brand_domains_member_access on public.brand_domains
  for all using (public.user_can_access_brand(brand_id))
  with check (public.user_can_access_brand(brand_id));

create policy project_brands_member_access on public.project_brands
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id) and public.user_can_access_brand(brand_id));

create policy prompt_sets_project_access on public.prompt_sets
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompts_project_access on public.prompts
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_versions_project_access on public.prompt_versions
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy test_runs_project_access on public.test_runs
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy test_run_items_project_access on public.test_run_items
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy responses_project_access on public.responses
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy citations_project_access on public.citations
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy response_analyses_project_access on public.response_analyses
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));
