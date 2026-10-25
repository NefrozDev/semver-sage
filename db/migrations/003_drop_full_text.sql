-- Full-text search was dropped from retrieval: fused with vector search it never beat vector search
-- alone on the golden set (evals/results/hybrid-rerank-ablation.md). Its column and GIN index only
-- cost storage.
DROP INDEX IF EXISTS chunks_tsv;
ALTER TABLE chunks DROP COLUMN IF EXISTS tsv;
