# StartupForge

StartupForge turns a privacy-filtered business profile into a working project
using the OpenAI Codex SDK. Each generated project has one resumable Codex
thread and follows Planner → implementation → Critic → repair.

## Architecture

1. Business data is compiled locally; identity numbers, credentials, contacts,
   founder names, and precise locations are omitted.
2. Codex works directly inside a validated directory beneath
   `generated-mvps/` with workspace-write sandboxing and no automatic approval.
3. StartupForge snapshots the project before changes, streams canonical
   `codex:*` events, records changed paths, runs the project build, and supports
   rollback.
4. HTTP build jobs (`POST /api/builds`) and SSE event reads let Orbit invoke the
   service on every operating system. Socket.IO remains available for the UI.
5. Deployment and GitHub publishing remain explicit human actions.

## Setup

```bash
cd server
cp .env.example .env
# Add OPENAI_API_KEY to the untracked .env file.
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

## Safety

- Never commit `.env` files or generated projects.
- Absolute paths, traversal, and writes at the generated-project root are
  rejected.
- Codex does not publish, deploy, or write to GitHub in its build sandbox.
- Use `POST /api/builds/:jobId/rollback` with the returned snapshot ID to restore
  a pre-edit project state.
