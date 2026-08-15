# StartupForge

![StartupForge onboarding](../docs/assets/startupforge-onboarding.png)

StartupForge turns a privacy-filtered business profile into a working project
using the OpenAI Codex SDK. Each generated project has one resumable Codex
thread and follows Planner → implementation → Critic → repair.

## Architecture

1. Business data is compiled locally; identity numbers, credentials, contacts,
   founder names, and precise locations are omitted.
2. Codex works directly inside a validated directory beneath
   `generated-mvps/` with workspace-write sandboxing and no automatic approval.
   Generated-project install/build commands run in Bubblewrap on Linux with a
   cleared environment; builds have no network and the project is the only
   writable host path.
3. StartupForge snapshots the project before changes, streams canonical
   `codex:*` events, records changed paths, runs the project build, and supports
   rollback.
4. HTTP build jobs (`POST /api/builds`) and SSE event reads let Orbit invoke the
   service on every operating system. Socket.IO remains available for the UI.
5. Deployment and GitHub publishing remain explicit human actions.
6. Fix Center ingestion accepts local CSV exports. Binary spreadsheets remain
   local and are not parsed by the demo privacy gate.

## Setup

```bash
cd server
cp .env.example .env
# Add OPENAI_API_KEY, STARTUPFORGE_SERVICE_TOKEN, and
# STARTUPFORGE_TOKEN_ENCRYPTION_KEY to the untracked .env file. Set
# GITHUB_SSH_OWNER if source publishing is needed.
npm install
npm run dev

# In another terminal:
cd ../client
npm install
npm run dev
```

The server runs on `http://localhost:3001`; the client runs on
`http://localhost:5173`. Windows users may run `start.bat`, but Orbit itself
uses the HTTP API and has no platform-specific launcher dependency.

All `/api/builds` and `/api/import/business` endpoints require `Authorization: Bearer
<STARTUPFORGE_SERVICE_TOKEN>`. Orbit sends the token server-to-server only; it
must never be exposed to either browser client.

## Safety

- Never commit `.env` files or generated projects.
- Absolute paths, traversal, and writes at the generated-project root are
  rejected.
- Codex does not publish, deploy, or write to GitHub in its build sandbox.
- Linux requires `bwrap` for generated-project commands. Unsupported hosts fail
  closed unless `STARTUPFORGE_ALLOW_UNSANDBOXED_BUILDS=true` is deliberately
  set for local development.
- Dependency installation uses `--ignore-scripts`. Git publishing validates
  repository names, disables hooks/executable Git configuration, never embeds
  a token in the remote URL, and never force-pushes.
- GitHub publishing uses the operator's local SSH key and requires an existing
  repository under `GITHUB_SSH_OWNER`. StartupForge does not store a GitHub PAT,
  create repositories, enable Pages, or deploy as part of this source push.
- Use `POST /api/builds/:jobId/rollback` with the returned snapshot ID to restore
  a pre-edit project state.
- Set `STARTUPFORGE_DB_PATH` and `FEEDBACK_CSV_PATH` when durable data should
  live outside the server working directory.
