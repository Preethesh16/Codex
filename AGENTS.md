# Orbit Repository Instructions

## Persistent audit log

For every user prompt that causes work in this repository, append a timestamped,
credential-safe summary to `whathappendtillnow.md` before changing implementation
files. After each coherent file-change batch, update that entry with:

- decisions and behavior changed;
- files changed;
- verification commands and results;
- errors or blockers;
- commit and push status.

Never record API keys, OAuth tokens, credentials, raw private documents, or other
sensitive prompt content. Updating `whathappendtillnow.md` does not require a
recursive audit entry.

## Git safety

- Perform OpenAI migration work on `orbit-openai-migration`.
- Push migration milestones only to `codex/orbit-openai-migration`.
- Do not force-push or modify `main` unless the user explicitly authorizes it.
- Do not deploy, publish media, or invoke an external write tool without explicit
  user approval.

## Project boundaries

- `Orbit-main/` owns the founder workspace, shared context, business agents, and
  creative studio.
- `startupforge/` owns Codex-powered project generation, repair, and build jobs.
- `MultiVideo/` owns OAuth-backed social publishing.
- Keep credentials server-side and preserve provider boundaries.
