import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    // Keep scanning the HNSW index until enough rows pass the version filter (pgvector >= 0.8).
    options: '-c hnsw.iterative_scan=relaxed_order',
  });
  // An idle client whose connection drops (network blip, proxy reset) emits 'error' on the pool;
  // unhandled, that crashes the process. The pool discards the client and the next query reconnects.
  pool.on('error', (err) => console.warn(`Postgres idle client error: ${err.message}`));
  return pool;
}

/** Formats an embedding as a pgvector literal, e.g. "[0.1,0.2]". */
export function toVectorLiteral(embedding: ArrayLike<number>): string {
  return `[${Array.from(embedding).join(',')}]`;
}
