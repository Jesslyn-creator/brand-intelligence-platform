# Reference Gap Analysis

This document compares the current Brand Intelligence Platform against the reference project at `https://github.com/danishashko/geo-aeo-tracker`.

The analysis is read-only and is intended to guide product, UX, scoring, and architecture decisions. It is not a code merge plan.

## Executive Take

The reference project is UX-rich and demo-friendly. It has a broad information architecture, strong onboarding affordances, and many useful page concepts for AI visibility monitoring.

However, several of its displayed scores are simple heuristics or LLM-generated judgments. They should not be treated as inherently meaningful just because they are visually polished.

Our platform is less polished today, but it is stronger for auditable internal evaluation:

- project-scoped Supabase storage
- organisation-owned brands
- immutable response attempts
- prompt version immutability
- current analysis versioning
- RLS
- provider adapters
- resumable execution
- citation normalization

The product direction should borrow the reference project's information architecture and UX concepts, while preserving our evidence-first scoring model.

## Feature Gap Table

| Area | Reference project | Current platform | Recommendation |
| --- | --- | --- | --- |
| Overview | KPI strip, average visibility, top movers, drift alerts | Basic pending/completed/failed/current analysis metrics | Adopt concept, redesign scoring |
| Prompt Hub | Prompt library, `{brand}` injection, batch execution | Prompt sets, CSV import, immutable prompt versions | Adopt selectively |
| Responses | Browse responses with filters, search, highlighting | Basic results table with answers, analysis, citations | Adopt under Results |
| Analytics | Score trends, charts, CSV export | No dedicated analytics page | Defer until history exists |
| Citations | Domain-grouped citation frequency | Normalized citation records, lightly displayed | Adopt concept |
| Citation Opportunities | Competitor-cited sources where target is absent | Data model can support later | Redesign around evidence |
| Competitors | Battlecards and competitor mention comparison | Competitor configuration and analysis JSON | Defer battlecards |
| AEO Audit | Site readiness checks | Not implemented | Defer |
| Automation | Cron/GitHub templates, drift alerts | Manual resumable batches | Defer |
| Settings | Workspace/project configuration | Project, brand, provider, prompt configuration | Adopt as internal Settings |

## UX Gap Table

| UI pattern | Classification | Rationale |
| --- | --- | --- |
| Left sidebar with project switcher | Adopt concept | The current single-page admin will not scale cleanly |
| Model/provider toolbar | Redesign for our evidence model | Must show capability, grounding, unsupported state, and cost availability |
| Circular score | Redesign | Can mislead unless sample size, coverage, and formula are visible |
| Top movers | Adopt later | Useful only after repeated comparable evaluations exist |
| Response highlighting | Adopt | Helps users verify classifications quickly |
| Citation domain grouping | Adopt | Aligns with our normalized citation model |
| Citation opportunities | Redesign | Must require target absence plus competitor citation evidence |
| Persona fan-out | Defer | Useful for discovery, risky for official metrics |
| Niche Explorer | Defer | AI-generated prompts are not evidence |
| Battlecards | Defer | LLM-generated strategy can become presentation without evidence |
| AEO Audit | Defer | Useful, but separate from visibility measurement |
| Automation scheduling | Defer | Manual resumable execution should stabilize first |
| Documentation tab | Reject as primary navigation | Prefer product docs/help outside primary app navigation |

## Scoring Audit

| Score or KPI | Formula visible in code? | Numerator | Denominator | Weighting | Failed runs | Repeated prompts | Provider differences | Evidence quality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Visibility score | Yes | Per-response point total | 100 possible points | +30 mention, +20 early mention, +8/+15 repeated mentions, +20 official website citation, +5/+15 sentiment | Failed requests do not become scored runs | Each stored run contributes independently | No explicit provider weighting | Prompt-response heuristic |
| Average / overall visibility | Yes | Sum of visibility scores | Count of stored runs | Equal per run | Excluded if no successful run stored | Repetitions can overweight a prompt | Aggregated unless filtered | Prompt-only, not market evidence |
| Mention rate | Visible as KPI | Runs with brand mention | Total stored runs | Equal per run | Excluded | Repetitions can overweight | Aggregated unless filtered | Text matching |
| Sentiment | Yes | Positive/negative keyword signal | Mentioned response | Keyword heuristic | Excluded | Same as run weighting | No provider adjustment | Not context-aware |
| Citation count | Yes | Count of source URLs | Stored runs or source list | Raw count | Excluded | Repetitions can overweight | No provider adjustment | Citation presence only |
| Competitor comparisons | Partial | Competitor term matches | Stored responses | None | Excluded | Same as run weighting | No provider adjustment | Mention detection only |
| Drift / movers | Yes | Current score minus prior score | Same prompt + provider pair | Absolute delta threshold | Failed runs ignored | Depends on latest comparable run | Compared within provider | Sensitive to stochastic outputs |
| AEO audit score | Yes | Passed checks | Total checks | Equal check weighting | Not applicable | Not applicable | Not applicable | Technical checklist |
| SRO score | Partially visible | LLM-generated overall score | Not deterministic in visible app code | LLM judgment | Not clearly specified | Not clearly specified | Cross-platform data synthesized by LLM | Black-box unless constrained |

Do not assume a score is meaningful because it is displayed. For our platform, every score must expose formula, numerator, denominator, exclusions, prompt composition, provider composition, repetition count, and failed attempt count.

## Prompt Methodology Comparison

### Reference Project

- Supports demo prompts and manual prompts.
- Supports `{brand}` injection for ergonomic prompt reuse.
- Includes persona fan-out and niche query generation.
- Supports multi-provider runs.
- Includes country/geo-scoped tracking via provider or scraping infrastructure.
- Stores prompt text in local app state.
- Does not appear to structurally separate evidence-backed prompts from exploratory prompts in official metrics.
- AI-generated prompts improve ideation, but their wording is not evidence.

### Current Platform

- Uses project-scoped prompt sets.
- Stores prompts with category, intent, market, language, and active state.
- Uses immutable prompt versions.
- Supports CSV prompt import.
- Supports provider runs and repeated executions.
- Stores evaluation configuration for reproducibility of inputs.
- Better positioned to separate official evidence prompts from exploratory prompts.

### Recommendation

Official metrics should use evidence-backed prompts only. Manual hypotheses, AI-generated prompts, persona fan-out prompts, and exploratory prompts should be stored and useful, but reported separately from default Overview metrics.

## Architecture Comparison

| Area | Reference project | Current platform | Assessment |
| --- | --- | --- | --- |
| Provider execution | Bright Data AI Scraper plus OpenRouter and Gemini routes | Server-side provider registry and adapters for OpenAI, Gemini, Anthropic, Perplexity | Our adapter model is cleaner for direct-provider auditability |
| Storage model | IndexedDB/localStorage, optional Supabase key-value sync | Relational Supabase schema | Our model is stronger for reporting and project isolation |
| Response preservation | Runs stored in app state | Immutable response attempts with `attempt_number` | Our model is stronger |
| Citation extraction | Source arrays and domain grouping | Normalized citations with official-domain matching | Our model is stronger |
| Reproducibility | Prompt/provider/time stored loosely | Evaluation and provider run config snapshots | Our model is stronger |
| Auditability | Good visual inspectability | Strong data lineage and current-analysis versioning | Combine our architecture with better UX |
| Multi-project support | Local workspaces | Organisations, projects, organisation-owned brands | Our model is stronger |
| RLS/security | Optional Supabase route proxy; RLS considered less central | RLS required for exposed tables | Our model is stronger for multi-project internal use |
| Cost dependencies | Bright Data, OpenRouter, Gemini | Direct provider APIs with provider registry | Our model has less scraping dependency |
| Vendor lock-in | Claims low lock-in, but depends heavily on Bright Data for broad model scraping | Registry/adapters reduce lock-in | Our architecture is preferable |

## Adoption Priorities

1. Adopt sidebar information architecture and project switcher.
2. Adopt an Overview page, but make it evidence-first and transparent.
3. Adopt Results as the home for raw responses and analysis.
4. Adopt citation domain grouping.
5. Adopt citation opportunities later, only with clear evidence rules.
6. Defer persona fan-out, niche explorer, battlecards, AEO audit, automation, and analytics until the core evidence model has enough data.
7. Reject black-box aggregate scores as first-version default metrics.

## Risks And Trade-Offs

- A polished sidebar will improve adoption, but too many pages too early can obscure the internal MVP workflow.
- Citation Opportunities are valuable, but only if based on normalized citations and target absence logic.
- Persona fan-out can create useful discovery volume, but it can also create false confidence if blended into official metrics.
- AEO Audit is useful, but it is a separate site-readiness product surface.
- Automation should wait until manual resumable execution is operationally reliable.
- Circular scores are executive-friendly, but dangerous without visible sample size, formula, and confidence labels.
- Our strongest product advantage is auditability; UX improvements should not weaken the data model.
