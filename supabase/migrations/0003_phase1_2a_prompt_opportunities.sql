create table public.evidence_import_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type text not null check (source_type in ('gsc_csv', 'google_ads_search_terms_csv', 'customer_enquiry', 'competitor_topic')),
  import_name text not null,
  imported_by uuid not null,
  imported_at timestamptz not null default now(),
  source_file_name text,
  source_date_start date,
  source_date_end date,
  market text not null,
  language text not null,
  row_count integer not null default 0 check (row_count >= 0),
  successful_record_count integer not null default 0 check (successful_record_count >= 0),
  duplicate_record_count integer not null default 0 check (duplicate_record_count >= 0),
  failed_record_count integer not null default 0 check (failed_record_count >= 0),
  import_status text not null default 'pending' check (import_status in ('pending', 'completed', 'failed', 'partial')),
  import_error text,
  raw_metadata jsonb not null default '{}'::jsonb,
  unique (id, project_id)
);

create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  import_batch_id uuid not null,
  source_type text not null check (source_type in ('gsc_csv', 'google_ads_search_terms_csv', 'customer_enquiry', 'competitor_topic')),
  source_record_reference text not null,
  source_date date,
  market text not null,
  language text not null,
  topic text,
  normalized_topic text generated always as (public.normalize_text(topic)) stored,
  evidence_text text not null,
  source_url text,
  metrics jsonb not null default '{}'::jsonb,
  raw_record jsonb not null default '{}'::jsonb,
  dedupe_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (import_batch_id, project_id) references public.evidence_import_batches(id, project_id) on delete cascade,
  unique (project_id, source_type, dedupe_hash),
  unique (id, project_id)
);

create table public.prompt_opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  topic text not null,
  normalized_topic text generated always as (public.normalize_text(topic)) stored,
  intent text not null default 'unknown' check (intent in ('informational', 'comparison', 'recommendation', 'transactional', 'support', 'unknown')),
  market text not null,
  language text not null,
  status text not null default 'new' check (status in ('new', 'under_review', 'approved', 'rejected', 'exploratory', 'promoted')),
  suggested_prompt text,
  suggested_priority text check (suggested_priority is null or suggested_priority in ('high', 'medium', 'low')),
  suggested_priority_rationale jsonb not null default '{}'::jsonb,
  final_priority text check (final_priority is null or final_priority in ('high', 'medium', 'low')),
  final_priority_by uuid,
  final_priority_at timestamptz,
  related_prompt_id uuid,
  related_prompt_linked_by uuid,
  related_prompt_linked_at timestamptz,
  approved_prompt_text text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  exploratory_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (related_prompt_id, project_id) references public.prompts(id, project_id),
  unique (id, project_id),
  check (
    (final_priority is null and final_priority_by is null and final_priority_at is null)
    or (final_priority is not null and final_priority_by is not null and final_priority_at is not null)
  ),
  check (suggested_priority is null or suggested_priority_rationale <> '{}'::jsonb),
  check (status <> 'approved' or (approved_prompt_text is not null and approved_by is not null and approved_at is not null)),
  check (status <> 'rejected' or (rejected_by is not null and rejected_at is not null)),
  check (status <> 'exploratory' or exploratory_reason is not null)
);

create table public.prompt_opportunity_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_opportunity_id uuid not null,
  evidence_record_id uuid not null,
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  foreign key (prompt_opportunity_id, project_id) references public.prompt_opportunities(id, project_id) on delete cascade,
  foreign key (evidence_record_id, project_id) references public.evidence_records(id, project_id) on delete cascade,
  unique (prompt_opportunity_id, evidence_record_id),
  unique (id, project_id)
);

create table public.prompt_opportunity_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_opportunity_id uuid not null,
  candidate_text text not null,
  candidate_status text not null default 'proposed' check (candidate_status in ('proposed', 'selected', 'edited', 'rejected')),
  generation_provider text,
  generation_model text,
  generation_template_version text,
  generation_input jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  selected_by uuid,
  selected_at timestamptz,
  foreign key (prompt_opportunity_id, project_id) references public.prompt_opportunities(id, project_id) on delete cascade,
  unique (id, project_id),
  check (
    (generation_provider is null and generation_model is null and generation_template_version is null and created_by is not null)
    or (generation_provider is not null and generation_model is not null and generation_template_version is not null)
  ),
  check (
    (candidate_status <> 'selected' and selected_by is null and selected_at is null)
    or (candidate_status = 'selected' and selected_by is not null and selected_at is not null)
  )
);

create table public.prompt_candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  candidate_id uuid not null,
  evidence_record_id uuid not null,
  linked_at timestamptz not null default now(),
  foreign key (candidate_id, project_id) references public.prompt_opportunity_candidates(id, project_id) on delete cascade,
  foreign key (evidence_record_id, project_id) references public.evidence_records(id, project_id) on delete cascade,
  unique (candidate_id, evidence_record_id),
  unique (id, project_id)
);

create table public.prompt_opportunity_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_opportunity_id uuid not null,
  candidate_id uuid,
  reviewer_id uuid not null,
  decision text not null check (decision in ('start_review', 'approve', 'edit_approve', 'reject', 'mark_exploratory', 'confirm_priority', 'link_related_prompt', 'promote', 'comment')),
  from_status text check (from_status is null or from_status in ('new', 'under_review', 'approved', 'rejected', 'exploratory', 'promoted')),
  to_status text check (to_status is null or to_status in ('new', 'under_review', 'approved', 'rejected', 'exploratory', 'promoted')),
  decision_reason text,
  reviewed_prompt_text text,
  review_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (prompt_opportunity_id, project_id) references public.prompt_opportunities(id, project_id) on delete cascade,
  foreign key (candidate_id, project_id) references public.prompt_opportunity_candidates(id, project_id),
  unique (id, project_id)
);

create table public.prompt_opportunity_promotions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  prompt_opportunity_id uuid not null,
  candidate_id uuid,
  prompt_set_id uuid not null,
  prompt_id uuid not null,
  prompt_version_id uuid not null,
  approved_prompt_text text not null,
  reviewer_id uuid not null,
  approved_at timestamptz not null,
  promoted_by uuid not null,
  promoted_at timestamptz not null default now(),
  promotion_metadata jsonb not null default '{}'::jsonb,
  foreign key (prompt_opportunity_id, project_id) references public.prompt_opportunities(id, project_id),
  foreign key (candidate_id, project_id) references public.prompt_opportunity_candidates(id, project_id),
  foreign key (prompt_set_id, project_id) references public.prompt_sets(id, project_id),
  foreign key (prompt_id, project_id) references public.prompts(id, project_id),
  foreign key (prompt_version_id, project_id) references public.prompt_versions(id, project_id),
  unique (prompt_opportunity_id),
  unique (id, project_id)
);

create table public.prompt_promotion_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  promotion_id uuid not null,
  evidence_record_id uuid not null,
  linked_at timestamptz not null default now(),
  foreign key (promotion_id, project_id) references public.prompt_opportunity_promotions(id, project_id) on delete cascade,
  foreign key (evidence_record_id, project_id) references public.evidence_records(id, project_id),
  unique (promotion_id, evidence_record_id),
  unique (id, project_id)
);

create index evidence_import_batches_project_imported_idx on public.evidence_import_batches(project_id, imported_at desc);
create index evidence_import_batches_project_source_idx on public.evidence_import_batches(project_id, source_type, imported_at desc);
create index evidence_records_project_topic_idx on public.evidence_records(project_id, normalized_topic, market, language);
create index evidence_records_project_source_date_idx on public.evidence_records(project_id, source_type, source_date desc);
create index prompt_opportunities_project_status_idx on public.prompt_opportunities(project_id, status, updated_at desc);
create index prompt_opportunities_project_priority_idx on public.prompt_opportunities(project_id, final_priority, status);
create index prompt_opportunities_project_topic_idx on public.prompt_opportunities(project_id, normalized_topic, market, language);
create index prompt_opportunity_evidence_record_idx on public.prompt_opportunity_evidence(project_id, evidence_record_id);
create index prompt_opportunity_evidence_opportunity_idx on public.prompt_opportunity_evidence(project_id, prompt_opportunity_id);
create index prompt_opportunity_candidates_project_opportunity_idx on public.prompt_opportunity_candidates(project_id, prompt_opportunity_id, created_at desc);
create index prompt_candidate_evidence_record_idx on public.prompt_candidate_evidence(project_id, evidence_record_id);
create index prompt_opportunity_reviews_opportunity_idx on public.prompt_opportunity_reviews(project_id, prompt_opportunity_id, created_at desc);
create index prompt_opportunity_reviews_reviewer_idx on public.prompt_opportunity_reviews(project_id, reviewer_id, created_at desc);
create index prompt_opportunity_promotions_project_promoted_idx on public.prompt_opportunity_promotions(project_id, promoted_at desc);
create index prompt_promotion_evidence_record_idx on public.prompt_promotion_evidence(project_id, evidence_record_id);

create or replace function public.refresh_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger evidence_records_refresh_updated_at
  before update on public.evidence_records
  for each row execute function public.refresh_updated_at();

create trigger prompt_opportunities_refresh_updated_at
  before update on public.prompt_opportunities
  for each row execute function public.refresh_updated_at();

create or replace function public.prevent_prompt_review_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Prompt opportunity reviews are append-only.';
end;
$$;

create trigger prompt_opportunity_reviews_no_update
  before update on public.prompt_opportunity_reviews
  for each row execute function public.prevent_prompt_review_mutation();

create trigger prompt_opportunity_reviews_no_delete
  before delete on public.prompt_opportunity_reviews
  for each row execute function public.prevent_prompt_review_mutation();

create or replace function public.prevent_prompt_promotion_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Prompt opportunity promotions are append-only.';
end;
$$;

create trigger prompt_opportunity_promotions_no_update
  before update on public.prompt_opportunity_promotions
  for each row execute function public.prevent_prompt_promotion_mutation();

create trigger prompt_opportunity_promotions_no_delete
  before delete on public.prompt_opportunity_promotions
  for each row execute function public.prevent_prompt_promotion_mutation();

create or replace function public.prevent_prompt_promotion_evidence_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Prompt promotion evidence is append-only.';
end;
$$;

create trigger prompt_promotion_evidence_no_update
  before update on public.prompt_promotion_evidence
  for each row execute function public.prevent_prompt_promotion_evidence_mutation();

create trigger prompt_promotion_evidence_no_delete
  before delete on public.prompt_promotion_evidence
  for each row execute function public.prevent_prompt_promotion_evidence_mutation();

create or replace function public.prevent_prompt_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Prompt versions are immutable. Create a new prompt version instead.';
end;
$$;

create trigger prompt_versions_no_update
  before update on public.prompt_versions
  for each row execute function public.prevent_prompt_version_mutation();

create trigger prompt_versions_no_delete
  before delete on public.prompt_versions
  for each row execute function public.prevent_prompt_version_mutation();

create or replace function public.ensure_prompt_opportunity_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'promoted' then
    raise exception 'Promoted opportunities cannot transition to another status.';
  end if;

  if new.status = 'promoted' and old.status <> 'approved' then
    raise exception 'Only approved opportunities can be promoted.';
  end if;

  if old.status = 'new' and new.status in ('under_review', 'approved', 'rejected', 'exploratory') then
    return new;
  end if;

  if old.status = 'under_review' and new.status in ('approved', 'rejected', 'exploratory') then
    return new;
  end if;

  if old.status = 'approved' and new.status in ('promoted', 'under_review') then
    return new;
  end if;

  if old.status = 'rejected' and new.status in ('under_review', 'exploratory') then
    return new;
  end if;

  if old.status = 'exploratory' and new.status in ('under_review', 'rejected') then
    return new;
  end if;

  raise exception 'Invalid prompt opportunity status transition from % to %.', old.status, new.status;
end;
$$;

create trigger prompt_opportunities_status_transition
  before update of status on public.prompt_opportunities
  for each row execute function public.ensure_prompt_opportunity_status_transition();

create or replace function public.ensure_import_batch_date_range()
returns trigger
language plpgsql
as $$
begin
  if new.source_date_start is not null
    and new.source_date_end is not null
    and new.source_date_start > new.source_date_end
  then
    raise exception 'Import batch source_date_start must be on or before source_date_end.';
  end if;

  return new;
end;
$$;

create trigger evidence_import_batches_date_range_check
  before insert or update on public.evidence_import_batches
  for each row execute function public.ensure_import_batch_date_range();

create or replace function public.ensure_evidence_record_matches_batch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.evidence_import_batches eib
    where eib.id = new.import_batch_id
      and eib.project_id = new.project_id
      and eib.source_type = new.source_type
      and eib.market = new.market
      and eib.language = new.language
  ) then
    raise exception 'Evidence record must match import batch project, source type, market, and language.';
  end if;

  return new;
end;
$$;

create trigger evidence_records_batch_scope_check
  before insert or update on public.evidence_records
  for each row execute function public.ensure_evidence_record_matches_batch();

create or replace function public.ensure_prompt_candidate_evidence_is_linked_to_opportunity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.prompt_opportunity_candidates poc
    join public.prompt_opportunity_evidence poe
      on poe.prompt_opportunity_id = poc.prompt_opportunity_id
     and poe.project_id = poc.project_id
     and poe.evidence_record_id = new.evidence_record_id
    where poc.id = new.candidate_id
      and poc.project_id = new.project_id
  ) then
    raise exception 'Candidate evidence must already be linked to the candidate opportunity.';
  end if;

  return new;
end;
$$;

create trigger prompt_candidate_evidence_opportunity_link_check
  before insert or update on public.prompt_candidate_evidence
  for each row execute function public.ensure_prompt_candidate_evidence_is_linked_to_opportunity();

create or replace function public.ensure_prompt_opportunity_review_candidate_matches()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.candidate_id is not null and not exists (
    select 1
    from public.prompt_opportunity_candidates poc
    where poc.id = new.candidate_id
      and poc.project_id = new.project_id
      and poc.prompt_opportunity_id = new.prompt_opportunity_id
  ) then
    raise exception 'Review candidate must belong to the reviewed opportunity.';
  end if;

  return new;
end;
$$;

create trigger prompt_opportunity_reviews_candidate_check
  before insert on public.prompt_opportunity_reviews
  for each row execute function public.ensure_prompt_opportunity_review_candidate_matches();

create or replace function public.ensure_prompt_opportunity_promotion_allowed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.promote_prompt_opportunity', true), '') <> 'on' then
    raise exception 'Prompt opportunity promotions must be created with promote_prompt_opportunity.';
  end if;

  if not exists (
    select 1
    from public.prompt_opportunities po
    where po.id = new.prompt_opportunity_id
      and po.project_id = new.project_id
      and po.status = 'approved'
      and po.approved_prompt_text = new.approved_prompt_text
      and po.approved_by = new.reviewer_id
      and po.approved_at = new.approved_at
  ) then
    raise exception 'Prompt opportunity promotion requires a matching approved opportunity.';
  end if;

  if new.candidate_id is not null and not exists (
    select 1
    from public.prompt_opportunity_candidates poc
    where poc.id = new.candidate_id
      and poc.project_id = new.project_id
      and poc.prompt_opportunity_id = new.prompt_opportunity_id
  ) then
    raise exception 'Promotion candidate must belong to the promoted opportunity.';
  end if;

  if not exists (
    select 1
    from public.prompt_versions pv
    join public.prompts p
      on p.id = pv.prompt_id
     and p.project_id = pv.project_id
    where pv.id = new.prompt_version_id
      and pv.project_id = new.project_id
      and pv.prompt_id = new.prompt_id
      and p.prompt_set_id = new.prompt_set_id
  ) then
    raise exception 'Promotion prompt version must belong to the selected prompt and prompt set.';
  end if;

  return new;
end;
$$;

create trigger prompt_opportunity_promotions_approved_check
  before insert on public.prompt_opportunity_promotions
  for each row execute function public.ensure_prompt_opportunity_promotion_allowed();

create or replace function public.ensure_prompt_promotion_evidence_is_linked_to_opportunity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.promote_prompt_opportunity', true), '') <> 'on' then
    raise exception 'Prompt promotion evidence must be created with promote_prompt_opportunity.';
  end if;

  if not exists (
    select 1
    from public.prompt_opportunity_promotions pop
    join public.prompt_opportunity_evidence poe
      on poe.prompt_opportunity_id = pop.prompt_opportunity_id
     and poe.project_id = pop.project_id
     and poe.evidence_record_id = new.evidence_record_id
    where pop.id = new.promotion_id
      and pop.project_id = new.project_id
  ) then
    raise exception 'Promotion evidence must already be linked to the promoted opportunity.';
  end if;

  return new;
end;
$$;

create trigger prompt_promotion_evidence_opportunity_link_check
  before insert or update on public.prompt_promotion_evidence
  for each row execute function public.ensure_prompt_promotion_evidence_is_linked_to_opportunity();

create or replace function public.promote_prompt_opportunity(
  target_project_id uuid,
  target_prompt_opportunity_id uuid,
  target_candidate_id uuid,
  target_prompt_set_id uuid,
  target_prompt_id uuid,
  target_prompt_version_id uuid,
  target_promoted_by uuid,
  target_evidence_record_ids jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opportunity public.prompt_opportunities%rowtype;
  inserted_promotion_id uuid;
  requested_evidence_count integer;
  linked_evidence_count integer;
begin
  if jsonb_typeof(coalesce(target_evidence_record_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Promotion evidence IDs must be a JSON array.';
  end if;

  select *
  into opportunity
  from public.prompt_opportunities po
  where po.id = target_prompt_opportunity_id
    and po.project_id = target_project_id
  for update;

  if not found then
    raise exception 'Prompt opportunity was not found for project.';
  end if;

  if opportunity.status <> 'approved' then
    raise exception 'Only approved opportunities can be promoted.';
  end if;

  if target_candidate_id is not null and not exists (
    select 1
    from public.prompt_opportunity_candidates poc
    where poc.id = target_candidate_id
      and poc.project_id = target_project_id
      and poc.prompt_opportunity_id = target_prompt_opportunity_id
  ) then
    raise exception 'Promotion candidate must belong to the promoted opportunity.';
  end if;

  if not exists (
    select 1
    from public.prompt_versions pv
    join public.prompts p
      on p.id = pv.prompt_id
     and p.project_id = pv.project_id
    join public.prompt_sets ps
      on ps.id = p.prompt_set_id
     and ps.project_id = p.project_id
    where pv.id = target_prompt_version_id
      and pv.project_id = target_project_id
      and pv.prompt_id = target_prompt_id
      and p.prompt_set_id = target_prompt_set_id
      and ps.id = target_prompt_set_id
  ) then
    raise exception 'Prompt set, prompt, and prompt version must belong to the same project and chain.';
  end if;

  select count(*)
  into requested_evidence_count
  from jsonb_array_elements_text(target_evidence_record_ids);

  if requested_evidence_count = 0 then
    raise exception 'Promotion requires at least one evidence record.';
  end if;

  with requested as (
    select distinct value::uuid as evidence_record_id
    from jsonb_array_elements_text(target_evidence_record_ids)
  )
  select count(*)
  into linked_evidence_count
  from requested r
  join public.prompt_opportunity_evidence poe
    on poe.evidence_record_id = r.evidence_record_id
   and poe.prompt_opportunity_id = target_prompt_opportunity_id
   and poe.project_id = target_project_id;

  if linked_evidence_count <> requested_evidence_count then
    raise exception 'All promotion evidence records must be linked to the approved opportunity.';
  end if;

  perform set_config('app.promote_prompt_opportunity', 'on', true);

  insert into public.prompt_opportunity_promotions (
    project_id,
    prompt_opportunity_id,
    candidate_id,
    prompt_set_id,
    prompt_id,
    prompt_version_id,
    approved_prompt_text,
    reviewer_id,
    approved_at,
    promoted_by
  )
  values (
    target_project_id,
    target_prompt_opportunity_id,
    target_candidate_id,
    target_prompt_set_id,
    target_prompt_id,
    target_prompt_version_id,
    opportunity.approved_prompt_text,
    opportunity.approved_by,
    opportunity.approved_at,
    target_promoted_by
  )
  returning id into inserted_promotion_id;

  insert into public.prompt_promotion_evidence(project_id, promotion_id, evidence_record_id)
  select target_project_id, inserted_promotion_id, value::uuid
  from jsonb_array_elements_text(target_evidence_record_ids);

  insert into public.prompt_opportunity_reviews (
    project_id,
    prompt_opportunity_id,
    candidate_id,
    reviewer_id,
    decision,
    from_status,
    to_status,
    reviewed_prompt_text,
    review_metadata
  )
  values (
    target_project_id,
    target_prompt_opportunity_id,
    target_candidate_id,
    target_promoted_by,
    'promote',
    'approved',
    'promoted',
    opportunity.approved_prompt_text,
    jsonb_build_object('promotion_id', inserted_promotion_id)
  );

  update public.prompt_opportunities
  set status = 'promoted',
      updated_at = now()
  where id = target_prompt_opportunity_id
    and project_id = target_project_id
    and status = 'approved';

  if not found then
    raise exception 'Approved opportunity could not be marked promoted.';
  end if;

  perform set_config('app.promote_prompt_opportunity', '', true);

  return inserted_promotion_id;
end;
$$;

revoke execute on function public.promote_prompt_opportunity(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.promote_prompt_opportunity(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;

alter table public.evidence_import_batches enable row level security;
alter table public.evidence_records enable row level security;
alter table public.prompt_opportunities enable row level security;
alter table public.prompt_opportunity_evidence enable row level security;
alter table public.prompt_opportunity_candidates enable row level security;
alter table public.prompt_candidate_evidence enable row level security;
alter table public.prompt_opportunity_reviews enable row level security;
alter table public.prompt_opportunity_promotions enable row level security;
alter table public.prompt_promotion_evidence enable row level security;

grant select, insert, update, delete on public.evidence_import_batches to authenticated;
grant select, insert, update, delete on public.evidence_records to authenticated;
grant select, insert, update, delete on public.prompt_opportunities to authenticated;
grant select, insert, update, delete on public.prompt_opportunity_evidence to authenticated;
grant select, insert, update, delete on public.prompt_opportunity_candidates to authenticated;
grant select, insert, update, delete on public.prompt_candidate_evidence to authenticated;
grant select, insert on public.prompt_opportunity_reviews to authenticated;
grant select, insert on public.prompt_opportunity_promotions to authenticated;
grant select, insert on public.prompt_promotion_evidence to authenticated;

create policy evidence_import_batches_project_access on public.evidence_import_batches
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy evidence_records_project_access on public.evidence_records
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_opportunities_project_access on public.prompt_opportunities
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_opportunity_evidence_project_access on public.prompt_opportunity_evidence
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_opportunity_candidates_project_access on public.prompt_opportunity_candidates
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_candidate_evidence_project_access on public.prompt_candidate_evidence
  for all using (public.user_can_access_project(project_id))
  with check (public.user_can_access_project(project_id));

create policy prompt_opportunity_reviews_project_select on public.prompt_opportunity_reviews
  for select using (public.user_can_access_project(project_id));

create policy prompt_opportunity_reviews_project_insert on public.prompt_opportunity_reviews
  for insert with check (public.user_can_access_project(project_id));

create policy prompt_opportunity_promotions_project_select on public.prompt_opportunity_promotions
  for select using (public.user_can_access_project(project_id));

create policy prompt_opportunity_promotions_project_insert on public.prompt_opportunity_promotions
  for insert with check (public.user_can_access_project(project_id));

create policy prompt_promotion_evidence_project_select on public.prompt_promotion_evidence
  for select using (public.user_can_access_project(project_id));

create policy prompt_promotion_evidence_project_insert on public.prompt_promotion_evidence
  for insert with check (public.user_can_access_project(project_id));
