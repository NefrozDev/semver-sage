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
Indexed: Vue 2–3, Node 14–26 (even majors), Next.js 12–16, Angular 12–22 (25 versions).
- `docker-compose.yml`: full stack (Postgres, migrate, Ollama + model pull, app on :8080);
  `ingestion` service under the `tools` profile. `Dockerfile` targets: `ingestion`, `app` (last).
- `db/migrations/001_chunks.sql`: `doc_versions` + deduplicated `chunks` (versions stored as
  integers `major*1e6 + minor*1e3 + patch` in `first_version_num` / `last_version_num`).
- `libs/server/core`: config (`.env` via `process.loadEnvFile`), pg pool, migrations, `Embedder`
  (bge-small, 384d), `Reranker` (bge-reranker-base), `Retriever` (hybrid + RRF + rerank, with
  ablation switches), scope/comparison resolution, LLM providers, prompts.
- `apps/ingestion`: CLI (`migrate | versions <fw> | ingest <fw|all> | reset <fw> | status`).
  Adapters (`sources/`: vue, node, nextjs, angular) discover versions from git tags (newest
  release per major) and do sparse checkouts (needed on Windows: path-length limits).
  Chunk hash = sha256(url path + section + normalized text).
- `apps/api`: `POST /api/ask` (SSE: scope → citations → tokens → done; compare mode adds
  `compare` scope), throttled per IP; serves the web build when `STATIC_DIR` is set.
- `apps/web`: signal store reading the SSE stream, animated SVG sage, typewriter dialog box,
  citation cards with version badges, framework/version/compare pickers, package.json upload.
- `evals/`: 74 golden questions; `npm run eval` (ablation), `--check` (labels exist in index),
  `--assert` (vs `baseline.json`), `--answers N --judge`. Results in `evals/results/latest.md`.
- CI: `.github/workflows/{ci,evals,reingest}.yml`. Hosted demo guide: `docs/DEPLOY.md`.

## Next steps
1. Tune keyword search: on the golden set, hybrid without rerank is below vector-only.
2. Faster reranking on CPU (smaller cross-encoder or fewer candidates), measured with the evals.
3. Remaining frameworks: React (react.dev + legacy reactjs.org), Express, NestJS, Nuxt.
4. Index the Vue 3 migration guide (separate repo) for "what replaced X" questions.
5. Deploy the hosted demo (HF Spaces + Neon + Groq) and set the `DATABASE_URL` secret.

## Commands
- Postgres: `npm run db:up`, then `npm run db:migrate`
- Ingest: `npm run ingest:vue` (or `npm run ingestion -- <command>`)
- Run web + api: `npm start` (= `npx nx run-many -t serve -p web api`)
- Full stack in Docker: `docker compose up -d --build`
- Tests: `npm test`; retrieval evals: `npm run eval`
- Commits: no Co-Authored-By / AI attribution lines (user preference).

Environment: Windows (Node 22.15; Angular 22 wants >= 22.22.3, builds work but npm warns). GitHub CLI (`gh`) is not installed.