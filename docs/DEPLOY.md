# Hosted demo (free tiers)

The whole app runs as one container (`app` target in the `Dockerfile`): the NestJS API also serves
the Angular build. A free deployment needs three pieces:

| Piece    | Free option                                   | Why                                                      |
| -------- | --------------------------------------------- | -------------------------------------------------------- |
| App      | Hugging Face Spaces (Docker, CPU basic)       | 2 vCPU / 16 GB RAM: enough for the local embedder and reranker |
| Database | Neon free Postgres (pgvector supported)       | All 10 frameworks (44 versions) take ~310 MB of the 0.5 GB limit |
| LLM      | Groq free tier (OpenAI-compatible API)        | Fast hosted Llama models; no GPU needed in the Space      |

Any OpenAI-compatible endpoint works for the LLM (OpenRouter free models, Google Gemini's
OpenAI-compatible endpoint, ...). Check the provider's console for current model names and limits.

## 1. Database

1. Create a Neon project and copy its connection string (`postgres://...?sslmode=require`).
2. Load the data. Copying your local database is fastest, since nothing gets re-embedded:

   ```sh
   docker compose exec -T postgres pg_dump -U sage -d semver_sage -Fc --no-owner > semver-sage.dump
   pg_restore --no-owner -d "$NEON_DATABASE_URL" semver-sage.dump
   ```

   Or ingest straight into Neon:

   ```sh
   DATABASE_URL="$NEON_DATABASE_URL" npm run db:migrate
   DATABASE_URL="$NEON_DATABASE_URL" npm run ingestion -- ingest all
   ```

3. To keep it current, add the connection string as the `DATABASE_URL` repository secret; the
   weekly **Re-ingest new releases** workflow then picks up new framework majors.

## 2. App on Hugging Face Spaces

1. Create a Space with the **Docker** SDK and push this repository to it. The Space's `README.md`
   needs this front matter (the default Dockerfile target is the app):

   ```yaml
   ---
   title: Semver Sage
   sdk: docker
   app_port: 7860
   ---
   ```

2. Add these Space **secrets / variables**:

   | Name             | Value                                      |
   | ---------------- | ------------------------------------------ |
   | `PORT`           | `7860`                                     |
   | `DATABASE_URL`   | the Neon connection string                 |
   | `LLM_PROVIDER`   | `openai`                                   |
   | `LLM_BASE_URL`   | `https://api.groq.com/openai/v1`           |
   | `LLM_MODEL`      | a current Groq model id                    |
   | `LLM_API_KEY`    | your Groq API key                          |
   | `TRUST_PROXY`    | `true` (rate limits per real client IP)    |
   | `ASK_RATE_LIMIT` | questions per IP per minute (default 20)   |

The first request after a cold start downloads the embedding and reranker models (~300 MB). On
the free CPU tier the reranker adds a few seconds per question; set `RERANK_ENABLED=false` to trade a
little accuracy for speed (see `evals/results/latest.md` for the difference).

## Local full stack

`docker compose up -d --build` runs Postgres, migrations, Ollama (pulls `LLM_MODEL` on first start)
and the app on http://localhost:8080. Ingest docs with
`docker compose run --rm ingestion ingest vue` (or `all`).
