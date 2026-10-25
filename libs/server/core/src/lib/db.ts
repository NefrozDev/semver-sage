import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    // Keep scanning the HNSW index until enough rows pass the version filter (pgvector >= 0.8).
    options: '-c hnsw.iterative_scan=relaxed_order',
  });
}

/** Formats an embedding as a pgvector literal, e.g. "[0.1,0.2]". */
export function toVectorLiteral(embedding: ArrayLike<number>): string {
  return `[${Array.from(embedding).join(',')}]`;
}
