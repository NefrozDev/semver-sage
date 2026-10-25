# Semver Sage — Project Context

## What it is
Semver Sage is a portfolio project: a RAG (retrieval-augmented generation) assistant that answers
questions about the most popular JavaScript frameworks **for any version**, with citations to the
exact doc page of that version. Most docs sites only show the latest version; this tool answers
"how did this work in Angular 12?" or "what changed in Next.js routing between 12 and 14?".

Frameworks in scope: Angular, React, Vue, Node.js, Express, NestJS, Next.js, Nuxt (more later).

## Hard constraint: 100% free
No paid services. Everything must run locally for free (Docker + local models), with optional free
tiers for a hosted demo. No AWS or other paid cloud.

## Key features
1. **Version-scoped answers**: retrieval is filtered by framework + version.
2. **package.json upload**: detect the user's installed versions and scope answers to them.
3. **"What changed?" mode**: retrieve the same topic from two versions and compare.
4. **"Since when?" questions**: e.g. "since when does Node have built-in fetch?" (Node docs include
   `added: vX` metadata).
5. **Citations** on every answer (doc URL + section + version).

## UI concept
An animated **sage** character with an RPG-style **dialog box**: typewriter text for answers, a
"thinking" animation while it searches, version badges on citations.

## Tech stack
- **Monorepo:** Nx (integrated, `angular-monorepo` preset)
- **Frontend:** Angular (SCSS, esbuild, no SSR): `apps/web`
- **API:** NestJS: `apps/api` (served at `http://localhost:3000/api`, proxied from web)
- **Ingestion:** plain Node.js app: `apps/ingestion` (fetch docs → chunk → embed → store)
- **Shared types:** `libs/shared/types` (e.g. `Framework`, `DocChunk`, `AskRequest`, `AskResponse`)
- **Database:** Postgres + pgvector (via Docker Compose), Postgres full-text search for keyword search
- **Embeddings:** local open model (e.g. bge-small / nomic-embed-text) via transformers.js or Ollama
- **Reranker:** local cross-encoder (e.g. bge-reranker-base)
- **LLM:** Ollama locally; behind a small provider adapter so a free-tier API or bring-your-own-key
  can be plugged in for a hosted demo
- **CI:** GitHub Actions (free for public repos), including RAG evals

## Data sources (docs are in git repos; each version = a git tag/branch)
Approximate; verify each when implementing:
- Node.js: `nodejs/node` → `doc/api/` at release tags
- React: `reactjs/react.dev` (current) + archived `reactjs/reactjs.org` (legacy)
- Vue: `vuejs/docs` (v3) + `vuejs/v2.vuejs.org` (v2)
- Angular: `angular/angular` docs folder at major tags (location changed around v17)
- Next.js: `vercel/next.js` → `docs/` at tags
- Nuxt: `nuxt/nuxt` → `docs/` (v3+), separate legacy repo for v2
- Express: `expressjs/expressjs.com` (3.x / 4.x / 5.x API pages)
- NestJS: `nestjs/docs.nestjs.com`
Some old versions may be missing; document gaps as known limitations.

## Core design: dedupe across versions
Most pages barely change between versions, so don't embed each version separately.
- `chunk_hash = sha256(normalized_text)`
- Chunk row: `hash | text | embedding | framework | page_url | section | first_version | last_version`
- Ingest versions in order; if the hash exists, extend `last_version`, else insert.
- Query filter: `first_version <= v AND last_version >= v`.
- Index each **major** version (minors for fast movers like Next.js and Node).
- Use a per-framework "source adapter" interface to handle each repo's layout.

## Retrieval pipeline
query → detect framework + version (from question or package.json) → hybrid search
(Postgres full-text/BM25 + pgvector) → Reciprocal Rank Fusion → rerank → top-k →
LLM answer with citations, streamed (SSE) to the frontend.

## Quality / production signals
- Golden eval set (~100 Q&A pairs, incl. tricky version-specific ones); metrics: recall@k, MRR,
  faithfulness. Evals run in CI.
- Ablation table in README (naive vector → hybrid → reranked → version filtering).
- Scheduled GitHub Action that detects new framework releases and re-ingests.
- `docker compose up` brings up the whole stack locally.

## Current state
Steps 1–5 of the original plan are done, plus package.json upload:
- `docker-compose.yml`: Postgres + pgvector; Ollama under the `ollama` profile.
- `db/migrations/001_chunks.sql`: `doc_versions` + deduplicated `chunks` (versions stored as
  integers `major*1e6 + minor*1e3 + patch` in `first_version_num` / `last_version_num`).
- `libs/server/core`: config (`.env` via `process.loadEnvFile`), pg pool, migration runner,
  transformers.js `Embedder` (bge-small, 384d) and `Reranker` (bge-reranker-base).
- `apps/ingestion`: CLI (`migrate | ingest <fw> | reset <fw> | status`), sparse git checkouts
  (needed on Windows: full clones hit path-length limits), markdown chunker, Vue adapter.
  Chunk hash = sha256(url path + section + normalized text).
- `apps/api`: `POST /api/ask` streams `AskStreamEvent`s over SSE (scope → citations → tokens → done);
  scope resolution maps a requested version to the newest indexed version at or below it.
- `apps/web`: signal store reading the SSE stream, animated SVG sage, typewriter dialog box,
  citation cards with version badges, framework/version pickers, package.json upload.

## Next steps
1. Source adapters for the other frameworks (Node first: `added: vX` metadata enables "since when?").
2. Index the Vue 3 migration guide (separate repo) for "what replaced X" questions.
3. Golden eval set + metrics (recall@k, MRR, faithfulness) in CI; ablation table in README.
4. "What changed?" compare mode (two scopes, side-by-side retrieval).
5. Dockerfiles for api/web so `docker compose up` runs the whole stack; scheduled re-ingest action.

## Commands
- Postgres: `npm run db:up`, then `npm run db:migrate`
- Ingest: `npm run ingest:vue` (or `npm run ingestion -- <command>`)
- Run web + api: `npm start` (= `npx nx run-many -t serve -p web api`)
- Tests: `npm test`

Environment: Windows (Node 22.15; Angular 22 wants >= 22.22.3, builds work but npm warns). GitHub CLI (`gh`) is not installed.