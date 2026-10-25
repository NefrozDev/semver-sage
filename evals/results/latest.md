# Retrieval evals

74 golden questions (angular, nextjs, node, vue). A result is relevant only if it comes from the
asked framework **and version** and matches an expected docs page or anchor.

| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| Vector only, no version filter | 37.8% | 70.3% | 64.0% | 0.507 | 37.0% | 25 ms |
| + full-text (hybrid, RRF) | 31.1% | 68.9% | 57.4% | 0.470 | 37.0% | 284 ms |
| + rerank | 35.1% | 70.3% | 63.5% | 0.504 | 36.5% | 6940 ms |
| Vector + version filter | 71.6% | 95.9% | 87.4% | 0.822 | 100.0% | 48 ms |
| Hybrid + version filter (no rerank) | 73.0% | 90.5% | 82.7% | 0.813 | 100.0% | 73 ms |
| Full: hybrid + rerank + version filter | 77.0% | 98.6% | 91.4% | 0.861 | 100.0% | 5605 ms |

## Full pipeline by framework

| Framework | Questions | Hit@1 | Hit@5 | MRR | Version precision@5 |
| --- | --- | --- | --- | --- | --- |
| Angular | 16 | 75.0% | 100.0% | 0.865 | 100.0% |
| Next.js | 15 | 66.7% | 93.3% | 0.749 | 100.0% |
| Node.js | 16 | 62.5% | 100.0% | 0.792 | 100.0% |
| Vue | 27 | 92.6% | 100.0% | 0.963 | 100.0% |

## Misses (full pipeline, nothing relevant in the top 5)

- `next14-metadata`: "How do I set the page title and description in the Next.js 14 app router?"
  - got nextjs@14 https://nextjs.org/docs/14/getting-started/installation#creating-directories
  - got nextjs@14 https://nextjs.org/docs/14/app/building-your-application/routing/linking-and-navigating#examples
  - got nextjs@14 https://nextjs.org/docs/14/architecture/accessibility#route-announcements

