import { createPool, runMigrations } from '@semver-sage/server-core';
import { resolve } from 'node:path';
import { Client } from 'pg';

/** Where the integration tests write: a database of its own, never the real index. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://sage:sage@localhost:5432/semver_sage_test';

/** Creates the test database if needed and migrates it (once per run). */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  const pool = createPool(TEST_DATABASE_URL);
  try {
    await runMigrations(pool, resolve(import.meta.dirname, '../../../../db/migrations'), () => undefined);
  } finally {
    await pool.end();
  }
}
