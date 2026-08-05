begin;

select plan(96);

select has_table('public', 'responses', 'responses table exists');
select has_table('public', 'evaluation_runs', 'evaluation runs table exists');
select has_table('public', 'provider_test_runs', 'provider test runs table exists');
select has_table('public', 'response_analyses', 'response analyses table exists');
select has_table('public', 'brand_aliases', 'brand aliases table exists');
select has_table('public', 'brand_domains', 'brand domains table exists');
select has_table('public', 'evidence_import_batches', 'evidence import batches table exists');
select has_table('public', 'evidence_records', 'evidence records table exists');
select has_table('public', 'prompt_opportunities', 'prompt opportunities table exists');
select has_table('public', 'prompt_opportunity_evidence', 'prompt opportunity evidence join table exists');
select has_table('public', 'prompt_opportunity_candidates', 'prompt opportunity candidates table exists');
select has_table('public', 'prompt_candidate_evidence', 'prompt candidate evidence join table exists');
select has_table('public', 'prompt_opportunity_reviews', 'prompt opportunity reviews table exists');
select has_table('public', 'prompt_opportunity_promotions', 'prompt opportunity promotions table exists');
select has_table('public', 'prompt_promotion_evidence', 'prompt promotion evidence join table exists');

select col_is_unique('public', 'responses', array['test_run_item_id', 'attempt_number'], 'response attempts are unique per item and attempt number');
select has_index('public', 'response_analyses', 'response_analyses_one_current_completed_idx', 'one current completed analysis index exists');
select has_index('public', 'project_brands', 'project_brands_one_active_target_idx', 'one active target brand per project index exists');
select has_index('public', 'provider_test_runs', 'provider_test_runs_evaluation_provider_idx', 'provider run index exists');
select has_index('public', 'evidence_records', 'evidence_records_project_topic_idx', 'evidence topic index exists');

select policies_are('public', 'responses', array['responses_project_access'], 'responses have explicit RLS policy');
select policies_are('public', 'test_run_items', array['test_run_items_project_access'], 'run items have explicit RLS policy');
select policies_are('public', 'brands', array['brands_member_access'], 'brands have organisation-scoped RLS policy');
select policies_are('public', 'evaluation_runs', array['evaluation_runs_project_access'], 'evaluation runs have explicit RLS policy');
select policies_are('public', 'provider_test_runs', array['provider_test_runs_project_access'], 'provider test runs have explicit RLS policy');
select policies_are('public', 'evidence_import_batches', array['evidence_import_batches_project_access'], 'evidence import batches have explicit RLS policy');
select policies_are('public', 'evidence_records', array['evidence_records_project_access'], 'evidence records have explicit RLS policy');
select policies_are('public', 'prompt_opportunities', array['prompt_opportunities_project_access'], 'prompt opportunities have explicit RLS policy');
select policies_are('public', 'prompt_opportunity_evidence', array['prompt_opportunity_evidence_project_access'], 'opportunity evidence links have explicit RLS policy');
select policies_are('public', 'prompt_opportunity_candidates', array['prompt_opportunity_candidates_project_access'], 'opportunity candidates have explicit RLS policy');
select policies_are('public', 'prompt_candidate_evidence', array['prompt_candidate_evidence_project_access'], 'candidate evidence links have explicit RLS policy');
select policies_are('public', 'prompt_opportunity_reviews', array['prompt_opportunity_reviews_project_select', 'prompt_opportunity_reviews_project_insert'], 'opportunity reviews have select and insert RLS policies only');
select policies_are('public', 'prompt_opportunity_promotions', array['prompt_opportunity_promotions_project_select', 'prompt_opportunity_promotions_project_insert'], 'opportunity promotions have select and insert RLS policies only');
select policies_are('public', 'prompt_promotion_evidence', array['prompt_promotion_evidence_project_select', 'prompt_promotion_evidence_project_insert'], 'promotion evidence links have select and insert RLS policies only');

select col_is_unique('public', 'evidence_records', array['project_id', 'source_type', 'dedupe_hash'], 'duplicate evidence is rejected by project source and hash');
select col_is_unique('public', 'prompt_opportunity_evidence', array['prompt_opportunity_id', 'evidence_record_id'], 'opportunity evidence links are unique');
select col_is_unique('public', 'prompt_candidate_evidence', array['candidate_id', 'evidence_record_id'], 'candidate evidence links are unique');
select col_is_unique('public', 'prompt_opportunity_promotions', array['prompt_opportunity_id'], 'first version allows one promotion per opportunity');
select col_is_unique('public', 'prompt_promotion_evidence', array['promotion_id', 'evidence_record_id'], 'promotion evidence links are unique');

select lives_ok(
  $$select * from public.claim_test_run_items('00000000-0000-4000-8000-000000000000', 1, 'test-worker')$$,
  'claiming function is callable'
);

select lives_ok(
  $$select * from public.claim_provider_test_run_items('00000000-0000-4000-8000-000000000000', 1, 'test-worker', 3)$$,
  'provider claiming function is callable'
);

select lives_ok(
  $$
    insert into public.organisations(id, organisation_name)
    values ('10000000-0000-4000-8000-000000000001', 'Phase 1.2A Org One'),
           ('10000000-0000-4000-8000-000000000002', 'Phase 1.2A Org Two');

    insert into public.organisation_members(organisation_id, user_id)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
           ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');

    insert into public.projects(id, organisation_id, project_name, market, default_language)
    values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Phase 1.2A Project One', 'Singapore', 'en'),
           ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Phase 1.2A Project Two', 'Singapore', 'en');

    insert into public.prompt_sets(id, project_id, prompt_set_name)
    values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Evidence-backed prompts'),
           ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Evidence-backed prompts two');

    insert into public.prompts(id, project_id, prompt_set_id, category, intent, market, language)
    values ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Discovery', 'recommendation', 'Singapore', 'en'),
           ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Discovery', 'recommendation', 'Singapore', 'en');

    insert into public.prompt_versions(id, prompt_id, project_id, version_number, prompt_text, content_hash)
    values ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1, 'Which providers are recommended?', 'hash-phase-12a-1'),
           ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 1, 'Which providers are trusted?', 'hash-phase-12a-2');

    insert into public.evidence_import_batches(id, project_id, source_type, import_name, imported_by, market, language, source_date_start, source_date_end, import_status)
    values ('70000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'gsc_csv', 'GSC import', '20000000-0000-4000-8000-000000000001', 'Singapore', 'en', current_date - 7, current_date, 'completed'),
           ('70000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'gsc_csv', 'GSC import two', '20000000-0000-4000-8000-000000000002', 'Singapore', 'en', current_date - 7, current_date, 'completed');

    insert into public.evidence_records(id, project_id, import_batch_id, source_type, source_record_reference, source_date, market, language, topic, evidence_text, metrics, raw_record, dedupe_hash)
    values ('80000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'gsc_csv', 'row-1', current_date, 'Singapore', 'en', 'Hiring help', 'maid agency recommendations', '{"clicks":10,"impressions":100}'::jsonb, '{"query":"maid agency recommendations"}'::jsonb, 'dedupe-1'),
           ('80000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'gsc_csv', 'row-3', current_date, 'Singapore', 'en', 'Trusted hiring help', 'trusted maid agency', '{"clicks":3,"impressions":30}'::jsonb, '{"query":"trusted maid agency"}'::jsonb, 'dedupe-3'),
           ('80000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'gsc_csv', 'row-1', current_date, 'Singapore', 'en', 'Hiring help', 'maid agency recommendations', '{"clicks":5,"impressions":50}'::jsonb, '{"query":"maid agency recommendations"}'::jsonb, 'dedupe-1');
  $$,
  'valid evidence creation succeeds'
);

select throws_ok(
  $$insert into public.evidence_import_batches(project_id, source_type, import_name, imported_by, market, language, source_date_start, source_date_end)
    values ('30000000-0000-4000-8000-000000000001', 'gsc_csv', 'Bad date import', '20000000-0000-4000-8000-000000000001', 'Singapore', 'en', current_date, current_date - 1)$$,
  'P0001',
  null,
  'invalid import batch date range is rejected'
);

select throws_ok(
  $$insert into public.evidence_records(project_id, import_batch_id, source_type, source_record_reference, market, language, evidence_text, dedupe_hash)
    values ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'gsc_csv', 'row-duplicate', 'Singapore', 'en', 'duplicate', 'dedupe-1')$$,
  '23505',
  null,
  'duplicate evidence is prevented'
);

select throws_ok(
  $$insert into public.evidence_records(project_id, import_batch_id, source_type, source_record_reference, market, language, evidence_text, dedupe_hash)
    values ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'google_ads_search_terms_csv', 'row-source-mismatch', 'Singapore', 'en', 'mismatch', 'dedupe-source-mismatch')$$,
  'P0001',
  null,
  'evidence source type must match import batch'
);

select lives_ok(
  $$
    insert into public.prompt_opportunities(id, project_id, topic, intent, market, language, created_by)
    values ('90000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Hiring help', 'recommendation', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'),
           ('90000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Trusted hiring help', 'recommendation', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'),
           ('90000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Other hiring help', 'recommendation', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001');

    insert into public.prompt_opportunity_evidence(project_id, prompt_opportunity_id, evidence_record_id, linked_by)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
           ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001');

    insert into public.prompt_opportunity_candidates(id, project_id, prompt_opportunity_id, candidate_text, generation_provider, generation_model, generation_template_version)
    values ('91000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Which providers are recommended for hiring help in Singapore?', 'openai', 'classifier-model', 'prompt-opportunity-v1'),
           ('91000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'Which providers are trusted for hiring help in Singapore?', 'openai', 'classifier-model', 'prompt-opportunity-v1');

    insert into public.prompt_candidate_evidence(project_id, candidate_id, evidence_record_id)
    values ('30000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001');
  $$,
  'valid opportunity and candidate evidence links succeed'
);

select throws_ok(
  $$insert into public.prompt_opportunity_evidence(project_id, prompt_opportunity_id, evidence_record_id, linked_by)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001')$$,
  '23503',
  null,
  'cross-project opportunity evidence link is rejected'
);

select throws_ok(
  $$insert into public.prompt_candidate_evidence(project_id, candidate_id, evidence_record_id)
    values ('30000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000003')$$,
  'P0001',
  null,
  'candidate evidence must already be linked to candidate opportunity'
);

select throws_ok(
  $$insert into public.prompt_opportunity_reviews(project_id, prompt_opportunity_id, candidate_id, reviewer_id, decision)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'comment')$$,
  'P0001',
  null,
  'same-project candidate from another opportunity is rejected in reviews'
);

select lives_ok(
  $$insert into public.prompt_opportunity_reviews(project_id, prompt_opportunity_id, candidate_id, reviewer_id, decision)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null, '20000000-0000-4000-8000-000000000001', 'comment')$$,
  'nullable review candidate is allowed'
);

select throws_ok(
  $$insert into public.prompt_opportunities(project_id, topic, market, language, created_by, final_priority)
    values ('30000000-0000-4000-8000-000000000001', 'Priority missing reviewer', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001', 'high')$$,
  '23514',
  null,
  'priority without reviewer and timestamp is rejected'
);

select throws_ok(
  $$insert into public.prompt_opportunities(project_id, topic, market, language, created_by, final_priority_by, final_priority_at)
    values ('30000000-0000-4000-8000-000000000001', 'Reviewer missing priority', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now())$$,
  '23514',
  null,
  'reviewer and timestamp without priority is rejected'
);

select lives_ok(
  $$
    update public.prompt_opportunities
    set final_priority = 'medium',
        final_priority_by = '20000000-0000-4000-8000-000000000001',
        final_priority_at = now()
    where id = '90000000-0000-4000-8000-000000000003';

    update public.prompt_opportunities
    set final_priority = null,
        final_priority_by = null,
        final_priority_at = null
    where id = '90000000-0000-4000-8000-000000000003';
  $$,
  'clearing all final priority fields succeeds'
);

select lives_ok(
  $$update public.prompt_opportunities
    set final_priority = 'high',
        final_priority_by = '20000000-0000-4000-8000-000000000001',
        final_priority_at = now()
    where id = '90000000-0000-4000-8000-000000000003'$$,
  'changing all final priority fields succeeds'
);

select lives_ok(
  $$insert into public.prompt_opportunities(project_id, topic, market, language, created_by)
    values ('30000000-0000-4000-8000-000000000001', 'Initial insert status test', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001')$$,
  'status triggers do not block valid initial inserts'
);

select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, created_by) values ('a0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'new to review', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'under_review' where id = 'a0000000-0000-4000-8000-000000000001'$$, 'new to under_review is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, created_by) values ('a0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'new to approved', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'approved', approved_prompt_text = 'approved prompt', approved_by = '20000000-0000-4000-8000-000000000001', approved_at = now() where id = 'a0000000-0000-4000-8000-000000000002'$$, 'new to approved is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, created_by) values ('a0000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'new to rejected', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'rejected', rejected_by = '20000000-0000-4000-8000-000000000001', rejected_at = now() where id = 'a0000000-0000-4000-8000-000000000003'$$, 'new to rejected is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, created_by) values ('a0000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'new to exploratory', 'Singapore', 'en', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'exploratory', exploratory_reason = 'test' where id = 'a0000000-0000-4000-8000-000000000004'$$, 'new to exploratory is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, status, created_by) values ('a0000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'review to approved', 'Singapore', 'en', 'under_review', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'approved', approved_prompt_text = 'approved prompt', approved_by = '20000000-0000-4000-8000-000000000001', approved_at = now() where id = 'a0000000-0000-4000-8000-000000000005'$$, 'under_review to approved is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, status, created_by) values ('a0000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', 'review to rejected', 'Singapore', 'en', 'under_review', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'rejected', rejected_by = '20000000-0000-4000-8000-000000000001', rejected_at = now() where id = 'a0000000-0000-4000-8000-000000000006'$$, 'under_review to rejected is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, status, created_by) values ('a0000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000001', 'review to exploratory', 'Singapore', 'en', 'under_review', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'exploratory', exploratory_reason = 'test' where id = 'a0000000-0000-4000-8000-000000000007'$$, 'under_review to exploratory is allowed');
select lives_ok($$update public.prompt_opportunities set status = 'under_review' where id = 'a0000000-0000-4000-8000-000000000002'$$, 'approved to under_review is allowed before promotion');
select lives_ok($$update public.prompt_opportunities set status = 'under_review' where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rejected to under_review is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, status, rejected_by, rejected_at, created_by) values ('a0000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000001', 'rejected to exploratory', 'Singapore', 'en', 'rejected', '20000000-0000-4000-8000-000000000001', now(), '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'exploratory', exploratory_reason = 'test' where id = 'a0000000-0000-4000-8000-000000000008'$$, 'rejected to exploratory is allowed');
select lives_ok($$update public.prompt_opportunities set status = 'under_review' where id = 'a0000000-0000-4000-8000-000000000004'$$, 'exploratory to under_review is allowed');
select lives_ok($$insert into public.prompt_opportunities(id, project_id, topic, market, language, status, exploratory_reason, created_by) values ('a0000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000001', 'exploratory to rejected', 'Singapore', 'en', 'exploratory', 'test', '20000000-0000-4000-8000-000000000001'); update public.prompt_opportunities set status = 'rejected', rejected_by = '20000000-0000-4000-8000-000000000001', rejected_at = now() where id = 'a0000000-0000-4000-8000-000000000009'$$, 'exploratory to rejected is allowed');

select throws_ok($$update public.prompt_opportunities set status = 'promoted' where id = '90000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'new to promoted is rejected');
select throws_ok($$update public.prompt_opportunities set status = 'promoted' where id = 'a0000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'under_review to promoted is rejected');
select throws_ok($$update public.prompt_opportunities set status = 'approved', approved_prompt_text = 'bad', approved_by = '20000000-0000-4000-8000-000000000001', approved_at = now() where id = 'a0000000-0000-4000-8000-000000000009'$$, 'P0001', null, 'rejected to approved is rejected');

select throws_ok(
  $$insert into public.prompt_opportunity_promotions(project_id, prompt_opportunity_id, prompt_set_id, prompt_id, prompt_version_id, approved_prompt_text, reviewer_id, approved_at, promoted_by)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Which providers are recommended for hiring help in Singapore?', '20000000-0000-4000-8000-000000000001', now(), '20000000-0000-4000-8000-000000000001')$$,
  'P0001',
  null,
  'direct promotion insertion is rejected'
);

select throws_ok(
  $$select public.promote_prompt_opportunity('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null, '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '["80000000-0000-4000-8000-000000000001"]'::jsonb)$$,
  'P0001',
  null,
  'promotion from non-approved opportunity is rejected'
);

select lives_ok(
  $$
    update public.prompt_opportunities
    set status = 'approved',
        approved_prompt_text = 'Which providers are recommended for hiring help in Singapore?',
        approved_by = '20000000-0000-4000-8000-000000000001',
        approved_at = now(),
        final_priority = 'high',
        final_priority_by = '20000000-0000-4000-8000-000000000001',
        final_priority_at = now()
    where id = '90000000-0000-4000-8000-000000000001';

    insert into public.prompt_opportunity_reviews(id, project_id, prompt_opportunity_id, candidate_id, reviewer_id, decision, from_status, to_status, reviewed_prompt_text)
    values ('92000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'approve', 'new', 'approved', 'Which providers are recommended for hiring help in Singapore?');
  $$,
  'approval setup succeeds'
);

select throws_ok(
  $$select public.promote_prompt_opportunity('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '["80000000-0000-4000-8000-000000000001"]'::jsonb)$$,
  'P0001',
  null,
  'same-project candidate from another opportunity is rejected in promotions'
);

select throws_ok(
  $$select public.promote_prompt_opportunity('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null, '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '["80000000-0000-4000-8000-000000000002"]'::jsonb)$$,
  'P0001',
  null,
  'invalid evidence causes promotion function to fail'
);

select is((select count(*)::int from public.prompt_opportunity_promotions where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001'), 0, 'invalid promotion leaves no promotion row');
select is((select status from public.prompt_opportunities where id = '90000000-0000-4000-8000-000000000001'), 'approved', 'invalid promotion leaves opportunity approved');

select lives_ok(
  $$select public.promote_prompt_opportunity('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null, '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '["80000000-0000-4000-8000-000000000001"]'::jsonb)$$,
  'approved opportunity promotion succeeds with nullable candidate'
);

select is((select status from public.prompt_opportunities where id = '90000000-0000-4000-8000-000000000001'), 'promoted', 'opportunity becomes promoted in the same operation');
select is((select count(*)::int from public.prompt_opportunity_promotions where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001'), 1, 'promotion row exists');
select is((select count(*)::int from public.prompt_promotion_evidence ppe join public.prompt_opportunity_promotions pop on pop.id = ppe.promotion_id where pop.prompt_opportunity_id = '90000000-0000-4000-8000-000000000001'), 1, 'promotion evidence row exists');
select throws_ok($$update public.prompt_opportunities set status = 'under_review' where id = '90000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'promoted is terminal');
select throws_ok($$select public.promote_prompt_opportunity('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null, '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '["80000000-0000-4000-8000-000000000001"]'::jsonb)$$, 'P0001', null, 'duplicate promotion fails');
select throws_ok(
  $$insert into public.prompt_opportunity_promotions(project_id, prompt_opportunity_id, prompt_set_id, prompt_id, prompt_version_id, approved_prompt_text, reviewer_id, approved_at, promoted_by)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Which providers are recommended for hiring help in Singapore?', '20000000-0000-4000-8000-000000000001', now(), '20000000-0000-4000-8000-000000000001')$$,
  'P0001',
  null,
  'direct promotion insertion is still rejected after function success'
);

select throws_ok($$update public.prompt_opportunity_reviews set decision_reason = 'changed' where id = '92000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'review updates are rejected');
select throws_ok($$delete from public.prompt_opportunity_reviews where id = '92000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'review deletes are rejected');
select throws_ok($$update public.prompt_opportunity_promotions set promotion_metadata = '{"changed":true}'::jsonb where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'promotion updates are rejected');
select throws_ok($$delete from public.prompt_opportunity_promotions where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'promotion deletes are rejected');
select throws_ok($$update public.prompt_promotion_evidence set linked_at = now() where promotion_id in (select id from public.prompt_opportunity_promotions where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001')$$, 'P0001', null, 'promotion evidence updates are rejected');
select throws_ok($$delete from public.prompt_promotion_evidence where promotion_id in (select id from public.prompt_opportunity_promotions where prompt_opportunity_id = '90000000-0000-4000-8000-000000000001')$$, 'P0001', null, 'promotion evidence deletes are rejected');
select throws_ok($$update public.prompt_versions set prompt_text = 'changed' where id = '60000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'prompt version updates are rejected');
select throws_ok($$delete from public.prompt_versions where id = '60000000-0000-4000-8000-000000000001'$$, 'P0001', null, 'prompt version deletes are rejected');

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';

select is((select count(*)::int from public.evidence_records where project_id = '30000000-0000-4000-8000-000000000001'), 2, 'user A can select project A evidence');
select is((select count(*)::int from public.evidence_records where project_id = '30000000-0000-4000-8000-000000000002'), 0, 'user A cannot select project B evidence');
select throws_ok(
  $$insert into public.evidence_import_batches(project_id, source_type, import_name, imported_by, market, language)
    values ('30000000-0000-4000-8000-000000000002', 'gsc_csv', 'Forbidden import', '20000000-0000-4000-8000-000000000001', 'Singapore', 'en')$$,
  '42501',
  null,
  'user A cannot insert using project B project_id'
);
select throws_ok(
  $$insert into public.prompt_opportunity_evidence(project_id, prompt_opportunity_id, evidence_record_id, linked_by)
    values ('30000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001')$$,
  '23503',
  null,
  'user A cannot cross-link project A opportunity to project B evidence'
);

reset role;

select * from finish();

rollback;
