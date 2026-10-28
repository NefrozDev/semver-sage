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
4. **"Since when?" questions**: e.g. "since when does Node have built-in fetch?": a history search
   over every indexed version finds the oldest docs mentioning the subject (see Retrieval pipeline).
5. **Citations** on every answer (doc URL + section + version range).

## UI concept
An illustrated **sage** (vector SVG, no pixel art) with three poses: **idle**, **reflecting**
(while searching: levitates, eyes glowing blue) and **talking** (while the answer streams: starts
with a burst of light from the crystal: glow, rays, shockwave, halo flash). On arrival: idle for
2 s, he waves hello once, and only then speaks the greeting (the sage's `greeted` output starts
it, ~4.6 s after load; the user wanted the wave first, then the speaking). No wave once a question
was asked (`greet` input); with reduced motion, no wave and the greeting starts at once. Answers
appear in a card with a typewriter effect; citations carry version badges. Calm modern look:
Fraunces + Inter, light and dark themes following the system setting.

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
Docs repos without release tags are indexed from **dated snapshots**: the repo as it stood just
before the next release (`commitBefore` in `git.ts`, `snapshotSources` in `sources/snapshots.ts`;
dates are hardcoded npm publish dates).
- Node.js: `nodejs/node` → `doc/api/`: last tag of the stable 0.x lines (0.2 is one page,
  `doc/api.markdown`; 0.4–0.12), then of each major (1–3 are io.js, cited on iojs.org)
- React: 0.3–15.6 from `facebook/react` `docs/` (Jekyll) at each minor's last tag, cited on GitHub
  (0.14.10 and 15.7.0 are 2020 security releases without docs); 16.0–16.14 from `reactjs/react.dev`
  history snapshots, cited on `16.reactjs.org`; ref `v17.0.2` (Gatsby-era `content/docs`), branch
  `v18`, `main` (19)
- Vue: `vuejs/vuejs.org` branches `0.10`/`0.11`/`0.12` (`source/`; 0.11/0.12 cited on
  011/012.vuejs.org, 0.10 on GitHub) and `1.0` (1) + `vuejs/v2.vuejs.org` (2) + `vuejs/docs` (3);
  each only holds its latest docs
- Angular: `angular/angular` at major tags (`aio/content/guide`, later `adev/...`); Angular 2 from
  the old `angular/angular.io` repo at a fixed commit; there is no Angular 3
- Next.js: 1–8 are the README at each major's last tag (`readmePath`: renamed, then moved to
  `packages/next/` in 8), one page with URL path `readme`; `vercel/next.js` → `docs/` at tags from 9
  (1–12 cited on GitHub)
- Nuxt: `nuxt/docs` snapshot before 2.0.0 (1, cited on GitHub) + `nuxt/website-v2` (2) +
  `nuxt/nuxt` → `docs/` (3+)
- Express: 1–2 from `expressjs/express` `docs/*.md` at tags 1.0.8/2.5.11 (cited on GitHub);
  `expressjs/expressjs.com` `main`, per-major folders (`/en/3x`, `/4x`, `/5x`)
- NestJS: `nestjs/docs.nestjs.com`: master snapshots for 4–9 (4 from the Angular page templates
  `src/app/homepage/pages`, converted by `nestHtmlToMarkdown` with code from the components' getters;
  markdown from February 2019), one branch per past major from 10, master for the latest. Every
  version uses the docs.nestjs.com route as URL path; GitHub-cited ones link the file via `{source}`
- A version's base URL may hold a `{source}` placeholder (`SOURCE_PLACEHOLDER`, `citationUrl` in
  `retriever.ts`): the citation links the chunk's source file instead of base + URL path, so a site
  route can stay the URL path (and dedupe) for versions only on GitHub
- Svelte: `sveltejs/v2.svelte.dev` (archived old site: snapshot for 1, head for 2, on GitHub) +
  `sveltejs/svelte` at tags (`v3.x`, `svelte@5.x`)
- TypeScript: 1–2 from `microsoft/TypeScript-Handbook` snapshots; 3+ from
  `microsoft/TypeScript-Website` history snapshots (one per major)

## Core design: dedupe across versions
Most pages barely change between versions, so each chunk is stored and embedded once with a range.
- Chunk hash = sha256(url path + section + normalized text). Url paths must be identical across
  versions to dedupe (that's why TypeScript cites GitHub for every version; Express doesn't dedupe
  across majors because its URLs contain the version).
- Versions stored as integers `major*1e6 + minor*1e3 + patch` in `first_version_num` /
  `last_version_num`.
- Ingest versions in order; if the hash exists, extend the range, else insert.
- Query filter: `first_version_num <= v AND last_version_num >= v`.
- Each **major** is indexed at its newest release, except React 0.x/15.x/16.x, Node 0.x and Vue 0.x
  (one version per minor). A bare major in a request ("React 16", "16.x") maps to the newest indexed version of that
  major (`requestedVersionNum` in `scope.ts`), an exact one to the closest indexed version below.
- Adding an older or in-between version needs `rebuild <fw>` (re-ingests in order, reusing
  embeddings parked in `embedding_reuse`).

## Retrieval pipeline
query → detect framework + version (from question, pickers or package.json) → exact vector search
restricted to that version → top 6 → LLM answer with citations, streamed (SSE) to the frontend.

**"Since when?" mode** (added 2026-10-28, after "When did interceptors arrive in NestJS?" got "12"
in prod: the search only saw the latest version and chunk ranges say when a text appeared, not the
feature). `isSinceWhenQuestion` / `sinceTopics` (shared types) → `Retriever.searchHistory`
(`retrieval/history.ts`): top 60 vector hits over all versions ≤ scope; evidence = within 0.07 of
the best AND naming the subject (in a title, else in the text; product names like "Angular
Elements" tried first); then a literal search for older evidence on the same pages, and on any page
for API names (`getServerSideProps`). Oldest evidence + closest hits (one per section and version),
oldest first. The API writes the verdict line itself (`sinceAnswerStart`: "**Since Node.js 16.**",
"**At least since NestJS 4**, the oldest docs indexed.") and the 3B LLM only describes the oldest
excerpt: asked how a feature "evolved", it invented milestones. The verdict is sent with the LLM's
first token (or alone if the LLM fails): sent before it, the UI switched to "speaking" while the
cold model took ~100 s to start, and users saw an answer that "never stopped talking". Scope event
carries `history`; the web shows "<Framework> X–Y history" + "First found in …". Measured by
`npm run eval:since`.

Decided 2026-10-25 from the evals: full-text search (RRF) and a cross-encoder reranker were dropped
(97.7% vs 95.9% hit@5 for ~5.4 s per question on CPU), and the HNSW index too (approximate results
cost recall on large scopes; one version is at most ~6k chunks). Record:
`evals/results/hybrid-rerank-ablation.md`.

## Current state
PRs #1–#8 are merged into `main` (#7 `feat/answer-robustness`: SSE keep-alive, ingestion
typecheck fix, "since when?" mode, NestJS URL fix, round 3 of older docs; #8
`fix/since-when-followups`: Sonar S8786 in the Nest 4 converter, "never stops talking" fix; merge
`6def526`). Production runs `main` (see Production below); local data = production data
(138 versions). Branch `feat/sage-animations` (local, not pushed): wave hello, levitation with
glowing eyes, bigger burst; the sage card clips its overflow so the burst stays inside.

Indexed locally and in production (138 versions, 86,109 chunk rows, 188,493 version-chunks,
232 MB; 2026-10-28):
Angular 2–22, Express 1–5, NestJS 4–12, Next.js 1–16, Node 0.2/0.4/0.6/0.8/0.10/0.12 + 1–26,
Nuxt 1–4, React 0.3–19 (35 versions: every 0.x, 15.x and 16.x minor, then 17–19), Svelte 1–5,
TypeScript 1–6, Vue 0.10/0.11/0.12 + 1–3: every framework back to its oldest docs we know of
(NestJS 1–3 had no docs site; Express 1.0.8 docs are the oldest in its repo). Evals: hit@5 95.9%,
MRR 0.844 (at baseline); "since when?" 64/64. AngularJS questions get a fixed "AngularJS is a
separate framework" answer (`notices.ts`), no search or LLM.
- `docker-compose.yml`: full stack (Postgres, migrate, Ollama + model pull, app on :8080);
  `ingestion` service under the `tools` profile. `Dockerfile` targets: `ingestion`, `app` (last).
- `db/migrations/`: 001 `doc_versions` + deduplicated `chunks`, 002 `embedding_reuse`, 003 drop
  full-text, 004 drop the HNSW index.
- `libs/server/core`: config (`.env` via `process.loadEnvFile`), pg pool, migrations, `Embedder`,
  `Retriever` (exact vector search + version filter; `versionFilter: false` is the eval baseline),
  scope/comparison resolution, LLM providers (Ollama, OpenAI-compatible), prompts, fixed notices.
- `apps/ingestion`: CLI (`migrate | versions <fw> | ingest <fw|all> | rebuild <fw> | reset <fw> |
  status`). Checkouts are sparse and accept any ref incl. SHAs (needed on Windows: path-length
  limits); a cached checkout already at the remote commit (`git ls-remote`) is not re-fetched
  (on Windows git can't overwrite an identical read-only pack). `ingest.ts` takes the checkout as an
  option so tests can swap it.
- `apps/api`: `POST /api/ask` (SSE: scope → citations → tokens → done; compare mode adds a
  `compare` scope, "since when?" mode a `history` one and the verdict with the LLM's first token),
  request validation, throttled per IP; the LLM is injected (`LLM_PROVIDER`);
  serves the web build when `STATIC_DIR` is set. Sends `: ping` SSE comments every 15 s: nginx
  (60 s `proxy_read_timeout`) was cutting streams at 62 s while a cold model warmed up. Measured
  in prod through nginx after the fix (2026-10-27, cold llama3.2:3b): first token at 182 s, answer
  done at 239 s. Clients must skip non-`data:` frames. Ollama `num_ctx` left at its 4096 default:
  prompts use 1.4–1.7k tokens, never truncated.
- `apps/web`: signal store reading the SSE stream (`sage.store.ts`), SVG sage with
  idle/reflecting/talking poses and a wave hello (`sage/`; Vitest spec runs in CI only, see
  Environment; the animations are also checked by Playwright), typewriter answer card (`answer-card/`), citation cards
  with version badges (`citation-list/`), framework/version/compare pickers and package.json
  upload (`ask-form/`). Shows "API unreachable" instead of failing when the API is down.
- `evals/`: 171 golden questions over all ten frameworks; metrics hit@k, MRR, version precision
  (LLM-judge faithfulness optional). `npm run eval` (ablation), `--check` (labels exist in index),
  `--assert` (vs `baseline.json`), `--answers N --judge`. Results in `evals/results/latest.md`.
  `evals/golden-since/`: 64 "since when?" questions (40 tuning, 24 holdout; expected = oldest
  indexed docs covering the subject, so adding older versions can move them back: check the
  evidence first), `npm run eval:since [--assert]` → `evals/results/since.md`. The CI eval job
  ingests Vue only and runs both.
- Tests:
  - unit specs next to the code;
  - integration `apps/ingestion/src/*.int.spec.ts` (`vitest.integration.config.mts`;
    global-setup creates + migrates `semver_sage_test` from `TEST_DATABASE_URL`; fakes in
    `src/testing/fakes.ts`). `src/testing/` belongs to `tsconfig.spec.json`, not the app config:
    Vite's `tsconfigPaths` resolves `@semver-sage/*` through the tsconfig that includes a file;
  - `apps/api-e2e` (Vitest against the running API; no LLM needed);
  - `apps/web-e2e` (Playwright, 14 tests, `/api` mocked via `page.route`; served from the
    production build by `static-server.mjs`).
  The Vitest Nx plugin only infers `test` from `vitest.config.*`, so the integration and e2e
  configs have other names on purpose.
- Coverage: `npm run test:coverage` (unit + integration) -> `coverage/**/lcov.info`, ~62% lines
  merged (2026-10-25). Weakest: `evals` 12%, `apps/api` 54%, ingestion CLI and git checkout.
- SonarQube Cloud (org `nefrozdev`, project `NefrozDev_semver-sage`, public, so issues can be read
  from `https://sonarcloud.io/api/issues/search?componentKeys=NefrozDev_semver-sage` without a
  token; add `&pullRequest=N` for a PR): keys in `sonar-project.properties`; `test:coverage` ends
  with `tools/merge-coverage.mjs` (lcov with repo-relative paths); CI scans with
  `SonarSource/sonarqube-scan-action` pinned by SHA. CI analysis needs the `SONAR_TOKEN` secret
  and Automatic Analysis off; until then only Automatic Analysis runs (no coverage, and it
  ignores `sonar-project.properties`, so `.github/`, `Dockerfile` and e2e files get analyzed too).
  Check from the public APIs: the `sonarqube` job's annotations
  (`api.github.com/repos/NefrozDev/semver-sage/check-runs/<job id>/annotations`) say "The
  SONAR_TOKEN secret is not set" when it skips; an analysis landing seconds after a push is the
  automatic one, a CI one comes after the tests (minutes).
- Supply chain (Sonar rules): `npm ci --ignore-scripts` everywhere, no `npx` in CI/Docker (use
  `npm run nx -- ...`, `npm run playwright:install`), third-party actions pinned by SHA. Regexes
  must stay linear (S8786): trim with `trimChar` or `trimEnd()` instead of `^x+|x+$`.
- CI: `.github/workflows/ci.yml` (check, integration, e2e, sonarqube; the last two with a pgvector
  service), `evals.yml`, `reingest.yml` (weekly; skipped until the `DATABASE_URL` secret exists).
- Production: the `docker compose` stack on an OVH VPS (ssh alias `ovh-vps`, checkout in
  `~/semver-sage`, ports bound to 127.0.0.1 via `.env`, plus an untracked
  `docker-compose.mailcow.yml` override on the server). Small shared box (2 vCPU, 3.7 GB RAM, disk
  ~85% full): never ingest there; ingest locally and restore a data dump (see Commands). The
  HF Spaces + Neon + Groq guide in `docs/DEPLOY.md` is an unused alternative. Since 2026-10-28 it
  runs `main` (`6def526`; the image was built from `4df7c18`, same code) with the 138-version
  data (236 MB); the 119-version data is kept in `/tmp/semver_sage_backup_before_v3.dump` on the
  server until the next refresh. Checked through the public URL: "When did interceptors arrive in
  NestJS?" → "At least since NestJS 4"; a "since when?" answer's first token (with the verdict)
  came at +183 s with a model cold after the restart, `done` at +196 s, then the stream closed.

## Next steps (in order)
1. Switch SonarQube Cloud to CI analysis (`SONAR_TOKEN` secret, Automatic Analysis off) so
   coverage is reported, then handle what the first CI analysis finds. Not working yet
   (2026-10-28): on PRs #7 and #8 the `sonarqube` job skipped with "The SONAR_TOKEN secret is
   not set", and Automatic Analysis still ran (gate OK; PR #7's only issue, S8786 in `nestjs.ts`,
   fixed in #8, which has 0 issues). The user must add `SONAR_TOKEN` as a repository secret
   (Settings > Secrets and variables > Actions > Repository secrets, not a variable or an
   environment secret) and turn Automatic Analysis off in SonarCloud.
2. Answer quality of llama3.2:3b: it embellishes details (in "since when?" answers it invented
   milestones until it was restricted to the oldest excerpt; "NestJS 12 interceptors are global by
   default" in a normal answer). A stronger free hosted model (Groq, OpenAI-compatible provider
   already supported) would also remove the cold start; the user's call (API key, external service).
3. Cold-start latency on the VPS: 182 s to the first token. Ollama sends response headers with
   the first token and Node's fetch (undici) gives up after 300 s without headers, so compare mode
   (longer prompts) or a busy box could fail with a headers timeout. Options: an undici `Agent`
   with a longer `headersTimeout` for the LLM call; keeping the model loaded (`keep_alive`, ~2 GB
   of RAM on a box shared with the mail server: the user's call); a smaller/faster model.
4. Exact-identifier misses (`req.params`, `useSeoMeta`): a cheap identifier match on top of
   vector search, without bringing back the reranker; measure with the evals. The "since when?"
   search already does a literal match for API names; the same idea could serve here.
5. Raise coverage where it's thin: API module wiring, eval runner, ingestion CLI.
6. Index migration guides kept in separate repos (Vue 3) for "what replaced X" questions.
7. Keep the production index fresh: `reingest.yml` can't reach the prod Postgres (bound to the
   VPS's localhost), so new releases need the local ingest + dump/restore below; decide whether
   to automate it.
8. More frameworks (SvelteKit, React Router/Remix, Astro, Fastify) and golden retrieval questions
   for the old versions (React 0.x–16.x, Node 0.x, Next.js READMEs, NestJS 4).

## Commands
- Postgres: `npm run db:up`, then `npm run db:migrate`
- Ingest: `npm run ingest:vue` (or `npm run ingestion -- <command>`), status:
  `npm run ingestion -- status`
- Run web + api: `npm start` (= `npx nx run-many -t serve -p web api`)
- Full stack in Docker: `docker compose up -d --build`
- Tests: `npm test`; integration: `npx nx run ingestion:integration` (needs `npm run db:up`);
  browser E2E: `npm run e2e`; API E2E: `npx nx e2e api-e2e`; evals: `npm run eval`
- Coverage: `npm run test:coverage` (SonarQube Cloud scans from CI only)
- Refresh the production index (schemas must match): ingest locally (`rebuild <fw>` for older
  versions), check `npm run eval -- --assert`, then
  `docker exec semver-sage-postgres-1 pg_dump -U sage -d semver_sage -Fc --data-only -t doc_versions -t chunks -t chunks_id_seq -f /tmp/data.dump`,
  `docker cp` it out, `scp` it to `ovh-vps`, back up prod the same way, and replace in one
  transaction (~20 s, queries wait on the lock meanwhile; a failure rolls back):
  `{ echo 'BEGIN;'; echo 'TRUNCATE chunks, doc_versions;'; docker exec -i semver-sage-postgres-1 pg_restore --data-only -f - < data.dump; echo 'COMMIT;'; } | docker exec -i semver-sage-postgres-1 psql -U sage -d semver_sage -q -v ON_ERROR_STOP=1`.
  No API restart needed: versions are read live.
- Deploy code to prod: on `ovh-vps` in `~/semver-sage`, check out the branch, then
  `docker compose -f docker-compose.yml -f docker-compose.mailcow.yml build app` and
  `... up -d --no-deps app` (both files, or the app loses its mailcow-network alias used by nginx).
- Remote work from this Windows/PowerShell machine: upload scripts with `scp` and run them as files
  (`bash file < /dev/null`); don't pipe into `ssh ... bash -s` (a `docker exec -i` inside swallows
  the rest of the script) and don't inline nested quotes (PowerShell 5.1 mangles `\"`). Run long
  jobs under `nohup` with a log.
- Commits: no Co-Authored-By / AI attribution lines (user preference).

Environment: Windows, Node 24.15 (was 22.15 until 2026-10-27). GitHub CLI (`gh`) is not installed.
`web:test` fails locally with "Vitest failed to find the runner" (both specs, also on `main`) while
CI is green: a local environment issue, not investigated further; rely on CI for web unit tests.
