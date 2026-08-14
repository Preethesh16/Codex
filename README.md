# Orbit — OpenAI Multi-Agent Founder Workspace

This repository contains a collection of tools for turning an idea into a working digital product. It combines a workspace interface, backend services, automated project generation, feedback collection, and supporting experiments.

The current migration branch uses OpenAI Agents SDK for business orchestration,
OpenAI media APIs for creative workflows, and the Codex SDK for contained,
resumable MVP builds.

## Repository layout

- `Orbit-main/` — the main workspace application and its shared packages.
- `startupforge/` — a product-generation workflow with a web client and API server.
- `MultiVideo/` — supporting services for media and publishing workflows.

For details about an individual application, see its local README where available.

## Main capabilities

- Capture a product or business idea through a guided interface.
- Use configurable AI services to plan, generate, and improve project files.
- Stream progress and generated changes to the client in real time.
- Store project data and feedback locally or through a replaceable data layer.
- Preview or deploy generated applications using the hosting provider of your choice.

## Requirements

- Node.js 18 or newer
- npm
- API credentials for any optional external services you enable

## Run the workspace application

```bash
cd Orbit-main
npm install
npm run dev
```

The package scripts also support running the client and server independently:

```bash
npm run dev:client
npm run dev:server
```

## Run StartupForge

Install and start the server:

```bash
cd startupforge/server
cp .env.example .env
npm install
npm run dev
```

In a second terminal, start the client:

```bash
cd startupforge/client
npm install
npm run dev
```

Set `OPENAI_API_KEY` only in each server's untracked `.env`. Orbit defaults to
GPT-5.6 Sol/Terra/Luna, GPT Image 2, Sora 2 with storyboard fallback, TTS-1, and
GPT-4o Transcribe. Keep Google credentials only in MultiVideo for Google sign-in
and YouTube OAuth.

## Development notes

- Keep provider-specific media code behind service boundaries because the Sora
  2 Videos API is scheduled to shut down on September 24, 2026.
- Use local preview/development modes when testing generated applications.
- Review generated files before deploying them to a public environment.
- Run the relevant package build command before opening a pull request.

## Status

The source migration is implemented on `orbit-openai-migration`. Credentialed
model, OAuth, publishing, and browser end-to-end checks still require local keys
and explicit approval; offline builds and unit tests are available without them.
