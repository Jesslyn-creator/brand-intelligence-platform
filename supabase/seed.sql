insert into public.organisations (id, organisation_name, created_at)
values ('00000000-0000-4000-8000-000000000001', 'Internal Admin Organisation', '2026-08-03T00:00:00.000Z')
on conflict (id) do nothing;

insert into public.projects (id, organisation_id, project_name, market, default_language, active, created_at)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Domestic Helper Search Visibility',
  'Singapore',
  'English',
  true,
  '2026-08-03T00:00:00.000Z'
)
on conflict (id) do nothing;

insert into public.brands (id, organisation_id, brand_name, created_at)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  'Nation Maid Agency',
  '2026-08-03T00:00:00.000Z'
)
on conflict (id) do nothing;

insert into public.brand_aliases (brand_id, alias, active, created_at)
values
  ('00000000-0000-4000-8000-000000000201', 'Nation Maid', true, '2026-08-03T00:00:00.000Z'),
  ('00000000-0000-4000-8000-000000000201', 'Nation Maid Agency Singapore', true, '2026-08-03T00:00:00.000Z')
on conflict (brand_id, normalized_alias) do nothing;

insert into public.brand_domains (brand_id, domain, is_primary, active, created_at)
values ('00000000-0000-4000-8000-000000000201', 'nationmaid.com.sg', true, true, '2026-08-03T00:00:00.000Z')
on conflict (brand_id, normalized_domain) do nothing;

insert into public.project_brands (id, project_id, organisation_id, brand_id, brand_role, active, created_at)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000201',
  'target',
  true,
  '2026-08-03T00:00:00.000Z'
)
on conflict (project_id, brand_id, brand_role) do nothing;
