# Orbit OpenAI Migration and Repository Delivery Plan

## Implementation status — 2026-08-14

The source migration, approval boundaries, durable build/media jobs, privacy
gate, resumable Codex lifecycle, rollback, compatibility events, and offline
fallback are implemented on `orbit-openai-migration`. All repository builds and
offline tests pass. Live OpenAI image/video/voice, OAuth/YouTube, and browser
end-to-end verification remain environment-gated because no API/OAuth
credentials were supplied; no external publication or deployment was attempted.

### Verification matrix

| Requirement | Authoritative local evidence | Status |
| --- | --- | --- |
| Agent topology, model routing, stage order, parallelism | `openaiRuntime.test.mjs` plus compiled Orbit server | Verified |
| Structured outputs, citations, legal certainty, budget math, conflicts | Orbit schema/eval tests | Verified |
| Privacy redaction, untrusted-data isolation, text/CSV-only cloud extraction | Orbit and StartupForge privacy tests; CSV HTTP integration test | Verified |
| Context patch allowlist and public run/approval/media types | Orbit core/server build and schema tests | Verified |
| Codex Planner → implement → Critic → repair, resumption, containment, diff, rollback | StartupForge build-safety tests | Verified |
| Generated-project command isolation, secret blocking, no-network builds, Git command safety | StartupForge sandbox and credential tests | Verified on Linux |
| Durable build jobs, SSE replay, canonical/compatibility events | StartupForge job/event tests | Verified |
| Authenticated Orbit → StartupForge handoff and workspace isolation | StartupForge isolated HTTP integration test | Verified |
| Atomic private state, explicit browser origins, and bounded AI routes | Orbit atomic-storage and HTTP-policy tests | Verified |
| GPT Image generate/edit persistence, voice persistence, Sora polling and fallback | Mock creative HTTP integration test | Verified without provider spend |
| OAuth state, protected sessions, bounded uploads, YouTube agent tool, and no-upload-before-approval invariant | MultiVideo Agents SDK/publishing tests | Verified without OAuth call |
| Every Node build and generated MVP smoke | Full package build pass and StartupForge generated-project test | Verified |
| Live Agents, GPT Image, Sora, TTS, Codex, Google OAuth, and YouTube | Requires locally supplied credentials and explicit external-action approval | Pending environment |
| Full credentialed browser journey | Requires the preceding live services | Pending environment |

Production dependency audits are clean for MultiVideo and the StartupForge
server and client. Orbit's text-only pitch-deck path still inherits an upstream
`image-size` advisory through `pptxgenjs`; no patched
dependency path exists in the current lockfile, uploaded images are never passed
to that renderer, and a forced incompatible downgrade was not applied.

Mutable Orbit data defaults to the untracked `packages/server/uploads/`
runtime area and is replaced atomically with private file permissions.
StartupForge runs generated-project commands in Bubblewrap on Linux with a
cleared environment, project-only writes, and no build-time network. Other
hosts fail closed unless an operator explicitly enables the documented unsafe
fallback for local development.

## Repository and goal bootstrap

- Preserve the original `origin` remote and publish migration work only to
  `codex/orbit-openai-migration`.
- Keep this plan and `whathappendtillnow.md` current throughout implementation.
- Never commit credentials, force-push, change `main`, deploy, or publish content
  without explicit authorization.

## Target architecture

- `Orbit-main`: founder workspace, context, business agents, and creative studio.
- `startupforge`: Codex-powered generation, editing, review, repair, and deployment
  preparation.
- `MultiVideo`: OAuth-backed YouTube and social publishing.
- Use `@openai/agents` with a Manager that calls Research, Finance, Legal, Brand,
  Marketing, Sales, Support, Conflict, and Build specialists as bounded tools.
- Execute Research first; Finance, Legal, and Brand in parallel; Conflict next;
  then Marketing, Build, and GTM.

### Default models

- `gpt-5.6-sol`: Manager, Conflict Resolution, complex legal/financial synthesis,
  and final build specifications.
- `gpt-5.6-terra`: specialist business agents.
- `gpt-5.6-luna`: routing, classification, redaction checks, and summaries.
- `gpt-image-2`: image generation and editing.
- `sora-2`: hackathon video generation behind a replaceable adapter.
- `tts-1`: voiceovers.
- `gpt-4o-transcribe`: StartupForge voice-command transcription.

## Implementation

### OpenAI runtime and privacy

- Introduce server-side OpenAI configuration, typed Zod outputs, retries,
  timeouts, trace IDs, usage recording, and normalized errors.
- Replace active Gemini, Google GenAI, Google Search grounding, Nano Banana, Veo,
  and Gemini TTS calls. Retain Google credentials only for Google sign-in and
  YouTube access.
- Remove Gemma/Ollama inference while retaining a deterministic local privacy
  gate. Keep raw uploads local, redact sensitive identifiers before cloud calls,
  and send only approved summaries or derived facts.
- Demo ingestion supports text and CSV. Binary uploads remain local until genuine
  local OCR is implemented.

### Orbit agents

- Replace simulated timers and canned responses with real Agents SDK runs.
- Give Research and Marketing OpenAI web search.
- Restrict shared-context mutations to validated structured patches.
- Require human approval for publishing, deployment, GitHub writes, spending,
  filings, and public claims.

### StartupForge and Codex

- Replace Antigravity/Gemini file-block generation with server-side
  `@openai/codex-sdk` and one resumable Codex thread per build.
- Use Planner -> Codex implementation -> Critic -> Codex repair stages.
- Validate project roots, block absolute/traversal paths, snapshot before edits,
  expose diffs, run builds, and support rollback.
- Add HTTP build-job endpoints and streaming events so Orbit can invoke
  StartupForge without the Windows-only launcher.
- Introduce canonical `context:*` and `codex:*` events while temporarily emitting
  compatibility aliases.

### Media and publishing

- Preserve current creative endpoint contracts where practical.
- Persist asynchronous `MediaJob` states and fall back to storyboard plus GPT
  Image stills when Sora is unavailable. The current Videos API adapter uses
  persisted polling; no unrelated generic webhook endpoint is exposed.
- Wrap YouTube upload as an approval-required agent tool.
- Clearly mark existing Facebook and LinkedIn mocks as unavailable.

### Public types

- Add `AgentRun`, `ToolApproval`, and `MediaJob` with trace, citation, tool-call,
  approval, usage, output, status, and error information.
- Keep `StartupContext` as the business source of truth.

## Delivery sequence

1. Seed the new migration branch and start the Codex goal.
2. Add this plan, the audit log, and persistent repository instructions.
3. Install dependencies and repair baseline build, orchestration, path-safety,
   sensitive-logging, and launcher issues.
4. Build the shared OpenAI runtime and migrate Orbit agents.
5. Migrate creative and media workflows.
6. Replace StartupForge Antigravity with Codex SDK workflows.
7. Connect Orbit to StartupForge through build-job APIs.
8. Expose existing YouTube access as an approval-required tool.
9. Complete and publish the verified hackathon demo milestone.
10. Continue with encryption, authorization, OCR, durable jobs, webhooks, rate
    limits, deployment, and eval hardening.

## Tests and acceptance

- Unit-test routing, structured outputs, redaction, context patches, approvals,
  path containment, media adapters, and fallbacks.
- Integration-test the agent graph, parallel work, citations, conflicts, retries,
  Codex resumption, rollback, and compatibility events.
- Verify GPT Image persistence, Sora job states and fallback, voiceovers, and quota
  errors.
- Prove YouTube publishing cannot happen without approval.
- Build every Node package and smoke-test generated MVPs.
- Exercise onboarding -> research -> parallel specialists -> conflict -> Codex
  build/fix -> poster -> video/storyboard -> publishing approval.
- Maintain an offline/mock media demo for connectivity or model-access failures.

## Assumptions

- `Preethesh16/Codex` receives migration work only on
  `orbit-openai-migration`; `main` stays untouched.
- API keys are supplied through ignored local environment files.
- Sora 2 is demo-only and must remain behind a replaceable adapter with fallback.
- Dependency installation is required before source-level build verification.
