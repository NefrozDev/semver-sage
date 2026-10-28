# Semver Sage

A retrieval-augmented assistant that answers questions about JavaScript frameworks **for any
version**, citing the exact docs page of that version. Most docs sites only show the latest release;
ask "how did filters work in Vue 2?", "since when does Node have fetch?" or "what changed in
v-model between Vue 2 and 3?", or upload your `package.json`, and the sage answers for what you
actually have installed.

Runs 100% locally and for free: Postgres + pgvector, a local embedding model (transformers.js) and a
local LLM via Ollama. Any OpenAI-compatible API can replace the LLM.

**Indexed (138 docs versions, 10 frameworks, back to each one's oldest docs):** Angular 2–22 ·
Express 1–5 · NestJS 4–12 · Next.js 1–16 · Node.js 0.2–26 (the stable 0.x lines, then every
major; 1–3 are io.js) · Nuxt 1–4 · React 0.3–19 (every minor of 0.x, 15.x and 16.x: 35 versions) ·
Svelte 1–5 · TypeScript 1–6 · Vue 0.10–3. 188,493 version-chunks are stored as 86,109 rows (232 MB).

## How it works

```
question ─► detect framework + version (question, picker or package.json)
         ─► compare mode? ("Vue 2 vs 3", "between 12 and 14") → retrieve from both versions
         ─► "since when?" ("When did interceptors arrive in NestJS?") → history search, all versions
         ─► exact vector search (bge-small-en-v1.5, pgvector), restricted to that version ─► top 6
         ─► LLM answer with [n] citations, streamed over SSE
```

**Deduplicated across versions.** Most docs pages barely change between releases, so each chunk is
stored once with a version range. Ingesting version N extends `last_version_num` on every chunk that
is unchanged since N-1, and only embeds new text. A query for version `v` filters on
`first_version_num <= v AND last_version_num >= v`. Citation URLs are built from the queried
version's docs base URL, so one chunk spanning Node 18–24 still links to each version's own page.

**Version-exact citations.** Each source adapter knows where a version's docs are published:
`nodejs.org/docs/v18.20.8/api/…`, `nextjs.org/docs/14/…`, `v12.angular.io/…`, `v19.angular.dev/…`,
`16.reactjs.org/…`, `17.reactjs.org/…`, `18.react.dev/…`, `v4.svelte.dev/…`, `nuxt.com/docs/3.x/…`,
`expressjs.com/en/4x/…`, `v1.vuejs.org/…`, `v2.vuejs.org/…`, `v2.angular.io/docs/ts/latest/…`
(Angular 2, extracted from the old site's Jade templates), `iojs.org/dist/v1.8.4/doc/api/…` (io.js,
Node 1–3), `nodejs.org/docs/v0.12.18/api/…`, `012.vuejs.org/…`. Versions without a hosted site
(React 0.x–15.x, Next.js 1–12, Express 1–2, NestJS 4–11, Nuxt 1, Vue 0.10, Svelte 1–3,
TypeScript 1–2) link to the file on GitHub at the release tag, branch or snapshot commit. Where
an old version is cited on GitHub but the current one on the docs site (NestJS), the chunks keep the
site's URL path and the GitHub base URL holds a `{source}` placeholder for the file, so unchanged
text still dedupes across the two.

**AngularJS is not Angular.** Questions about AngularJS ("AngularJS", "angular.js", "Angular 1.x", or
the `angular` npm package in a package.json) get a direct answer that it is a separate framework,
with links to its docs and the upgrade guide, instead of misleading Angular 2+ sources. "Migrate
from AngularJS to Angular 17" is answered from the Angular 17 upgrade guide.

**Snapshots for docs without release tags.** typescriptlang.org only serves the latest docs, so
each TypeScript major is a snapshot of the website repo taken just before the next major's release
notes landed (the docs as they stood for 3.9, 4.9, 5.9), plus the current head; TypeScript 1–2 come
from the archived Handbook as it stood when 2.0 and 3.0 shipped. The same idea covers every React
16.x minor (reactjs.org just before the next minor shipped: 16.6 already presents Hooks as an
upcoming feature in "v16.7.0-alpha", 16.8 as stable), NestJS 4–9, Nuxt 1 and Svelte 1. Unchanged
pages dedupe across snapshots. NestJS 4 predates the markdown docs: its pages are converted from the
Angular templates the site used until 2019, with code samples read from the components. Next.js 1–8
are the README the project used as documentation before `docs/` existed.

**Majors and minors.** Most frameworks are indexed once per major, at its newest release; React
0.x, 15.x and 16.x are indexed per minor. A version asked as a bare major ("React 16") maps to the
newest indexed release of that major (16.14), an exact one ("React 16.8.6") to the closest indexed
version at or below it.

**"Since when?"** "When did interceptors arrive in NestJS?" can't be answered from one version, and
not from chunk ranges either: a range says when that exact text appeared, and docs get rewritten.
These questions get a history search across every indexed version of the framework. Similarity
alone picks look-alikes (React 0.13's add-ons page scores close to `createPortal`), so a hit only
counts as evidence when it is close to the best one and names the subject (`useId`, "app router",
"interceptor"), in a title first; older versions of the same pages, and any page for an API name,
are then searched literally. The oldest evidence and the closest hits go to the LLM, oldest first,
with the version found; Node's rendered API history (`Added in: v17.5.0, v16.15.0`) gives the exact
release when present.

## Retrieval evals

171 golden questions across all 10 frameworks ([evals/golden](evals/golden)). A result only counts if
it comes from the asked framework **and version** and matches an expected page.

<!-- evals:start -->
| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Search (CPU) |
| --- | --- | --- | --- | --- | --- | --- |
| Vector search, no version filter | 28.7% | 63.2% | 55.2% | 0.426 | 29.9% | 149 ms |
| **Vector search + version filter (production)** | **74.9%** | **95.9%** | **89.3%** | **0.844** | **100.0%** | 17 ms |
<!-- evals:end -->

The version filter is the decisive step: without it, more than two thirds of the top results come
from the right framework but the wrong version. Full report and misses: [evals/results/latest.md](evals/results/latest.md).
Run with `npm run eval` (see [evals/README.md](evals/README.md)).

**"Since when?" questions** have their own set: 64 questions across the 10 frameworks with the
oldest indexed version whose docs cover the subject ([evals/golden-since](evals/golden-since)). The
history search names it for all 64 ([evals/results/since.md](evals/results/since.md)). 40 of them
were used to calibrate it; on the 24 held out, the first run got 21, and two of the three misses
were wrong expectations (the docs mention `structuredClone` only from Node 18; Angular 13.4's docs
already have the image directive guide). Run with `npm run eval:since`.

**What was tried and dropped.** The first pipeline fused Postgres full-text search with vector
search (Reciprocal Rank Fusion) and reranked the top 24 with a cross-encoder (bge-reranker-base).
Measured on the same 171 questions ([evals/results/hybrid-rerank-ablation.md](evals/results/hybrid-rerank-ablation.md)),
full-text fusion alone made results worse (hit@5 93.6%), and the full hybrid + rerank pipeline
reached 97.7% hit@5 (MRR 0.859) against 95.9% for vector search alone, for ~5.4 s per question on
CPU instead of 25 ms. Dropped for latency; the questions vector search misses are mostly exact API
identifiers (`req.params`, `useSeoMeta`), where a keyword signal would help. The approximate
HNSW index went too: each search covers one version (at most ~6,000 chunks), so exact search is fast
and never misses a neighbour, and the index was the largest object in the database.

## Quick start

Prerequisites: Node 22+ and Docker.

**Everything in Docker** (app on http://localhost:8080):

```sh
docker compose up -d --build                     # Postgres, migrations, Ollama (+ model), app
docker compose run --rm ingestion ingest vue     # or any framework id, or: all
```

**Local development** (hot reload):

```sh
npm install
npm run db:up && npm run db:migrate              # Postgres + pgvector on :5432
npm run ingest:vue                               # or: npm run ingestion -- ingest all
ollama pull llama3.2:3b                          # native Ollama, or `docker compose up -d ollama`
npm start                                        # web on :4200, API on :3000/api
```

The first run downloads the embedding model (~35 MB) into `.cache/models`.
Ingesting all 10 frameworks takes a couple of hours on a laptop CPU (mostly embedding); Vue alone
takes a few minutes. Framework ids: `angular express nestjs nextjs node nuxt react svelte typescript vue`.

## Project layout

| Path                | What                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `apps/web`          | Angular UI: animated sage, RPG dialog box, citations, compare mode, package.json upload |
| `apps/api`          | NestJS: `POST /api/ask` (SSE), `GET /api/versions`, `GET /api/health`; serves the web build in Docker |
| `apps/ingestion`    | CLI: docs repo → chunks → embeddings → Postgres, one source adapter per framework |
| `libs/shared/types` | API types, framework metadata, version encoding, question/comparison/package.json detection |
| `libs/server/core`  | Config, DB, migrations, embedder, retriever, LLM providers, prompts, notices |
| `evals`             | Golden questions, retrieval metrics, pipeline ablation, answer checks        |
| `db/migrations`     | SQL migrations                                                               |
| `docs/DEPLOY.md`    | Free hosted demo: Hugging Face Spaces + Neon + Groq                          |

## Ingestion CLI

```sh
npm run ingestion -- migrate
npm run ingestion -- versions node                 # what the adapter would ingest (from git tags)
npm run ingestion -- ingest <framework|all> [--version 22]
npm run ingestion -- status
npm run ingestion -- rebuild <framework>          # re-ingest every version in order, reusing embeddings
npm run ingestion -- reset <framework>
```

Adapters discover releases from git tags, branches or history (newest release per major), so new
majors are picked up automatically; already-ingested versions are skipped. Versions are ingested in ascending order per
framework (required for range extension); to add older or in-between versions, `rebuild` re-ingests
the framework in order and only embeds text it hasn't seen before. To add a framework, write a `SourceAdapter` in
`apps/ingestion/src/sources/` and register it in `index.ts`.

## LLM providers

`LLM_PROVIDER=ollama` (default) talks to Ollama's `/api/chat`. `LLM_PROVIDER=openai` talks to any
OpenAI-compatible `/chat/completions` endpoint (Groq or OpenRouter free tiers, LM Studio, or your
own key) via `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`.

## CI

- **CI**: lint, unit tests and builds on every push and PR, plus the integration tests (against a
  pgvector service container) and the Playwright browser tests.
- **Retrieval evals**: ingests Vue into a pgvector service container, fails if the production
  pipeline or the "since when?" search drops below [evals/baseline.json](evals/baseline.json), then
  runs the API end-to-end tests against that database; other frameworks on demand.
- **SonarQube**: coverage + analysis on SonarQube Cloud with the official scan action, failing on
  the quality gate; runs once the `SONAR_TOKEN` secret is set. Turn off the project's Automatic
  Analysis in SonarQube Cloud: it can't read coverage and blocks CI analysis.
- **Supply chain**: dependencies install with `--ignore-scripts` (every native binary ships as a
  prebuilt optional package), tools run from `node_modules` via npm scripts instead of `npx`, and
  third-party actions are pinned to a commit.
- **Re-ingest new releases**: weekly, ingests newly released majors into the hosted database.

## Known limitations

- Vue's repos and branches only hold their latest docs, so Vue is indexed per major (per minor for
  0.x). The Vue 3 migration guide lives in a separate repo and isn't indexed yet.
- "Since when?" answers name the oldest indexed docs that cover the subject: a feature older than
  the oldest indexed version is reported as "at least since" it, and an undocumented or renamed
  feature can be dated late (Node's docs only mention `structuredClone` from 18).
- Angular's API reference is generated from source code and isn't indexed; the guides are.
- Each major is indexed at its newest release; minor-level differences inside a major come only
  from Node's "Added in" metadata and TypeScript's release notes.
- TypeScript and older NestJS/Svelte/Next.js/Express/Nuxt versions cite GitHub, since their sites
  only host the latest docs. When NestJS ships a new major, re-ingest it so the previous one moves
  to GitHub links.
- Express pages are versioned by URL (`/en/4x/` vs `/en/5x/`), so they don't dedupe across majors.
- On CPU, a small local LLM (llama3.2:3b) takes tens of seconds to the first token; search itself
  takes ~25 ms. A GPU or a hosted LLM makes the answer fast.
- Pure vector search sometimes misses questions built around an exact identifier (`req.params`);
  see "What was tried and dropped" above.
- The LLM-judge faithfulness score needs a stronger judge model than the default 3B one to mean much.

## Tests and quality

| Layer | Tool | Where | Command |
| --- | --- | --- | --- |
| Unit | Vitest | `*.spec.ts` next to the code | `npm test` |
| Integration | Vitest, real Postgres (`semver_sage_test`), fake docs and embedder | `apps/ingestion/src/*.int.spec.ts` | `npx nx run ingestion:integration` |
| API end-to-end | Vitest + fetch, real API and database | `apps/api-e2e` | `npx nx e2e api-e2e` (starts the API) |
| Browser end-to-end | Playwright (desktop + Pixel 7), production build, mocked API | `apps/web-e2e` | `npm run e2e` |
| Retrieval quality | golden questions | `evals/` | `npm run eval` |
| Coverage + static analysis | SonarQube Cloud (from CI) | `sonar-project.properties` | CI only; `npm run test:coverage` locally |

The integration tests check what unit tests can't: cross-version dedupe (a chunk stored once and
its version range extended), rebuilds that reuse every embedding, and that search only returns
chunks valid for the asked version. They create and migrate a separate `semver_sage_test`
database (`TEST_DATABASE_URL`), so `npm run db:up` is enough.

`npm run test:coverage` (unit + integration) writes lcov reports to `coverage/` and merges them
into `coverage/lcov.merged.info` with repo-relative paths, which the CI scan uploads. In the editor,
the SonarQube for IDE extension shows the same rules as you type.
