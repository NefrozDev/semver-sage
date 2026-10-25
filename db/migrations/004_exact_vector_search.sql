-- Exact vector search instead of the approximate HNSW index. Every search is scoped to one
-- framework version (at most ~6,000 chunks), which chunks_scope narrows to in milliseconds; ranking
-- that set exactly is fast and never misses a neighbour. With the HNSW index the planner chose it
-- for large scopes (Node), and approximate results cost ~1 point of hit@5 on the golden set.
-- The index was also the largest object in the database (~137 MB).
DROP INDEX IF EXISTS chunks_embedding;
