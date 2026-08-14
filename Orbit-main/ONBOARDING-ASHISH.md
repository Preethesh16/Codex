# Onboarding — Ashish (Code Support / Codex track)

The Code Support slot is implemented by StartupForge through the OpenAI Codex
SDK. Orbit sends a privacy-minimized business profile to StartupForge's
authenticated build-job API; StartupForge owns planning, implementation,
critique, repair, diff, build verification, and rollback.

## Repo

- SSH: `git@github.com:bhavi7711/Orbit.git`
- Web: https://github.com/bhavi7711/Orbit
- Ask Bhavi for collaborator access if you can't push.

## Setup (5 minutes)

```bash
git clone git@github.com:bhavi7711/Orbit.git && cd Orbit
npm install
cp packages/server/.env.example packages/server/.env
# → add OPENAI_API_KEY, ORBIT_APPROVAL_TOKEN, and the shared
#   STARTUPFORGE_SERVICE_TOKEN to the untracked file
npm run build:core
npm run dev            # server on :5000, dashboard on :3000
```

Open http://localhost:3000 — you'll see the 7-agent dashboard. Your slot is the **Code** department in the sidebar.

## Where your work plugs in

| What | Where |
|---|---|
| Dashboard UI slot | `packages/client/src/App.tsx` — the `activeView === 'Code'` panel, marked `ANTIGRAVITY INTEGRATION SLOT` |
| Build handoff | `packages/server/src/startupForge.ts` creates authenticated StartupForge jobs after approval |
| Agent orchestration | `packages/server/src/openaiRuntime.ts` owns the OpenAI Agents SDK graph and structured outputs |
| Cross-agent state | `StartupContext` remains the source of truth; mutations are validated structured patches |
| Customer-feedback docs | Text/CSV uploads stay in the configured local upload directory and are deterministically redacted before any model call |
| Generated projects | `../startupforge/generated-mvps/` contains validated project roots with snapshot, diff, build, and rollback support |

## Workflow rules

1. Create a feature branch and use review before merging. Migration work in this checkout is published only to `codex/orbit-openai-migration`; never force-push or modify `main` without explicit authorization.
2. **Never commit**: `.env`, `dist/`, `*.tsbuildinfo`, or compiled `.js`/`.d.ts` next to `.tsx` sources. Compiled `App.js` once shadowed `App.tsx` in Vite and served a stale UI for hours — `.gitignore` now blocks these, don't override it.
3. Log every session in `changes-by-ashish.md` (it already has your scope + the interfaces you owe Preethesh & Deepthi's UI).
4. Mutable state defaults to `packages/server/uploads/orbit-state.json`; override it with `ORBIT_DB_PATH`. Runtime state and uploads must remain untracked.

## Current agent roster

Manager · Research (OpenAI web search) · Finance · Legal · Brand · Marketing ·
Sales · Support · Conflict · Build (StartupForge/Codex). Creative workflows use
GPT Image, TTS, and the replaceable Sora adapter with a persisted storyboard
fallback.
