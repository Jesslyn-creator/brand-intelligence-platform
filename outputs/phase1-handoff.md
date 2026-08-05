# Phase 1.1 Handoff

The current Phase 1.1 implementation lives in the project root.

Key entry points:

- `supabase/migrations/0001_phase1_core.sql`
- `supabase/migrations/0002_phase1_1_multi_provider.sql`
- `supabase/tests/phase1_database.sql`
- `supabase/seed.sql`
- `src/app/page.tsx`
- `src/lib/ai/providers`
- `src/lib/ai/runner/responses-runner.server.ts`
- `scripts/bootstrap-admin.mjs`
- `README.md`

Validation completed:

- `npm test`
- `npm run lint`
- `npm run build`

Provider API calls are not made by normal automated checks.

Hardening note:

- `openai` latest was confirmed from npm metadata as `7.3.0`, but install attempts timed out in this environment, so the lockfile still contains `openai@4.104.0`.
- `@google/genai` and `@anthropic-ai/sdk` installs were blocked by registry `EACCES`; Gemini and Anthropic adapters currently use official HTTP APIs.
- `npm audit --omit=dev` is unverified because the npm audit endpoint returned an error.
