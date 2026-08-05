# Local Dependency Upgrade Handoff

This handoff prepares the provider SDK hardening pass for local execution on Windows.
Do not paste API keys into any terminal output or chat transcript while running these commands.

## Current Project State

- `package.json` was updated to target:
  - `openai@^6.49.0`
  - `@google/genai@^2.13.0`
  - `@anthropic-ai/sdk@^0.115.0`
- Local dependency installation has been completed and `package-lock.json` now contains:
  - `openai@6.49.0`
  - `@google/genai@2.15.0`
  - `@anthropic-ai/sdk@0.115.0`
- The source adapters now import the official Google and Anthropic SDKs.
- No real API calls are part of this handoff.

## Local Validation Results

Phase 1.1 local validation passed on August 5, 2026:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit --omit=dev
```

Result:

- Tests passed.
- Lint passed.
- Production build passed.
- Production dependency audit passed.

## Node.js Recommendation

Use Node.js `24.19.0` for the whole project.

Minimums confirmed during handoff preparation:

| Package | Selected version | Minimum Node.js requirement |
| --- | ---: | --- |
| `next` | `16.2.12` | `>=20.9.0` |
| `openai` | `^6.49.0` | Node.js 20 LTS or later, non-EOL |
| `@google/genai` | `^2.13.0` | Node.js 20 or later |
| `@anthropic-ai/sdk` | `^0.115.0` | Node.js 20 LTS or later, non-EOL |

Node.js 20 is already EOL, so the practical floor is Node.js 22. Node.js 24 is the current LTS line and gives the longest support runway for this project.

## OpenAI 7.x Decision

Do not force `openai@7.x` for this project right now.

At the time of this handoff, the current npm `latest` line identified for `openai` is `6.x`, and the project has been prepared for `openai@^6.49.0`. Some current OpenAI SDK documentation/pages describe a Node.js 22+ floor for newer runtime support; that is acceptable for this project because the recommended runtime is Node.js 24. But moving to `7.x` before it is the normal stable npm line for this project would create avoidable churn.

If `npm.cmd view openai dist-tags.latest version engines --json` on your machine shows a newer stable `7.x` as `latest`, pause and review the SDK changelog before changing the selected version.

## Prerequisites

1. Install Node.js `24.19.0` using your normal Windows Node manager or the official installer.
2. Open PowerShell in the project directory:

```powershell
cd "C:\Users\Choon_jl5g0xu\Documents\Codex\2026-08-02\important-architecture-requirement-build-this-as"
```

3. Use `npm.cmd` in PowerShell if `npm` is blocked by execution policy.

## Environment Checks

```powershell
node -v
npm.cmd -v
Get-Command node
Get-Command npm.cmd
npm.cmd config get registry
npm.cmd config get cache
npm.cmd config get prefix
npm.cmd cache verify
```

Expected:

- `node -v` prints `v24.19.0`.
- `npm.cmd config get registry` prints `https://registry.npmjs.org/` unless you intentionally use a company registry.
- `npm.cmd cache verify` completes without an integrity error.

## Inspect Package Metadata Before Installing

```powershell
npm.cmd view openai dist-tags.latest version engines --json
npm.cmd view @google/genai dist-tags.latest version engines --json
npm.cmd view @anthropic-ai/sdk dist-tags.latest version engines --json
```

Expected:

- `openai` should resolve to a current supported `6.x` release compatible with Node.js 24.
- `@google/genai` should resolve to `2.13.x` or newer compatible with Node.js 24.
- `@anthropic-ai/sdk` should resolve to `0.115.x` or newer compatible with Node.js 24.

## Install Project Dependencies

Do not install these globally.

```powershell
npm.cmd install openai@^6.49.0 @google/genai@^2.13.0 @anthropic-ai/sdk@^0.115.0
```

This should update `package-lock.json` and `node_modules` locally in this project.

## Verify Exact Installed Versions

```powershell
node -e "const lock=require('./package-lock.json'); for (const n of ['node_modules/next','node_modules/openai','node_modules/@google/genai','node_modules/@anthropic-ai/sdk']) { const p=lock.packages[n]; console.log(n + ': ' + (p?.version ?? 'missing') + ' engines=' + JSON.stringify(p?.engines ?? {})); }"
```

Expected:

- `node_modules/next: 16.2.12`
- `node_modules/openai: 6.49.0`
- `node_modules/@google/genai: 2.15.0`
- `node_modules/@anthropic-ai/sdk: 0.115.0`

## Validation Commands

Run these after install:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit --omit=dev
```

Expected:

- Tests, lint, and build pass.
- `npm audit --omit=dev` completes without production dependency findings.

## Safe EACCES Recovery

If npm reports `EACCES`, `EPERM`, or file-lock errors:

1. Stop running development servers and test watchers.

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path,StartTime
```

Close the terminal or app that owns the relevant project process. If you are certain a listed Node process is only this project's dev server, stop it by ID:

```powershell
Stop-Process -Id <PROCESS_ID>
```

2. Check for file locks using Windows Resource Monitor.

```powershell
resmon.exe
```

In Resource Monitor, open CPU > Associated Handles and search for:

- `node_modules`
- `package-lock.json`
- the project folder name

Close the owning editor, terminal, or watcher if it is locking project files.

3. Preserve the lockfile before changing install artifacts.

```powershell
Copy-Item .\package-lock.json .\package-lock.backup.json
```

4. Rename `node_modules` instead of deleting it first.

```powershell
if (Test-Path .\node_modules) {
  Rename-Item .\node_modules ("node_modules.backup-" + (Get-Date -Format yyyyMMdd-HHmmss))
}
```

5. Verify the npm cache.

```powershell
npm.cmd cache verify
```

Only if npm reports cache corruption, clean it:

```powershell
npm.cmd cache clean --force
```

6. Reinstall.

If `package-lock.json` already contains the upgraded SDK versions:

```powershell
npm.cmd ci
```

If `package-lock.json` does not yet contain the upgraded SDK versions:

```powershell
npm.cmd install openai@^6.49.0 @google/genai@^2.13.0 @anthropic-ai/sdk@^0.115.0
```

7. After validation passes, remove the renamed `node_modules.backup-*` folder manually or with a specific path.

```powershell
Remove-Item -LiteralPath ".\node_modules.backup-YYYYMMDD-HHMMSS" -Recurse
```

Do not run arbitrary scripts as Administrator, do not permanently disable antivirus, and do not broaden Windows folder permissions to make npm pass.

## Rollback Procedure

To roll back the handoff patch before installing:

```powershell
git diff
git restore package.json src\lib\ai\providers\gemini.ts src\lib\ai\providers\anthropic.ts LOCAL_DEPENDENCY_UPGRADE.md
```

To roll back after installing:

```powershell
git restore package.json package-lock.json src\lib\ai\providers\gemini.ts src\lib\ai\providers\anthropic.ts LOCAL_DEPENDENCY_UPGRADE.md
npm.cmd ci
```

Review `git diff` before and after rollback so unrelated work is not discarded.

## Notes For Validation

- The Google and Anthropic adapters now depend on installed official SDK packages.
- The Anthropic adapter uses the current `web_search_20260209` tool identifier. If a chosen Claude model does not support that tool, treat the run as a provider/model compatibility issue instead of silently downgrading.
- The Perplexity adapter continues to use a separate OpenAI-compatible client and must not share the OpenAI API key.
- Do not configure real secrets until dependency validation passes.
- Do not run real provider requests until after tests, lint, build, and audit have been reviewed.
