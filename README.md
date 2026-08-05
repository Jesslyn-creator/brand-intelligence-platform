# Brand Intelligence Admin

Internal MVP for multi-project, multi-provider AI visibility testing across target and competitor brands.

## Architecture Rules

- Organisations own projects and brands.
- Projects scope prompt sets, evaluations, provider runs, response attempts, citations, and analyses.
- One evaluation can run the same immutable prompt versions across multiple provider-specific runs.
- Provider-specific code lives in `src/lib/ai/providers`.
- Native provider requests/responses are retained for auditability.
- Response attempts are immutable; retries create new attempts.
- Test-run items are claimed atomically and can be resumed.
- Automated classification uses a configurable fixed classifier provider/model by default.
- First-project brand seed data appears only in `supabase/seed.sql`.

## Environment

Create `.env.local` from `.env.example`.

Safe for browser:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Server-only secrets:

```bash
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=
```

Server-only configuration:

```bash
DEFAULT_ADMIN_EMAIL=
DEFAULT_ORGANISATION_NAME=
DEFAULT_CLASSIFIER_PROVIDER=
DEFAULT_CLASSIFIER_MODEL=
MAX_PROMPTS_PER_EVALUATION=25
MAX_PROVIDERS_PER_EVALUATION=4
MAX_REPETITIONS_PER_PROVIDER=5
MAX_ATTEMPTS_PER_ITEM=3
```

Do not expose provider API keys with `NEXT_PUBLIC_`.

## Database

Apply migrations:

```bash
supabase db push
```

For local development, `supabase db reset` applies migrations and `supabase/seed.sql`.

Migrations:

- `supabase/migrations/0001_phase1_core.sql`
- `supabase/migrations/0002_phase1_1_multi_provider.sql`

## Admin Bootstrap

The seed does not contain a real Supabase Auth user UUID.

After creating/signing in the intended admin user in Supabase Auth, run:

```bash
npm run bootstrap:admin -- --email admin@example.com --organisation "Internal Admin Organisation"
```

The script:

- uses the server-only service role key;
- looks up exactly one Supabase Auth user by email;
- creates or reuses the named organisation;
- upserts admin membership idempotently;
- never disables RLS;
- fails if user or organisation state is ambiguous.

## Run

```bash
npm install
npm run dev
```

## Verify

Normal automated checks do not make paid provider API calls:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

`npm audit` requires registry access.

## Provider Notes

Phase 1.1 adapters:

- OpenAI: official `openai` Node SDK with Responses API and hosted web search.
- Gemini: official Gemini API HTTP endpoint. Official SDK selected for future install: `@google/genai`.
- Anthropic: official Messages API HTTP endpoint with web search tool support. Official SDK selected for future install: `@anthropic-ai/sdk`.
- Perplexity: Sonar through OpenAI-compatible API using the existing `openai` client.

If a provider/model does not support grounding, the run should be recorded as ungrounded or unsupported. The app does not simulate grounding.

## Limitations

- Model and pricing catalogs are configuration snapshots, not a full admin-managed catalog.
- Cost estimates display unavailable unless reliable pricing snapshots are maintained.
- Automated classification can be imperfect; analyses include audit flags/manual-review status for later human review.
- No public registration, billing, team invitations, subscriptions, scheduling, or advanced dashboards are included.
