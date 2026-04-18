# Project Rules

## Goal
Build a web app that answers NPB game-history questions using an internal event-level database built from saved raw HTML, rich intermediate JSON, and normalized DB tables.

## Tech Stack
- Nuxt 3
- TypeScript
- Cloudflare Workers
- Cloudflare D1 for normalized search database
- Cloudflare R2 for raw HTML and rich intermediate JSON
- pnpm workspace
- zod for schema validation

## Architecture
- packages/crawler: discover games and download raw HTML
- packages/parser: parse raw HTML into rich intermediate JSON
- packages/db: migrations, loaders, query layer
- packages/schemas: shared schemas
- apps/web: Nuxt frontend and server routes

## Data Rules
- Never delete raw HTML once fetched
- Rich intermediate JSON must preserve as much source information as possible
- Normalized DB is derived from rich JSON and can be rebuilt
- events is the core table
- Always preserve source URLs

## AI Usage Rules
- AI is not the primary source of truth
- Search/query logic must rely on DB, not model memory
- AI may be used only for:
  - structured query generation
  - response drafting / formatting
  - coding assistance during development

## Change Rules
- Do not change DB schema without a migration
- Do not add dependencies unless clearly necessary
- Do not rewrite unrelated files
- When changing parser behavior, update fixtures/tests
- Prefer small, isolated changes

## Product Rules
- Public app first
- External paid API is not public in phase 1
- Keep architecture separable so external API can be added later
- Monthly subscription will apply to AI chat usage, not basic DB search