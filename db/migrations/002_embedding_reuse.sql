-- Embeddings parked while a framework is rebuilt from scratch (to insert older or in-between
-- versions in order): unchanged text gets its embedding back instead of being re-embedded.
-- Empty except during `ingestion rebuild <framework>`.
CREATE TABLE embedding_reuse (
  framework text        NOT NULL,
  hash      text        NOT NULL,
  embedding vector(384) NOT NULL,
  PRIMARY KEY (framework, hash)
);
