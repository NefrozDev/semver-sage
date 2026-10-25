# Semver Sage — Project Context

## What it is
Semver Sage is a portfolio project: a RAG (retrieval-augmented generation) assistant that answers
questions about the most popular JavaScript frameworks **for any version**, with citations to the
exact doc page of that version. Most docs sites only show the latest version; this tool answers
"how did this work in Angular 12?" or "what changed in Next.js routing between 12 and 14?".

Frameworks indexed: Angular, React, Vue, Node.js, Express, NestJS, Next.js, Nuxt, Svelte,
TypeScript. AngularJS (1.x) is recognized but deliberately not indexed (see Current state).

## Hard constraint: 100% free
No paid services. Everything must run locally for free (Docker + local models), with optional free
tiers for a hosted demo. No AWS or other paid cloud.

## Key features (all implemented)
1. **Version-scoped answers**: retrieval is filtered by framework + version.
2. **package.json upload**: detect the user's installed versions and scope answers to them.
3. **"What changed?" mode**: retrieve the same topic from two versions and compare.
4. **"Since when?" questions**: e.g. "since when does Node have built-in fetch?" (Node docs include
   `added: vX` metadata).
5. **Citations** on every answer (doc URL + section + version range).

## UI concept
An illustrated **sage** (vector SVG, no pixel art) with three poses: **idle**, **reflecting**
(while searching) and **talking** (while the answer streams). Answers appear in a card with a
typewriter effect; citations carry version badges. Calm modern look: Fraunces + Inter, light and
dark themes following the system setting.

## Tech stack
- **Monorepo:** Nx (integrated, `angular-monorepo` preset)
- **Frontend:** Angular 22 (SCSS, esbuild, no SSR, signals): `apps/web`
- **API:** NestJS: `apps/api` (served at `http://localhost:3000/api`, proxied from web)
- **Ingestion:** plain Node.js CLI: `apps/ingestion` (git checkout → chunk → embed → store)
- **Libraries:** `libs/shared/types` (types, framework/version detection), `libs/server/core`
  (config, DB, embedder, retriever, LLM providers, prompts)
- **Database:** Postgres + pgvector (Docker Compose); exact vector search, no ANN index
- **Embeddings:** bge-small-en-v1.5 (384d) via transformers.js, in process
- **LLM:** Ollama locally (llama3.2:3b); provider adapter so an OpenAI-compatible free tier or
  bring-your-own-key can be plugged in for a hosted demo
- **CI:** GitHub Actions (lint/test/build, integration, Playwright, SonarQube, RAG evals, weekly
  re-ingest)
- **Tests:** Vitest everywhere (unit, integration against a test database, API end-to-end in
  `apps/api-e2e`), Playwright for browser end-to-end (`apps/web-e2e`, mocked API), golden-set
  evals (`evals/`)
- **Code quality:** SonarQube Cloud (free organization), scanned from CI; no self-hosted server

## Data sources (one adapter per framework in `apps/ingestion/src/sources/`)
- Node.js: `nodejs/node` → `doc/api/`, latest tag of each major (1–3 are io.js)
- React: `reactjs/react.dev`, ref `v17.0.2` (Gatsby-era `content/docs`), branch `v18`, `main` (19)
- Vue: `vuejs/v2.vuejs.org` (2) + `vuejs/docs` (3); both only hold their latest docs
- Angular: `angular/angular` at major tags (`aio/content/guide`, later `adev/...`); Angular 2 from
  the old `angular/angular.io` repo at a fixed commit; there is no Angular 3
- Next.js: `vercel/next.js` → `docs/` at tags (12+)
- Nuxt: `nuxt/website-v2` (2) + `nuxt/nuxt` → `docs/` (3+)
- Express: `expressjs/expressjs.com` `main`, per-major folders (`/en/3x`, `/4x`, `/5x`)
- NestJS: `nestjs/docs.nestjs.com`, one branch per past major + master
- Svelte: `sveltejs/svelte` at tags (`v3.x`, `svelte@5.x`)
- TypeScript: `microsoft/TypeScript-Website` history snapshots (one per major)

## Core design: dedupe across versions
Most pages barely change between versions, so each chunk is stored and embedded once with a range.
- Chunk hash = sha256(url path + section + normalized text). Url paths must be identical across
  versions to dedupe (that's why TypeScript cites GitHub for every version; Express doesn't dedupe
  across majors because its URLs contain the version).
- Versions stored as integers `major*1e6 + minor*1e3 + patch` in `first_version_num` /
  `last_version_num`.
- Ingest versions in order; if the hash exists, extend the range, else insert.
- Query filter: `first_version_num <= v AND last_version_num >= v`.
- Each **major** is indexed at its newest release.
- Adding an older or in-between version needs `rebuild <fw>` (re-ingests in order, reusing
  embeddings parked in `embedding_reuse`).

## Retrieval pipeline
query → detect framework + version (from question, pickers or package.json) → exact vector search
restricted to that version → top 6 → LLM answer with citations, streamed (SSE) to the frontend.

Decided 2026-10-25 from the evals: full-text search (RRF) and a cross-encoder reranker were dropped
(97.7% vs 95.9% hit@5 for ~5.4 s per question on CPU), and the HNSW index too (approximate results
cost recall on large scopes; one version is at most ~6k chunks). Record:
`evals/results/hybrid-rerank-ablation.md`.

## Current state
Branch `feat/more-frameworks` has unpushed commits (tests, SonarQube Cloud, docs) and isn't merged
into `main` yet.

Indexed (72 versions, ~78k chunk rows): Angular 2–22, Express 3–5, NestJS 10–12, Next.js 12–16,
Node 1–26 (every major), Nuxt 2–4, React 17–19, Svelte 3–5, TypeScript 3–6, Vue 2–3. AngularJS
questions get a fixed "AngularJS is a separate framework" answer (`notices.ts`), no search or LLM.
- `docker-compose.yml`: full stack (Postgres, migrate, Ollama + model pull, app on :8080);
  `ingestion` service under the `tools` profile. `Dockerfile` targets: `ingestion`, `app` (last).
- `db/migrations/`: 001 `doc_versions` + deduplicated `chunks`, 002 `embedding_reuse`, 003 drop
  full-text, 004 drop the HNSW index.
- `libs/server/core`: config (`.env` via `process.loadEnvFile`), pg pool, migrations, `Embedder`,
  `Retriever` (exact vector search + version filter; `versionFilter: false` is the eval baseline),
  scope/comparison resolution, LLM providers (Ollama, OpenAI-compatible), prompts, fixed notices.
- `apps/ingestion`: CLI (`migrate | versions <fw> | ingest <fw|all> | rebuild <fw> | reset <fw> |
  status`). Checkouts are sparse and accept any ref incl. SHAs (needed on Windows: path-length
  limits). `ingest.ts` takes the checkout as an option so tests can swap it.
- `apps/api`: `POST /api/ask` (SSE: scope → citations → tokens → done; compare mode adds a
  `compare` scope), request validation, throttled per IP; the LLM is injected (`LLM_PROVIDER`);
  serves the web build when `STATIC_DIR` is set.
- `apps/web`: signal store reading the SSE stream (`sage.store.ts`), SVG sage with
  idle/reflecting/talking poses (`sage/`), typewriter answer card (`answer-card/`), citation cards
  with version badges (`citation-list/`), framework/version/compare pickers and package.json
  upload (`ask-form/`). Shows "API unreachable" instead of failing when the API is down.
- `evals/`: 171 golden questions over all ten frameworks; metrics hit@k, MRR, version precision
  (LLM-judge faithfulness optional). `npm run eval` (ablation), `--check` (labels exist in index),
  `--assert` (vs `baseline.json`), `--answers N --judge`. Results in `evals/results/latest.md`.
  The CI eval job ingests Vue only.
- Tests:
  - unit specs next to the code;
  - integration `apps/ingestion/src/*.int.spec.ts` (`vitest.integration.config.mts`;
    global-setup creates + migrates `semver_sage_test` from `TEST_DATABASE_URL`; fakes in
    `src/testing/fakes.ts`);
  - `apps/api-e2e` (Vitest against the running API; no LLM needed);
  - `apps/web-e2e` (Playwright, 14 tests, `/api` mocked via `page.route`; served from the
    production build by `static-server.mjs`).
  The Vitest Nx plugin only infers `test` from `vitest.config.*`, so the integration and e2e
  configs have other names on purpose.
- Coverage: `npm run test:coverage` (unit + integration) -> `coverage/**/lcov.info`, ~62% lines
  merged (2026-10-25). Weakest: `evals` 12%, `apps/api` 54%, ingestion CLI and git checkout.
- SonarQube Cloud: `sonar-project.properties`, `tools/sonar-scan.mjs` (merges lcov to
  repo-relative paths, runs the scanner in Docker). CI needs secret `SONAR_TOKEN` and variables
  `SONAR_ORGANIZATION` / `SONAR_PROJECT_KEY`; Automatic Analysis must be off. Not configured on
  GitHub yet, so the CI job is skipped.
- CI: `.github/workflows/ci.yml` (check, integration, e2e, sonarqube; the last two with a pgvector
  service), `evals.yml`, `reingest.yml` (weekly; skipped until the `DATABASE_URL` secret exists).
- Hosted demo: not deployed; guide in `docs/DEPLOY.md`.

## Next steps (in order)
1. Push `feat/more-frameworks`, open the PR, merge once CI is green.
2. Set up SonarQube Cloud on GitHub (secret + two variables, Automatic Analysis off), then fix
   what the first CI analysis reports and get the quality gate green.
3. Answer latency/robustness (found by benchmark): SSE keep-alive pings while the LLM warms up, a
   longer LLM fetch timeout, a larger Ollama context (`num_ctx`; only `temperature` is set today).
4. Exact-identifier misses (`req.params`, `useSeoMeta`): a cheap identifier match on top of
   vector search, without bringing back the reranker; measure with the evals.
5. Raise coverage where it's thin: API controller/module wiring, eval runner, ingestion CLI.
6. Index migration guides kept in separate repos (Vue 3) for "what replaced X" questions.
7. Deploy the hosted demo (HF Spaces + Neon + Groq) and set the `DATABASE_URL` secret so the
   weekly re-ingest runs.
8. Candidates beyond the list: SvelteKit, React Router/Remix, Astro, Fastify.

## Commands
- Postgres: `npm run db:up`, then `npm run db:migrate`
- Ingest: `npm run ingest:vue` (or `npm run ingestion -- <command>`), status:
  `npm run ingestion -- status`
- Run web + api: `npm start` (= `npx nx run-many -t serve -p web api`)
- Full stack in Docker: `docker compose up -d --build`
- Tests: `npm test`; integration: `npx nx run ingestion:integration` (needs `npm run db:up`);
  browser E2E: `npm run e2e`; API E2E: `npx nx e2e api-e2e`; evals: `npm run eval`
- Coverage: `npm run test:coverage`; SonarQube Cloud scan from this machine: `npm run sonar`
  (token, organization and project key in `.env`)
- Commits: no Co-Authored-By / AI attribution lines (user preference).

Environment: Windows (Node 22.15; Angular 22 wants >= 22.22.3, builds work but npm warns). GitHub
CLI (`gh`) is not installed.
