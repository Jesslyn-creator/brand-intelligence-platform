# Product Information Architecture

This document defines the simplified first-version navigation for the internal Brand Intelligence Platform.

The goal is to keep the MVP focused, evidence-first, and usable by one administrator while preserving the architecture for multiple organisations, projects, target brands, competitors, prompt sets, evaluations, responses, citations, and analyses.

## First-Version Navigation

- Overview

- AI Visibility
  - Prompts
  - Opportunities
  - Evaluations
  - Results

- Evidence
  - Sources
  - Citations

- Competitors

- Settings

## Page Responsibilities

### Overview

Overview is for summaries only.

It should show:

- current project context
- evaluation health
- evidence-backed visibility summaries
- reliability summaries
- recent activity
- clear coverage and confidence labels

Detailed evidence should use drill-down views rather than being crowded into Overview.

### Prompts

Prompts is for prompt set management, prompt version review, CSV import, and prompt classification.

It should make prompt provenance clear:

- evidence-backed
- manual exploratory
- AI-generated
- persona-generated
- demo/sample

### Opportunities

Opportunities is for evidence-backed improvement opportunities, especially citation opportunities where competitors are cited and the target brand is absent.

This page should not become a generic AI recommendation feed.

### Evaluations

Evaluations is for creating runs, selecting providers, reviewing provider capabilities, processing resumable batches, and tracking pending/completed/failed item counts.

### Results

Responses should live under Results, not as a primary navigation item.

Results is for:

- raw successful responses
- failed attempts
- response attempts by item
- current analysis
- superseded analyses
- citations attached to responses
- provider payload inspection

### Sources

Sources is for normalized cited domains and URLs across responses.

It should help the administrator understand which domains repeatedly appear in provider answers.

### Citations

Citations is for citation-level inspection.

It should show:

- cited URL
- normalized domain
- provider
- response
- prompt
- whether it is an official target domain
- whether it matched a competitor domain
- native citation metadata where available

### Competitors

Competitors is for competitor brand configuration and competitor visibility comparison.

First-version competitor views should stay evidence-backed and avoid LLM-generated battlecards.

### Settings

Settings is for project, organisation, brand, provider, and scoring configuration.

It should not include billing, public registration, team invitations, or advanced permissions in the MVP.

## Hidden Or Deferred Areas

Analytics should remain hidden until sufficient historical data exists.

The following areas are deferred:

- AEO Audit
- Automation
- Persona Fan-out
- Niche Explorer
- Battlecards

These concepts may be useful later, but they should not distract from the first-version evidence workflow.

## UX Rules

Each page should support one primary user task.

Overview should summarize. It should not become a dense evidence table.

Detailed evidence belongs in drill-down views.

Results should preserve traceability from project to evaluation, provider run, item, response attempt, citation, and analysis.

Official metrics should default to evidence-backed prompt results only.

Exploratory workflows should be clearly labeled and separated from official visibility reporting.
