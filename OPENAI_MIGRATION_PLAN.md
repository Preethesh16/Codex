# Orbit OpenAI Migration and Repository Delivery Plan

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
  Image stills when Sora is unavailable.
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
