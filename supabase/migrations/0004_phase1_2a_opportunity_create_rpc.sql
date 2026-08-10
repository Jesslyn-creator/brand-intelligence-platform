create or replace function public.create_prompt_opportunity_with_evidence(
  target_project_id uuid,
  target_topic text,
  target_market text,
  target_language text,
  target_evidence_record_ids jsonb,
  target_intent text default 'unknown'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  created_opportunity_id uuid;
  evidence_count integer;
  distinct_evidence_count integer;
  linked_count integer;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required to create prompt opportunities.';
  end if;

  if target_project_id is null then
    raise exception 'project_id is required.';
  end if;

  if not public.user_can_access_project(target_project_id) then
    raise exception 'Project was not found or is not accessible.';
  end if;

  if nullif(trim(coalesce(target_topic, '')), '') is null then
    raise exception 'topic is required.';
  end if;

  if nullif(trim(coalesce(target_market, '')), '') is null then
    raise exception 'market is required.';
  end if;

  if nullif(trim(coalesce(target_language, '')), '') is null then
    raise exception 'language is required.';
  end if;

  if target_intent is null or target_intent not in ('informational', 'comparison', 'recommendation', 'transactional', 'support', 'unknown') then
    raise exception 'intent is not supported.';
  end if;

  if target_evidence_record_ids is null or jsonb_typeof(target_evidence_record_ids) <> 'array' then
    raise exception 'evidence_record_ids must be a non-empty JSON array.';
  end if;

  select count(*)::integer
  into evidence_count
  from jsonb_array_elements(target_evidence_record_ids) as evidence_id(value);

  if evidence_count = 0 then
    raise exception 'At least one evidence record is required.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_evidence_record_ids) as evidence_id(value)
    where jsonb_typeof(evidence_id.value) <> 'string'
      or evidence_id.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'evidence_record_ids must contain only valid UUID strings.';
  end if;

  select count(distinct evidence_id.value #>> '{}')::integer
  into distinct_evidence_count
  from jsonb_array_elements(target_evidence_record_ids) as evidence_id(value);

  if distinct_evidence_count <> evidence_count then
    raise exception 'Duplicate evidence_record_ids are not allowed.';
  end if;

  with requested_evidence as (
    select (evidence_id.value #>> '{}')::uuid as id
    from jsonb_array_elements(target_evidence_record_ids) as evidence_id(value)
  )
  select count(*)::integer
  into linked_count
  from public.evidence_records er
  join requested_evidence re on re.id = er.id
  where er.project_id = target_project_id;

  if linked_count <> evidence_count then
    raise exception 'One or more evidence records were not found for the project.';
  end if;

  insert into public.prompt_opportunities(project_id, topic, intent, market, language, created_by)
  values (
    target_project_id,
    trim(target_topic),
    target_intent,
    trim(target_market),
    trim(target_language),
    caller_id
  )
  returning id into created_opportunity_id;

  insert into public.prompt_opportunity_evidence(project_id, prompt_opportunity_id, evidence_record_id, linked_by)
  select
    target_project_id,
    created_opportunity_id,
    (evidence_id.value #>> '{}')::uuid,
    caller_id
  from jsonb_array_elements(target_evidence_record_ids) as evidence_id(value);

  return created_opportunity_id;
end;
$$;

revoke execute on function public.create_prompt_opportunity_with_evidence(uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_prompt_opportunity_with_evidence(uuid, text, text, text, jsonb, text) to authenticated;
