import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

/** Applies `*.sql` files from `dir` in name order, each once, each in its own transaction. */
export async function runMigrations(pool: Pool, dir: string, log = console.log): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];

  for (const file of files.filter((f) => !applied.has(f))) {
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      log(`applied ${file}`);
      ran.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}
