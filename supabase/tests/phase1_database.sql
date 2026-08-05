begin;

select plan(16);

select has_table('public', 'responses', 'responses table exists');
select has_table('public', 'evaluation_runs', 'evaluation runs table exists');
select has_table('public', 'provider_test_runs', 'provider test runs table exists');
select has_table('public', 'response_analyses', 'response analyses table exists');
select has_table('public', 'brand_aliases', 'brand aliases table exists');
select has_table('public', 'brand_domains', 'brand domains table exists');

select col_is_unique('public', 'responses', array['test_run_item_id', 'attempt_number'], 'response attempts are unique per item and attempt number');
select has_index('public', 'response_analyses', 'response_analyses_one_current_completed_idx', 'one current completed analysis index exists');
select has_index('public', 'project_brands', 'project_brands_one_active_target_idx', 'one active target brand per project index exists');
select has_index('public', 'provider_test_runs', 'provider_test_runs_evaluation_provider_idx', 'provider run index exists');

select policies_are('public', 'responses', array['responses_project_access'], 'responses have explicit RLS policy');
select policies_are('public', 'test_run_items', array['test_run_items_project_access'], 'run items have explicit RLS policy');
select policies_are('public', 'brands', array['brands_member_access'], 'brands have organisation-scoped RLS policy');
select policies_are('public', 'evaluation_runs', array['evaluation_runs_project_access'], 'evaluation runs have explicit RLS policy');
select policies_are('public', 'provider_test_runs', array['provider_test_runs_project_access'], 'provider test runs have explicit RLS policy');

select lives_ok(
  $$select * from public.claim_test_run_items('00000000-0000-4000-8000-000000000000', 1, 'test-worker')$$,
  'claiming function is callable'
);

select lives_ok(
  $$select * from public.claim_provider_test_run_items('00000000-0000-4000-8000-000000000000', 1, 'test-worker', 3)$$,
  'provider claiming function is callable'
);

select * from finish();

rollback;
