# Orbit

![Orbit Mission Control](../docs/assets/orbit-mission-control.png)

Orbit is the founder workspace, shared `StartupContext`, OpenAI business-agent
graph, and creative studio. Research runs first; Finance, Legal, and Brand run
in parallel; Conflict reconciles their output; Marketing, Build, and GTM then
run in parallel before the Manager's final audit.

The server uses `@openai/agents` and server-only OpenAI credentials. Text and CSV
uploads are retained locally and deterministically redacted before cloud calls.
Binary uploads remain local and are not OCR-processed. StartupForge receives a
privacy-minimized profile only after an authenticated human approval.

The creative department uses GPT Image 2 for campaign assets, a replaceable
Sora 2 adapter for asynchronous video jobs, and `tts-1` for downloadable
voiceovers. The Creative & Voice Agent writes captions and short voice scripts;
the configured transcription path is `gpt-4o-transcribe`. Media generation,
publishing, and build handoffs remain observable and approval-aware.

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
