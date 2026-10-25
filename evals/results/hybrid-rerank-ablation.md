# Why full-text search and the reranker were dropped

Last run of the hybrid pipeline (2026-10-25, 171 golden questions, 72 indexed versions), kept as
the record behind the decision. With the version filter, vector search alone reached hit@5 95.9%
(MRR 0.846) in 17 ms; adding full-text search (RRF) and the bge-reranker-base cross-encoder reached
97.7% (MRR 0.859) but took ~5.4 s per question on CPU. Full-text search on its own made results
worse (hit@5 93.6%). Production now uses vector search + version filter only.

171 golden questions (angular, express, nestjs, nextjs, node, nuxt, react, svelte, typescript, vue). A result is relevant only if it comes from the
asked framework **and version** and matches an expected docs page or anchor.

| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| Vector only, no version filter | 35.1% | 66.1% | 58.4% | 0.478 | 33.9% | 14 ms |
| + full-text (hybrid, RRF) | 31.0% | 60.8% | 52.6% | 0.438 | 29.2% | 193 ms |
| + rerank | 33.3% | 66.7% | 59.9% | 0.466 | 33.8% | 4993 ms |
| Vector + version filter | 75.4% | 95.9% | 89.9% | 0.846 | 100.0% | 17 ms |
| Hybrid + version filter (no rerank) | 73.1% | 93.6% | 86.7% | 0.816 | 100.0% | 20 ms |
| Full: hybrid + rerank + version filter | 77.2% | 97.7% | 91.7% | 0.859 | 100.0% | 5379 ms |

## Full pipeline by framework

| Framework | Questions | Hit@1 | Hit@5 | MRR | Version precision@5 |
| --- | --- | --- | --- | --- | --- |
| Angular | 28 | 82.1% | 100.0% | 0.899 | 100.0% |
| Express | 9 | 55.6% | 100.0% | 0.741 | 100.0% |
| NestJS | 11 | 81.8% | 90.9% | 0.879 | 100.0% |
| Next.js | 15 | 66.7% | 93.3% | 0.749 | 100.0% |
| Node.js | 26 | 69.2% | 100.0% | 0.819 | 100.0% |
| Nuxt | 11 | 72.7% | 90.9% | 0.816 | 100.0% |
| React | 16 | 68.8% | 100.0% | 0.823 | 100.0% |
| Svelte | 14 | 71.4% | 100.0% | 0.833 | 100.0% |
| TypeScript | 14 | 92.9% | 92.9% | 0.937 | 100.0% |
| Vue | 27 | 92.6% | 100.0% | 0.963 | 100.0% |

## Misses (full pipeline, nothing relevant in the top 5)

- `nest10-guards`: "How do I protect a route with a guard in NestJS 10?"
  - got nestjs@10 https://github.com/nestjs/docs.nestjs.com/blob/10.0.0/content/security/authentication.md#implementing-the-authentication-guard
  - got nestjs@10 https://github.com/nestjs/docs.nestjs.com/blob/10.0.0/content/security/authentication.md#implementing-the-authentication-guard
  - got nestjs@10 https://github.com/nestjs/docs.nestjs.com/blob/10.0.0/content/recipes/passport.md#implement-protected-route-and-jwt-strategy-guards
- `next14-metadata`: "How do I set the page title and description in the Next.js 14 app router?"
  - got nextjs@14 https://nextjs.org/docs/14/getting-started/installation#creating-directories
  - got nextjs@14 https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating#examples
  - got nextjs@14 https://nextjs.org/docs/14/#app-router-vs-pages-router
- `nuxt2-plugins`: "How do I add a plugin in Nuxt 2?"
  - got nuxt@2 https://v2.nuxt.com/docs/directory-structure/modules#provide-plugins
  - got nuxt@2 https://v2.nuxt.com/docs/configuration-glossary/configuration-build#postcss
  - got nuxt@2 https://v2.nuxt.com/docs/configuration-glossary/configuration-extend-plugins
- `ts3-interfaces`: "How do I declare an interface in TypeScript 3?"
  - got typescript@3 https://github.com/microsoft/TypeScript-Website/blob/537dc34160a0287319c35cf84cf91c2cad925ddb/packages/documentation/copy/en/reference/Declaration%20Merging.md#basic-concepts
  - got typescript@3 https://github.com/microsoft/TypeScript-Website/blob/537dc34160a0287319c35cf84cf91c2cad925ddb/packages/documentation/copy/en/get-started/TS%20for%20JS%20Programmers.md#defining-types
  - got typescript@3 https://github.com/microsoft/TypeScript-Website/blob/537dc34160a0287319c35cf84cf91c2cad925ddb/packages/documentation/copy/en/release-notes/TypeScript%201.6.md#merging-ambient-class-and-interface-declaration

