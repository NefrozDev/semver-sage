# Evals

Golden questions per framework live in `golden/*.json`. Each names the docs version the answer must
come from and URL fragments of relevant pages; a result only counts if framework, version and page
all match.

```sh
npm run eval                                  # with and without the version filter, all frameworks
npm run eval -- --frameworks vue,node         # subset
npm run eval -- --configs production --assert # CI: production pipeline vs baseline.json
npm run eval -- --configs production --answers 5 --judge   # also generate answers: citation rate + LLM-judge faithfulness
```

Results are written to `results/latest.md` (committed, so changes show up in review).
Metrics: Hit@k (a relevant result in the top k), Recall@5 (share of expected pages found),
MRR (1 / rank of the first relevant result), Version precision@5 (top-5 results from the asked version).
