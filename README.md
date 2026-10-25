# Semver Sage

A retrieval-augmented assistant that answers questions about JavaScript frameworks **for any
version**, citing the exact docs page of that version. Ask "how did filters work in Vue 2?" or
upload your `package.json`, and the sage answers for what you actually have installed.

Runs 100% locally and for free: Postgres + pgvector, local embedding and reranking models
(transformers.js), and a local LLM via Ollama.

## How it works

```
question ─► detect framework + version (question, picker or package.json)
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
version's docs base URL, so a chunk spanning 2–5 still links to the right site for each.

## Quick start

Prerequisites: Node 22+, Docker, and either [Ollama](https://ollama.com) or the bundled container.

```sh
npm install
cp .env.example .env               # optional: every setting has a local default

npm run db:up                      # Postgres + pgvector on :5432
npm run db:migrate
npm run ingest:vue                 # clones Vue 2 + Vue 3 docs, chunks, embeds (~2 min on CPU)

# LLM: native Ollama, or the container
ollama pull llama3.2:3b
# or: docker compose --profile ollama up -d && docker compose exec ollama ollama pull llama3.2:3b

npm start                          # web on http://localhost:4200, API on :3000/api
```

The first run downloads the embedding (~35 MB) and reranker (~280 MB) models into `.cache/models`.

## Project layout

| Path                  | What                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `apps/web`            | Angular UI: animated sage, RPG dialog box, citations, package.json upload |
| `apps/api`            | NestJS: `POST /api/ask` (SSE), `GET /api/versions`, `GET /api/health`     |
| `apps/ingestion`      | CLI: docs repo → chunks → embeddings → Postgres, one source adapter per framework |
| `libs/shared/types`   | API types, framework metadata, version encoding, question/package.json detection |
| `libs/server/core`    | Config, DB pool, migrations, local embedder and reranker                 |
| `db/migrations`       | SQL migrations                                                           |

## Ingestion CLI

```sh
npm run ingestion -- migrate
npm run ingestion -- ingest vue [--version 3]
npm run ingestion -- status
npm run ingestion -- reset vue
```

Versions are ingested in ascending order per framework (required for range extension). To add a
framework, write a `SourceAdapter` in `apps/ingestion/src/sources/` and register it in `index.ts`.

## LLM providers

`LLM_PROVIDER=ollama` (default) talks to Ollama's `/api/chat`. `LLM_PROVIDER=openai` talks to any
OpenAI-compatible `/chat/completions` endpoint (Groq or OpenRouter free tiers, LM Studio, or your
own key) via `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY`.

## Known limitations

- Indexed so far: Vue 2 (`vuejs/v2.vuejs.org`) and Vue 3 (`vuejs/docs`). Both repos only hold their
  latest docs, so Vue is indexed per major.
- The Vue 3 migration guide lives in a separate repo and isn't indexed yet, so "what replaced X in
  Vue 3" questions are weaker than they should be.
- On CPU, a small local model (llama3.2:3b) takes 20–30 s to the first token, and it doesn't always
  cite inline. Retrieval itself takes about 4 s.

## Tests

```sh
npm test                     # unit tests: detection, versions, chunker, scope resolution, RRF, UI
npx nx e2e api-e2e           # needs the API running
```
