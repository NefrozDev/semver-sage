# Semver Sage

A retrieval-augmented assistant that answers questions about JavaScript frameworks **for any
version**, citing the exact docs page of that version. Most docs sites only show the latest release;
ask "how did filters work in Vue 2?", "since when does Node have fetch?" or "what changed in
v-model between Vue 2 and 3?", or upload your `package.json`, and the sage answers for what you
actually have installed.

Runs 100% locally and for free: Postgres + pgvector, local embedding and reranking models
(transformers.js), and a local LLM via Ollama. Any OpenAI-compatible API can replace the LLM.

**Indexed:** Vue 2–3 · Node.js 14–26 (LTS majors) · Next.js 12–16 · Angular 12–22: 25 docs versions,
71,935 version-chunks stored as 34,296 rows.

## How it works

```
question ─► detect framework + version (question, picker or package.json)
         ─► compare mode? ("Vue 2 vs 3", "between 12 and 14") → retrieve from both versions
         ─► hybrid search, filtered to that version
              ├─ Postgres full-text search
              └─ pgvector cosine similarity (bge-small-en-v1.5)
         ─► Reciprocal Rank Fusion ─► cross-encoder rerank (bge-reranker-base) ─► top 6
         ─► LLM answer with [n] citations, streamed over SSE
```

**Deduplicated across versions.** Most docs pages barely change between releases, so each chunk is
stored once with a version range. Ingesting version N extends `last_version_num` on every chunk that
is unchanged since N-1, and only embeds new text. A query for version `v` filters on
`first_version_num <= v AND last_version_num >= v`. Citation URLs are built from the queried
version's docs base URL, so one chunk spanning Node 18–24 still links to each version's own page.

**Version-exact citations.** Each source adapter knows where a version's docs are published:
`nodejs.org/docs/v18.20.8/api/…`, `nextjs.org/docs/14/…`, `v12.angular.io/…`, `v19.angular.dev/…`,
`v2.vuejs.org/…`. Versions without a hosted site (Next.js 12) link to the file on GitHub at the
release tag.

**"Since when?"** Node's API history (`added: v17.5.0`, change logs) is rendered into the indexed
text, and every citation shows the range of versions its text appears in.

## Retrieval evals

74 golden questions across all frameworks ([evals/golden](evals/golden)). A result only counts if
it comes from the asked framework **and version** and matches an expected page.

<!-- evals:start -->
| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency (CPU) |
| --- | --- | --- | --- | --- | --- | --- |
| Vector only, no version filter | 37.8% | 70.3% | 64.0% | 0.507 | 37.0% | 25 ms |
| + full-text (hybrid, RRF) | 31.1% | 68.9% | 57.4% | 0.470 | 37.0% | 284 ms |
| + rerank | 35.1% | 70.3% | 63.5% | 0.504 | 36.5% | 6940 ms |
| Vector + version filter | 71.6% | 95.9% | 87.4% | 0.822 | 100.0% | 48 ms |
| Hybrid + version filter (no rerank) | 73.0% | 90.5% | 82.7% | 0.813 | 100.0% | 73 ms |
| **Full: hybrid + rerank + version filter** | **77.0%** | **98.6%** | **91.4%** | **0.861** | **100.0%** | 5605 ms |
<!-- evals:end -->

The version filter is the decisive step: without it, 63% of top results come from the right
framework but the wrong version. The reranker adds the last few points at a real latency cost on
CPU. On this set, fusing in full-text search doesn't beat vector search alone until the reranker
runs, so keyword weighting is the next thing to tune. Full report and misses: [evals/results/latest.md](evals/results/latest.md).
Run with `npm run eval` (see [evals/README.md](evals/README.md)).

## Quick start

Prerequisites: Node 22+ and Docker.

**Everything in Docker** (app on http://localhost:8080):

```sh
docker compose up -d --build                     # Postgres, migrations, Ollama (+ model), app
docker compose run --rm ingestion ingest vue     # or: node | nextjs | angular | all
```

**Local development** (hot reload):

```sh
npm install
npm run db:up && npm run db:migrate              # Postgres + pgvector on :5432
npm run ingest:vue                               # or: npm run ingestion -- ingest all
ollama pull llama3.2:3b                          # native Ollama, or `docker compose up -d ollama`
npm start                                        # web on :4200, API on :3000/api
```

The first run downloads the embedding (~35 MB) and reranker (~280 MB) models into `.cache/models`.
Ingesting everything takes about an hour on a laptop CPU; Vue alone takes a few minutes.

## Project layout

| Path                | What                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `apps/web`          | Angular UI: animated sage, RPG dialog box, citations, compare mode, package.json upload |
| `apps/api`          | NestJS: `POST /api/ask` (SSE), `GET /api/versions`, `GET /api/health`; serves the web build in Docker |
| `apps/ingestion`    | CLI: docs repo → chunks → embeddings → Postgres, one source adapter per framework |
| `libs/shared/types` | API types, framework metadata, version encoding, question/comparison/package.json detection |
| `libs/server/core`  | Config, DB, migrations, embedder, reranker, retriever, LLM providers, prompts |
| `evals`             | Golden questions, retrieval metrics, pipeline ablation, answer checks        |
| `db/migrations`     | SQL migrations                                                               |
| `docs/DEPLOY.md`    | Free hosted demo: Hugging Face Spaces + Neon + Groq                          |

## Ingestion CLI

```sh
npm run ingestion -- migrate
npm run ingestion -- versions node                 # what the adapter would ingest (from git tags)
npm run ingestion -- ingest <framework|all> [--version 22]
npm run ingestion -- status
npm run ingestion -- reset <framework>
```

Adapters discover releases from git tags (newest release per major), so new majors are picked up
automatically; already-ingested versions are skipped. Versions are ingested in ascending order per
framework (required for range extension). To add a framework, write a `SourceAdapter` in
`apps/ingestion/src/sources/` and register it in `index.ts`.

## LLM providers

`LLM_PROVIDER=ollama` (default) talks to Ollama's `/api/chat`. `LLM_PROVIDER=openai` talks to any
OpenAI-compatible `/chat/completions` endpoint (Groq or OpenRouter free tiers, LM Studio, or your
own key) via `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`.

## CI

- **CI**: lint, unit tests and builds on every push and PR.
- **Retrieval evals**: ingests Vue into a pgvector service container and fails if the full pipeline
  drops below [evals/baseline.json](evals/baseline.json); other frameworks on demand.
- **Re-ingest new releases**: weekly, ingests newly released majors into the hosted database.

## Known limitations

- Vue's two repos only hold their latest docs, so Vue is indexed per major. The Vue 3 migration
  guide lives in a separate repo and isn't indexed yet.
- Angular's API reference is generated from source code and isn't indexed; the guides are.
- Each major is indexed at its newest release; minor-level differences inside a major come only
  from Node's "Added in" metadata.
- On CPU, the reranker adds ~5 s per question and a small local LLM (llama3.2:3b) takes tens of
  seconds to the first token. A GPU or a hosted LLM makes both fast.
- The LLM-judge faithfulness score needs a stronger judge model than the default 3B one to mean much.

## Tests

```sh
npm test                     # unit tests: detection, versions, chunker, adapters, scope, RRF, metrics, UI
npm run eval                 # retrieval evals (needs an indexed database)
npx nx e2e api-e2e           # needs the API running
```
