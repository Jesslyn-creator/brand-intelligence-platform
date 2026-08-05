# Phase 1.2 Prompt Opportunities Specification

This specification defines Prompt Opportunities as an evidence-backed workflow for deciding which prompts should be tested next.

It follows the constraints in:

- `docs/reference-gap-analysis.md`
- `docs/scoring-principles.md`
- `docs/product-ia.md`

No application code, migrations, routes, API handlers, or UI components are defined as implemented by this document.

## Product Position

Prompt Opportunities sits under:

```text
AI Visibility
- Prompts
- Opportunities
- Evaluations
- Results
```

Phase 1.2 keeps the interface intentionally simple:

- Evidence Import page
- Opportunities List page
- Opportunity Detail page

There are no separate clustering, analytics, automation, audit, persona, or battlecard pages in Phase 1.2A.

## Phase 1.2A Scope

Phase 1.2A includes:

- GSC CSV import
- Google Ads Search Terms CSV import
- manual customer enquiry entry
- manual competitor topic entry
- manual topic assignment
- normalized-topic duplicate warning
- opportunity list
- opportunity detail
- AI-generated wording candidates
- human approve, edit-approve, reject and exploratory decisions
- promotion into immutable prompt versions
- append-only review and promotion history

Phase 1.2A does not include:

- automatic topic clustering
- cluster split or merge
- automatic topic-to-existing-prompt matching
- automatic visibility-gap calculation
- automatic priority finalization

## Phase 1.2B Deferred Scope

Phase 1.2B is deferred and includes:

- automatic topic clustering
- split and merge workflow
- visibility-gap matching
- automatic priority suggestions
- external API sync
- crawlers

Additional deferred items:

- GSC API sync
- Google Ads API sync
- GA4 API sync
- competitor crawler
- public forum crawler
- autonomous prompt approval
- persona fan-out
- numeric opportunity score
- circular Visibility Index changes
- automation and scheduling
- dedicated analytics page
- AEO audit
- battlecards

## Lifecycle

Phase 1.2A lifecycle:

```text
Evidence source
-> evidence import batch
-> normalized evidence records
-> manual topic assignment
-> prompt opportunity
-> AI-generated wording candidates
-> human review
-> approve / edit-approve / reject / exploratory
-> promote approved opportunity
-> immutable prompt version
```

Detailed lifecycle:

1. Administrator imports or enters evidence.
2. System records an import batch.
3. System stores normalized and raw evidence records.
4. Administrator assigns or confirms a topic manually.
5. System warns if another active opportunity has the same normalized topic, market, and language.
6. Administrator creates or updates a prompt opportunity linked to evidence records.
7. AI may generate wording candidates from the linked evidence.
8. Human reviewer reviews candidate wording and evidence.
9. Reviewer approves, edit-approves, rejects, or marks the opportunity exploratory.
10. Approved opportunity can be promoted to an immutable prompt version in a selected prompt set.

AI-generated prompt wording is not evidence. It is a candidate expression of evidence that must be reviewed by a human.

## Page Responsibilities

### Evidence Import Page

Primary task: add evidence that may justify future prompts.

Supported Phase 1.2A evidence inputs:

- GSC CSV import
- Google Ads Search Terms CSV import
- manual customer enquiry entry
- manual competitor topic entry

Responsibilities:

- create `evidence_import_batches`
- parse source rows
- store `evidence_records`
- show duplicate evidence warnings using dedupe hashes
- allow manual topic assignment
- allow market and language confirmation
- allow creation of prompt opportunities from selected evidence records

Do not automatically cluster topics in Phase 1.2A.

### Opportunities List Page

Primary task: decide which evidence-backed prompt ideas need review.

Filters:

| Filter | Values |
| --- | --- |
| Status | new, under_review, approved, rejected, exploratory, promoted |
| Suggested priority | high, medium, low, none |
| Final priority | high, medium, low, unset |
| Source type | GSC CSV, Google Ads CSV, customer enquiry, competitor topic |
| Market | project markets |
| Language | project languages |
| Intent | informational, comparison, recommendation, transactional, support, unknown |
| Freshness | last 7 days, 30 days, 90 days, stale |
| Visibility state | not evaluated, related prompt manually linked, no related prompt linked |
| Reviewer | unassigned, assigned, reviewed by |
| Promotion state | unpromoted, promoted |

Columns:

| Column | Description |
| --- | --- |
| Topic | Human-reviewed topic |
| Suggested prompt | Current selected or top candidate wording |
| Intent | Opportunity intent |
| Market / language | Explicit scope |
| Suggested priority | System suggestion, if available |
| Final priority | Human-confirmed priority |
| Status | Lifecycle status |
| Evidence sources | Source badges |
| Evidence count | Number of linked evidence records |
| Freshness | Newest linked source date |
| Visibility state | not evaluated, related prompt manually linked, no related prompt linked |
| Reviewer | Last reviewer or unassigned |
| Updated | Last review/update timestamp |
| Actions | Review, approve, edit-approve, reject, exploratory, promote when eligible |

Priority labels:

- high
- medium
- low

Status labels:

- new
- under_review
- approved
- rejected
- exploratory
- promoted

Evidence source indicators:

- GSC
- Ads
- Customer
- Competitor

Visibility indicators in Phase 1.2A:

- not evaluated
- related prompt manually linked
- no related prompt linked

Do not infer visibility gaps automatically from topic similarity in Phase 1.2A.

### Opportunity Detail Page

Primary task: review evidence and decide whether the opportunity should become an official prompt.

Required content:

| Section | Content |
| --- | --- |
| Summary | suggested prompt, topic, intent, market, language, status |
| Priority | suggested priority, rationale, final priority, final priority reviewer/timestamp |
| Evidence sources | linked evidence records, source type, source date, import batch |
| Evidence metrics | source-specific transparent metrics |
| Evidence freshness | newest source date, oldest source date, stale flag |
| Visibility state | not evaluated, related prompt manually linked, no related prompt linked |
| Manual related prompt link | existing prompt selected by reviewer, if any |
| Visibility metrics | only shown when reviewer manually links an existing prompt |
| Generated wording candidates | candidate text, provider, model, template version, evidence links |
| Reviewer history | append-only decisions and comments |
| Actions | approve, edit-approve, reject, mark exploratory, confirm priority, promote |

Evidence metrics by source:

| Source | Metrics |
| --- | --- |
| GSC CSV | query, clicks, impressions, CTR, average position, page URL, date range |
| Google Ads Search Terms CSV | search term, impressions, clicks, cost if present, conversions if present, date range |
| Customer enquiry | enquiry text, count/frequency, source date, manually assigned topic |
| Competitor topic | competitor brand, topic, source note, source date, manually assigned relevance |

Visibility data in Phase 1.2A:

- Show `not evaluated` by default.
- Show `no related prompt linked` when there is no manual link.
- Show `related prompt manually linked` when a reviewer links an existing prompt.
- Only show mention, recommendation, citation, and provider metrics when a reviewer manually links an existing prompt.
- Do not automatically infer a visibility gap from topic similarity.

## Revised Normalized Schema

All tables are project-scoped and must support RLS using the existing project access model.

### `evidence_import_batches`

Purpose: records each evidence import or manual entry batch.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| source_type | `gsc_csv`, `google_ads_search_terms_csv`, `customer_enquiry`, `competitor_topic` |
| import_name | user-visible name |
| imported_by | auth user id |
| imported_at | timestamp |
| source_file_name | nullable |
| source_date_start | nullable date |
| source_date_end | nullable date |
| market | required |
| language | required |
| row_count | integer |
| successful_record_count | integer |
| duplicate_record_count | integer |
| failed_record_count | integer |
| import_status | `pending`, `completed`, `failed`, `partial` |
| import_error | nullable text |
| raw_metadata | jsonb |

Constraints and indexes:

- check `source_type`
- check `import_status`
- index `(project_id, imported_at desc)`
- index `(project_id, source_type, imported_at desc)`

### `evidence_records`

Purpose: stores original normalized and raw source evidence. Evidence records are separate from prompt opportunities.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| import_batch_id | required, references `evidence_import_batches` |
| source_type | copied from batch for filtering |
| source_record_reference | source row key, external reference, or generated reference |
| source_date | nullable date |
| market | required |
| language | required |
| topic | nullable manual topic |
| normalized_topic | nullable normalized manual topic |
| evidence_text | query, search term, enquiry, or competitor topic |
| source_url | nullable |
| metrics | jsonb |
| raw_record | jsonb |
| dedupe_hash | required text |
| created_at | timestamp |
| updated_at | timestamp |

Constraints and indexes:

- same-project FK to `evidence_import_batches`
- unique `(project_id, source_type, dedupe_hash)`
- index `(project_id, normalized_topic, market, language)`
- index `(project_id, source_type, source_date desc)`
- check `source_type`

### `prompt_opportunities`

Purpose: one reviewable prompt opportunity.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| topic | required |
| normalized_topic | required |
| intent | `informational`, `comparison`, `recommendation`, `transactional`, `support`, `unknown` |
| market | required |
| language | required |
| status | `new`, `under_review`, `approved`, `rejected`, `exploratory`, `promoted` |
| suggested_prompt | nullable current best candidate |
| suggested_priority | nullable `high`, `medium`, `low` |
| suggested_priority_rationale | jsonb |
| final_priority | nullable `high`, `medium`, `low` |
| final_priority_by | nullable auth user id |
| final_priority_at | nullable timestamp |
| related_prompt_id | nullable manually linked existing prompt |
| related_prompt_linked_by | nullable auth user id |
| related_prompt_linked_at | nullable timestamp |
| approved_prompt_text | nullable |
| approved_by | nullable auth user id |
| approved_at | nullable timestamp |
| rejected_by | nullable auth user id |
| rejected_at | nullable timestamp |
| rejection_reason | nullable |
| exploratory_reason | nullable |
| created_by | auth user id |
| created_at | timestamp |
| updated_at | timestamp |

Constraints and indexes:

- check `status`
- check `intent`
- check suggested/final priority values
- nullable FK to `prompts` must stay within same project
- index `(project_id, status, updated_at desc)`
- index `(project_id, final_priority, status)`
- index `(project_id, normalized_topic, market, language)`

Duplicate warning rule:

- Warn when an active non-promoted opportunity already exists with the same `(project_id, normalized_topic, market, language)`.
- Do not hard-block creation in Phase 1.2A; duplicate review may be legitimate.

### `prompt_opportunity_evidence`

Purpose: pure join table between opportunities and evidence records.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| prompt_opportunity_id | required |
| evidence_record_id | required |
| linked_by | auth user id |
| linked_at | timestamp |

Constraints and indexes:

- same-project FK to `prompt_opportunities`
- same-project FK to `evidence_records`
- unique `(prompt_opportunity_id, evidence_record_id)`
- index `(project_id, evidence_record_id)`
- index `(project_id, prompt_opportunity_id)`

### `prompt_opportunity_candidates`

Purpose: generated or human-edited wording candidates.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| prompt_opportunity_id | required |
| candidate_text | required |
| candidate_status | `proposed`, `selected`, `edited`, `rejected` |
| generation_provider | nullable for human-entered |
| generation_model | nullable for human-entered |
| generation_template_version | nullable for human-entered |
| generation_input | jsonb |
| created_by | nullable auth user id |
| created_at | timestamp |
| selected_by | nullable auth user id |
| selected_at | nullable timestamp |

Constraints and indexes:

- same-project FK to `prompt_opportunities`
- check `candidate_status`
- AI-generated candidates require provider, model, and template version
- index `(project_id, prompt_opportunity_id, created_at desc)`

### `prompt_candidate_evidence`

Purpose: normalized join table linking candidates to source evidence records.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| candidate_id | required |
| evidence_record_id | required |
| linked_at | timestamp |

Constraints and indexes:

- same-project FK to `prompt_opportunity_candidates`
- same-project FK to `evidence_records`
- unique `(candidate_id, evidence_record_id)`
- index `(project_id, evidence_record_id)`

### `prompt_opportunity_reviews`

Purpose: append-only review and audit history.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| prompt_opportunity_id | required |
| candidate_id | nullable |
| reviewer_id | auth user id |
| decision | `start_review`, `approve`, `edit_approve`, `reject`, `mark_exploratory`, `confirm_priority`, `link_related_prompt`, `promote`, `comment` |
| from_status | nullable |
| to_status | nullable |
| decision_reason | nullable |
| reviewed_prompt_text | nullable |
| review_metadata | jsonb |
| created_at | decision timestamp |

Constraints and indexes:

- same-project FK to opportunity
- same-project FK to candidate when present
- check `decision`
- append-only by policy/trigger
- index `(project_id, prompt_opportunity_id, created_at desc)`
- index `(project_id, reviewer_id, created_at desc)`

### `prompt_opportunity_promotions`

Purpose: immutable promotion audit trail from approved opportunity to prompt version.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| prompt_opportunity_id | required |
| candidate_id | nullable |
| prompt_set_id | required |
| prompt_id | required |
| prompt_version_id | required |
| approved_prompt_text | required |
| reviewer_id | auth user id who approved |
| approved_at | required timestamp |
| promoted_by | auth user id |
| promoted_at | timestamp |
| promotion_metadata | jsonb |

Constraints and indexes:

- same-project FK to opportunity
- same-project FK to candidate when present
- same-project FK to prompt set, prompt, and prompt version
- unique `(prompt_opportunity_id)` for first version
- promotion requires opportunity status `approved`
- index `(project_id, promoted_at desc)`

### `prompt_promotion_evidence`

Purpose: normalized join table linking a promotion to the evidence records that justified it.

Columns:

| Column | Notes |
| --- | --- |
| id | uuid primary key |
| project_id | required |
| promotion_id | required |
| evidence_record_id | required |
| linked_at | timestamp |

Constraints and indexes:

- same-project FK to `prompt_opportunity_promotions`
- same-project FK to `evidence_records`
- unique `(promotion_id, evidence_record_id)`
- index `(project_id, evidence_record_id)`

## Provenance Requirements

Every opportunity and candidate must preserve:

- source type
- source record reference
- import batch
- source date
- market
- language
- generation provider
- generation model
- generation template version
- source evidence relationships through normalized join tables
- reviewer
- decision timestamp

Additional rules:

- Raw source rows are retained in `evidence_records.raw_record`.
- Normalized fields are stored separately from raw payloads.
- Candidate evidence is linked through `prompt_candidate_evidence`.
- Promotion evidence is linked through `prompt_promotion_evidence`.
- Review history is append-only.
- Promotion history is append-only.
- Every relationship must enforce project-boundary validation.

## Status Transitions

Statuses:

- new
- under_review
- approved
- rejected
- exploratory
- promoted

Allowed transitions:

| From | To |
| --- | --- |
| new | under_review |
| new | approved |
| new | rejected |
| new | exploratory |
| under_review | approved |
| under_review | rejected |
| under_review | exploratory |
| approved | promoted |
| approved | under_review, only if not promoted |
| rejected | under_review |
| rejected | exploratory |
| exploratory | under_review |
| exploratory | rejected |
| promoted | no normal transition |

Invalid transitions:

- promoted to any other status
- rejected to promoted
- new to promoted
- under_review to promoted
- exploratory to promoted

Promotion requires explicit approval first.

## Priority Handling

Phase 1.2A does not create a numeric opportunity score.

The system may suggest:

- high
- medium
- low

The reviewer must confirm final priority.

Stored fields:

- `suggested_priority`
- `suggested_priority_rationale`
- `final_priority`
- `final_priority_by`
- `final_priority_at`

Suggested priority factors:

| Factor | High signal | Medium signal | Low signal |
| --- | --- | --- | --- |
| Independent evidence sources | 2+ source types support same topic | 1 source type with multiple records | Single weak/manual record |
| Search demand | High clicks, impressions, or search term activity | Moderate activity | Low or unknown activity |
| Customer enquiry frequency | Repeated enquiries | More than one related enquiry | One enquiry |
| Competitor coverage | Competitor topic appears and reviewer links related prompt with target weakness | Competitor topic appears | Competitor topic only, weak evidence |
| Visibility state | Related prompt manually linked with visible target weakness | Related prompt manually linked, limited data | Not evaluated |
| Evidence freshness | Recent, e.g. 30 days | 31-90 days | Older than 90 days |

Rules:

- Suggested priority must include human-readable rationale.
- Final priority must be confirmed by a reviewer.
- Official workflows use final priority, not suggested priority.
- If final priority is unset, the opportunity remains reviewable but not finalized.

## Prompt Generation Rules

AI may suggest wording variants, but:

- AI-generated text is not evidence.
- Generated candidates cannot automatically become official prompts.
- Candidates must remain linked to source evidence via `prompt_candidate_evidence`.
- Human approval is mandatory before promotion.
- Provider, model, generation template version, generation input, and source evidence links must be preserved.
- Generated prompts should not force the target brand into the answer.
- Generated prompts should not mix markets or languages.
- Comparative wording should be explicit when competitors are included.

Preferred neutral forms:

- "What are common options for [topic] in [market]?"
- "Which providers are commonly recommended for [intent] in [market]?"
- "What should someone compare when choosing [category] in [market]?"

Avoid:

- "Is [target brand] the best..."
- "Why should I choose [target brand]..."
- wording that embeds the target brand unless the approved intent requires it

## Promotion Rules

Only approved opportunities can be promoted into official immutable prompt versions.

Promotion must preserve:

- original opportunity ID
- evidence links through `prompt_promotion_evidence`
- approved wording
- reviewer
- approval timestamp
- promotion timestamp
- destination prompt set
- created prompt version ID

Promotion flow:

1. Reviewer selects destination prompt set.
2. System verifies opportunity status is `approved`.
3. System verifies destination prompt set belongs to the same project.
4. System creates or reuses a prompt shell as appropriate.
5. System creates an immutable prompt version using the approved wording.
6. System records `prompt_opportunity_promotions`.
7. System records `prompt_promotion_evidence`.
8. System records append-only review event.
9. System changes opportunity status to `promoted`.

Promoted prompts should default to evidence-backed prompt class.

## Acceptance Criteria

Product acceptance criteria:

- Only three Phase 1.2A pages are introduced: Evidence Import, Opportunities List, Opportunity Detail.
- Opportunities appears under `AI Visibility -> Opportunities`.
- Evidence can be imported from GSC CSV.
- Evidence can be imported from Google Ads Search Terms CSV.
- Customer enquiries can be manually entered.
- Competitor topics can be manually entered.
- Evidence records preserve raw and normalized data.
- Topics are assigned manually in Phase 1.2A.
- Duplicate warnings appear for matching normalized topic, market, and language.
- Opportunity list supports filters for status, suggested priority, final priority, source type, market, language, intent, freshness, visibility state, reviewer, and promotion state.
- Opportunity detail shows evidence, candidates, review history, priority handling, and promotion state.
- AI-generated candidates are labeled as candidates, not evidence.
- Human reviewer can approve, edit-approve, reject, or mark exploratory.
- Reviewer must confirm final priority.
- Non-approved opportunities cannot be promoted.
- Approved opportunities can be promoted into immutable prompt versions.
- Visibility metrics are shown only when a reviewer manually links an existing prompt.
- No automatic visibility-gap inference is performed in Phase 1.2A.
- No numeric opportunity score is displayed.

Data-model acceptance criteria:

- `evidence_import_batches` exists as the parent import/audit table.
- `evidence_records` stores raw and normalized evidence.
- `prompt_opportunity_evidence` is a pure opportunity/evidence join table.
- No `record_kind` field is used to combine raw evidence with links.
- `prompt_candidate_evidence` replaces candidate evidence arrays.
- `prompt_promotion_evidence` replaces promotion evidence arrays.
- Every relationship supports foreign keys.
- Every relationship validates project boundaries.
- All tables are scoped by `project_id`.
- Review history is append-only.
- Promotion history is append-only.
- Status transitions are enforced.
- Promotion cannot cross project boundaries.
- Promotion creates or references an immutable prompt version.

## Implementation Sequence

Recommended implementation sequence for Phase 1.2A:

1. Finalize migration design for normalized evidence and opportunity tables.
2. Add project-boundary constraints and RLS policies.
3. Add database tests for project isolation, join integrity, duplicate evidence handling, and invalid status transitions.
4. Add evidence import parsing for GSC CSV and Google Ads Search Terms CSV.
5. Add manual evidence entry for customer enquiries and competitor topics.
6. Add manual topic assignment and normalized-topic duplicate warnings.
7. Add Opportunities List page.
8. Add Opportunity Detail page.
9. Add AI-generated candidate creation using provider registry configuration.
10. Add append-only review actions.
11. Add priority confirmation workflow.
12. Add promotion workflow into immutable prompt versions.
13. Add tests for promotion provenance and evidence joins.
14. Run lint, type-check, tests, build, and audit.

Phase 1.2B should not begin until Phase 1.2A has real evidence and review usage.
