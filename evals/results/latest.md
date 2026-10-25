# Retrieval evals

27 golden questions (vue). A result is relevant only if it comes from the
asked framework **and version** and matches an expected docs page or anchor.

| Pipeline | Hit@1 | Hit@5 | Recall@5 | MRR | Version precision@5 | Latency |
| --- | --- | --- | --- | --- | --- | --- |
| Vector only, no version filter | 63.0% | 96.3% | 82.7% | 0.759 | 66.7% | 54 ms |
| + full-text (hybrid, RRF) | 70.4% | 92.6% | 70.4% | 0.813 | 67.4% | 48 ms |
| + rerank | 77.8% | 100.0% | 84.0% | 0.870 | 74.8% | 4700 ms |
| Hybrid + version filter (no rerank) | 92.6% | 96.3% | 82.1% | 0.944 | 100.0% | 57 ms |
| Full: hybrid + rerank + version filter | 92.6% | 100.0% | 90.1% | 0.963 | 100.0% | 4382 ms |

## Full pipeline by framework

| Framework | Questions | Hit@1 | Hit@5 | MRR | Version precision@5 |
| --- | --- | --- | --- | --- | --- |
| Vue | 27 | 92.6% | 100.0% | 0.963 | 100.0% |

## Misses (full pipeline, nothing relevant in the top 5)

_None._

