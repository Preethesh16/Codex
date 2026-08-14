# Orbit

Orbit is the founder workspace, shared `StartupContext`, OpenAI business-agent
graph, and creative studio. Research runs first; Finance, Legal, and Brand run
in parallel; Conflict reconciles their output; Marketing, Build, and GTM then
run in parallel before the Manager's final audit.

The server uses `@openai/agents` and server-only OpenAI credentials. Text and CSV
uploads are retained locally and deterministically redacted before cloud calls.
Binary uploads remain local and are not OCR-processed. StartupForge receives a
privacy-minimized profile only after an authenticated human approval.

## Setup

```bash
cp packages/server/.env.example packages/server/.env
npm install
npm run dev
```

Use the same `STARTUPFORGE_SERVICE_TOKEN` in both server environments and set
`ORBIT_APPROVAL_TOKEN` before approving a build. Never commit either value.

Historical hackathon notes remain in `ORBIT.md`, `progress.md`, and the
`changes-by-*.md` files; they are not the current runtime architecture.
