# Scoring Principles

These principles are non-negotiable for the first evidence-based scoring model.

## Non-Negotiable Principles

1. Default official visibility metrics use evidence-backed prompts only.
2. Exploratory, manually hypothesized, AI-generated and persona-generated prompts must be reported separately.
3. AI-generated prompt wording is not evidence.
4. Failed attempts affect reliability metrics, but not successful visibility denominators.
5. Repetitions must first be aggregated within prompt + provider before prompt-level aggregation.
6. Provider scores must be shown separately before any combined index.
7. No circular Visibility Index should appear below the minimum coverage threshold.
8. Every metric must expose:
   - formula
   - numerator
   - denominator
   - exclusions
   - prompt composition
   - provider composition
   - repetition count
   - failed attempt count
9. Do not treat raw response count alone as statistical confidence.
10. Do not combine evidence-backed and exploratory prompt types using arbitrary weights in the first version.
11. The default Overview must show evidence-backed results only.
12. Any future aggregate index must be inspectable and reproducible.

## Metric Treatment

Official metrics should be calculated from current completed analyses attached to successful responses, scoped by `project_id`.

Failed attempts should be counted in reliability and operational health metrics. They should not be inserted into the denominator for successful visibility outcomes such as mention rate, recommendation rate, or official citation rate.

Repeated prompts should be handled in two stages:

1. Aggregate repetitions within `prompt + provider`.
2. Aggregate prompt-level values across the selected prompt set.

This prevents a single prompt with many repetitions from dominating the result.

## Prompt Classes

Prompt classes should be reported separately:

| Prompt class | Default official metrics | Purpose |
| --- | --- | --- |
| Evidence-backed | Included | Stable measurement |
| Manual exploratory | Excluded | Hypothesis testing |
| AI-generated | Excluded | Prompt discovery |
| Persona-generated | Excluded | Audience angle exploration |
| Demo/sample | Excluded | Product demonstration |

The first version should not use arbitrary weights to blend these classes. If combined reporting is added later, the weighting must be explicit, inspectable, and reproducible.

## Provider Reporting

Provider results must be shown separately before any combined index.

Combined reporting may be useful later, but it must disclose:

- included providers
- provider capability differences
- grounded versus ungrounded responses
- provider-specific failure counts
- prompt and repetition composition per provider

## Coverage Thresholds

No circular Visibility Index should appear until a project reaches a minimum coverage threshold.

Recommended first threshold:

- at least 3 evidence-backed prompts
- at least 2 providers
- at least 30 successful analyzable responses
- at least one completed evaluation with no pending items

Below threshold, the Overview should show component metrics with a clear "directional only" label rather than a single index.

## Component Metrics

Recommended first-version component metrics:

| Metric | Formula |
| --- | --- |
| Mention rate | successful current analyses where `target_brand_mentioned = true` / successful analyzable responses |
| Recommendation rate | successful current analyses where `target_brand_recommended = true` / successful analyzable responses |
| Official citation rate | responses where `official_domain_cited = true` / grounded successful responses |
| Average rank score | average `1 / target_brand_rank`, only for responses where rank exists |
| Competitor share gap | target recommendation rate minus top competitor recommendation rate |
| Evidence coverage | grounded successful responses / all attempted items |
| Reliability | successful responses / all response attempts |

Every displayed metric should provide a drill-down to the exact responses, citations, analyses, prompts, providers, repetitions, and failed attempts that produced it.

## Visibility Index Guardrails

If a future aggregate Visibility Index is introduced:

- it must not be a black box
- it must be reproducible from stored data
- it must disclose every component
- it must show sample size and coverage
- it must show provider composition
- it must show prompt composition
- it must exclude exploratory prompts by default
- it must never hide reliability failures

The circular score is a presentation of an auditable calculation, not the source of truth.
