CREATE EXTENSION IF NOT EXISTS vector;

-- One row per (framework, version) that has been ingested.
-- Versions are stored as sortable integers: major * 1e6 + minor * 1e3 + patch.
CREATE TABLE doc_versions (
  framework     text        NOT NULL,
  version_num   integer     NOT NULL,
  version       text        NOT NULL,
  -- Citation URL = docs_base_url || chunks.url_path (so one chunk can cite any version it spans).
  docs_base_url text        NOT NULL,
  source_repo   text        NOT NULL,
  source_ref    text        NOT NULL,
  source_commit text,
  chunk_count   integer     NOT NULL DEFAULT 0,
  ingested_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (framework, version_num)
);

-- Deduplicated chunks: a chunk whose text is unchanged across consecutive versions is stored once,
-- with [first_version_num, last_version_num] covering all of them.
CREATE TABLE chunks (
  id                bigserial PRIMARY KEY,
  hash              text         NOT NULL,
  framework         text         NOT NULL,
  source_path       text         NOT NULL,
  url_path          text         NOT NULL,
  page_title        text         NOT NULL,
  section           text         NOT NULL,
  anchor            text,
  content           text         NOT NULL,
  embedding         vector(384)  NOT NULL,
  first_version_num integer      NOT NULL,
  last_version_num  integer      NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', page_title || ' ' || section), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) STORED,
  CHECK (first_version_num <= last_version_num)
);

-- A hash can reappear after a gap (removed in v3, restored in v4), so identity includes first version.
CREATE UNIQUE INDEX chunks_identity ON chunks (framework, hash, first_version_num);
CREATE INDEX chunks_scope ON chunks (framework, first_version_num, last_version_num);
CREATE INDEX chunks_tsv ON chunks USING gin (tsv);
CREATE INDEX chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
