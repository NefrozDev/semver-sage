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
An illustrated **sage** (vector SVG, no pixel art) with three poses: **idle**, **reflecting**
(while searching) and **talking** (while the answer streams). Answers appear in a card with a
typewriter effect; citations carry version badges. Calm modern look: Fraunces + Inter, light and
dark themes following the system setting.

## Tech stack
- **Monorepo:** Nx (integrated, `angular-monorepo` preset)
- **Frontend:** Angular (SCSS, esbuild, no SSR): `apps/web`
- **API:** NestJS: `apps/api` (served at `http://localhost:3000/api`, proxied from web)
- **Ingestion:** plain Node.js app: `apps/ingestion` (fetch docs → chunk → embed → store)
- **Shared types:** `libs/shared/types` (e.g. `Framework`, `DocChunk`, `AskRequest`, `AskResponse`)
- **Database:** Postgres + pgvector (via Docker Compose); exact vector search, no ANN index
- **Embeddings:** local open model (e.g. bge-small / nomic-embed-text) via transformers.js or Ollama
- **LLM:** Ollama locally; behind a small provider adapter so a free-tier API or bring-your-own-key
  can be plugged in for a hosted demo
- **CI:** GitHub Actions (free for public repos), including RAG evals
- **Tests:** Vitest everywhere (unit, API end-to-end in `apps/api-e2e`), Playwright for browser
  end-to-end (`apps/web-e2e`, mocked API), golden-set evals (`evals/`)
- **Code quality:** self-hosted SonarQube Community Build (`infra/sonarqube`), shared across apps
  on the server; Community Build analyzes the main branch only

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
query → detect framework + version (from question or package.json) → exact vector search restricted
to that version → top-k → LLM answer with citations, streamed (SSE) to the frontend.

Decided 2026-10-25 from the evals: full-text search (RRF) and a cross-encoder reranker were dropped
(97.7% vs 95.9% hit@5 for ~5.4 s per question on CPU), and the HNSW index too (approximate results
cost recall on large scopes; one version is at most ~6k chunks). Record:
`evals/results/hybrid-rerank-ablation.md`.

## Quality / production signals
- Golden eval set (~100 Q&A pairs, incl. tricky version-specific ones); metrics: recall@k, MRR,
  faithfulness. Evals run in CI.
- Ablation table in README (with vs without the version filter, plus the dropped hybrid/rerank run).
- Scheduled GitHub Action that detects new framework releases and re-ingests.
- `docker compose up` brings up the whole stack locally.

## Current state
Indexed (72 versions): Angular 2–22 (2 from the old angular.io Jade repo; there is no 3), Express
3–5, NestJS 10–12, Next.js 12–16, Node 1–26 (every major; 1–3 are io.js), Nuxt 2–4, React 17–19,
Svelte 3–5, TypeScript 3–6 (website snapshots), Vue 2–3. AngularJS (1.x) is deliberately not
indexed: such questions get a fixed "AngularJS is a separate framework" answer (`notices.ts`).
- `docker-compose.yml`: full stack (Postgres, migrate, Ollama + model pull, app on :8080);
  `ingestion` service under the `tools` profile. `Dockerfile` targets: `ingestion`, `app` (last).
- `db/migrations/001_chunks.sql`: `doc_versions` + deduplicated `chunks` (versions stored as
  integers `major*1e6 + minor*1e3 + patch` in `first_version_num` / `last_version_num`).
- `libs/server/core`: config (`.env` via `process.loadEnvFile`), pg pool, migrations, `Embedder`
  (bge-small, 384d), `Retriever` (exact vector search + version filter; `versionFilter: false` is
  the eval baseline), scope/comparison resolution, LLM providers, prompts, fixed notices.
- `apps/ingestion`: CLI (`migrate | versions <fw> | ingest <fw|all> | rebuild <fw> | reset <fw> |
  status`). `rebuild` re-ingests in version order (needed to add older/in-between versions) and
  reuses embeddings parked in `embedding_reuse`.
  One adapter per framework in `sources/`; versions come from git tags, branches (React, NestJS)
  or history (TypeScript: website snapshot before each next major's release notes). Checkouts are
  sparse and accept any ref incl. SHAs (needed on Windows: path-length limits).
  Chunk hash = sha256(url path + section + normalized text): url paths must be identical across
  versions to dedupe, which is why TypeScript cites GitHub for every version.
- `apps/api`: `POST /api/ask` (SSE: scope → citations → tokens → done; compare mode adds
  `compare` scope), throttled per IP; serves the web build when `STATIC_DIR` is set.
- `apps/web`: signal store reading the SSE stream, SVG sage with idle/reflecting/talking poses
  (`sage/`), typewriter answer card (`answer-card/`), citation cards with version badges,
  framework/version/compare pickers, package.json upload.
- `evals/`: 171 golden questions; `npm run eval` (ablation), `--check` (labels exist in index),
  `--assert` (vs `baseline.json`), `--answers N --judge`. Results in `evals/results/latest.md`.
- Tests: `apps/web-e2e` (Playwright, 14 tests, `/api` mocked via `page.route`; served from the
  production build by `static-server.mjs`), `apps/api-e2e` (Vitest against the running API; no LLM
  needed), unit specs everywhere. Coverage: `npm run test:coverage` -> `coverage/**/lcov.info`.
- SonarQube: `infra/sonarqube` (own compose stack), `sonar-project.properties`, `tools/sonar-scan.mjs`
  (merges lcov to repo-relative paths, runs the scanner in Docker). Local token/admin password in `.env`.
- CI: `.github/workflows/{ci,evals,reingest}.yml` (ci: check, e2e, sonarqube jobs). Hosted demo
  guide: `docs/DEPLOY.md`.

## Next steps
1. Vector search misses some exact-identifier questions (`req.params`, `useSeoMeta`): a cheap
   identifier match could help without bringing back the reranker; measure with the evals.
2. SSE keep-alive pings, longer LLM fetch timeout and larger Ollama context (found by benchmark).
3. Index migration guides kept in separate repos (Vue 3) for "what replaced X" questions.
4. Deploy the hosted demo (HF Spaces + Neon + Groq) and set the `DATABASE_URL` secret.
5. Candidates beyond the list: SvelteKit, React Router/Remix, Astro, Fastify.

## Commands
- Postgres: `npm run db:up`, then `npm run db:migrate`
- Ingest: `npm run ingest:vue` (or `npm run ingestion -- <command>`)
- Run web + api: `npm start` (= `npx nx run-many -t serve -p web api`)
- Full stack in Docker: `docker compose up -d --build`
- Tests: `npm test`; browser E2E: `npm run e2e`; API E2E: `npx nx e2e api-e2e`; evals: `npm run eval`
- SonarQube: `npm run sonar:up` (server on :9000), `npm run sonar` (coverage + scan)
- Commits: no Co-Authored-By / AI attribution lines (user preference).

Environment: Windows (Node 22.15; Angular 22 wants >= 22.22.3, builds work but npm warns). GitHub CLI (`gh`) is not installed.