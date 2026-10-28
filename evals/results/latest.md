# Retrieval evals

171 golden questions (angular, express, nestjs, nextjs, node, nuxt, react, svelte, typescript, vue). A result is relevant only if it comes from the
asked framework **and version** and matches an expected docs page or anchor.

| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| Vector search, no version filter | 28.7% | 63.2% | 55.2% | 0.426 | 29.9% | 149 ms |
| Vector search + version filter (production) | 74.9% | 95.9% | 89.3% | 0.844 | 100.0% | 17 ms |

## Production pipeline by framework

| Framework | Questions | Hit@1 | Hit@5 | MRR | Version precision@5 |
| --- | --- | --- | --- | --- | --- |
| Angular | 28 | 89.3% | 100.0% | 0.940 | 100.0% |
| Express | 9 | 55.6% | 77.8% | 0.675 | 100.0% |
| NestJS | 11 | 90.9% | 100.0% | 0.955 | 100.0% |
| Next.js | 15 | 46.7% | 86.7% | 0.640 | 100.0% |
| Node.js | 26 | 73.1% | 100.0% | 0.853 | 100.0% |
| Nuxt | 11 | 54.5% | 90.9% | 0.683 | 100.0% |
| React | 16 | 87.5% | 100.0% | 0.938 | 100.0% |
| Svelte | 14 | 71.4% | 100.0% | 0.857 | 100.0% |
| TypeScript | 14 | 71.4% | 85.7% | 0.776 | 100.0% |
| Vue | 27 | 81.5% | 100.0% | 0.901 | 100.0% |

## Misses (production pipeline, nothing relevant in the top 5)

- `express3-params`: "How do I read route parameters in Express 3?"
  - got express@3 https://expressjs.com/en/3x/api/application/#appverbpath-callback-callback
  - got express@3 https://expressjs.com/en/3x/api/#express
  - got express@3 https://expressjs.com/en/3x/api/request/#reqroute
- `express5-query`: "What does req.query contain in Express 5?"
  - got express@5 https://expressjs.com/en/5x/api/application/#appquery
  - got express@5 https://expressjs.com/en/5x/api/application/#appquery
  - got express@5 https://expressjs.com/en/5x/api/
- `next13-dynamic-routes`: "How do I create a dynamic route segment with the app router in Next.js 13?"
  - got nextjs@13 https://nextjs.org/docs/13/getting-started/project-structure#dynamic-routes
  - got nextjs@13 https://nextjs.org/docs/13/getting-started/project-structure#nested-routes
  - got nextjs@13 https://nextjs.org/docs/13/app/building-your-application/routing#the-app-router
- `next14-metadata`: "How do I set the page title and description in the Next.js 14 app router?"
  - got nextjs@14 https://nextjs.org/docs/14/architecture/accessibility#route-announcements
  - got nextjs@14 https://nextjs.org/docs/14/#app-router-vs-pages-router
  - got nextjs@14 https://nextjs.org/docs/14/app/building-your-application/routing#the-app-router
- `nuxt4-seo-meta`: "How do I set SEO meta tags with useSeoMeta in Nuxt 4?"
  - got nuxt@4 https://nuxt.com/docs/4.x/migration/meta
  - got nuxt@4 https://nuxt.com/docs/4.x/api/composables/use-server-seo-meta
  - got nuxt@4 https://nuxt.com/docs/4.x/getting-started/seo-meta#useseometa
- `ts4-mapped-types`: "How do mapped types work in TypeScript 4?"
  - got typescript@4 https://github.com/microsoft/TypeScript-Website/blob/62f87a80f571762ff252eb38b53b890f9f864acb/packages/documentation/copy/en/release-notes/TypeScript%204.1.md#key-remapping-in-mapped-types
  - got typescript@4 https://github.com/microsoft/TypeScript-Website/blob/62f87a80f571762ff252eb38b53b890f9f864acb/packages/documentation/copy/en/release-notes/TypeScript%203.1.md#mapped-types-on-tuples-and-arrays
  - got typescript@4 https://github.com/microsoft/TypeScript-Website/blob/62f87a80f571762ff252eb38b53b890f9f864acb/packages/documentation/copy/en/release-notes/TypeScript%202.1.md#mapped-types
- `ts5-using`: "What are using declarations in TypeScript 5.2?"
  - got typescript@5 https://github.com/microsoft/TypeScript-Website/blob/2207cc60c964a43a61b58a611a3e7b9ba01a72ed/packages/documentation/copy/en/release-notes/TypeScript%202.8.md#better-handling-for-namespace-patterns-in-js-files
  - got typescript@5 https://github.com/microsoft/TypeScript-Website/blob/2207cc60c964a43a61b58a611a3e7b9ba01a72ed/packages/documentation/copy/en/release-notes/TypeScript%202.8.md#defaulted-declarations
  - got typescript@5 https://github.com/microsoft/TypeScript-Website/blob/2207cc60c964a43a61b58a611a3e7b9ba01a72ed/packages/documentation/copy/en/handbook-v2/Type%20Declarations.md#built-in-type-definitions

