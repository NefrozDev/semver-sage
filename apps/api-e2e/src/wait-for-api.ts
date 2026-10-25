// Nx starts `api:serve` alongside the tests without waiting for it to listen: poll the health
// endpoint first (the API builds, connects to Postgres and loads the embedder before it answers).
const API = process.env['API_URL'] ?? 'http://localhost:3000';
const TIMEOUT_MS = 180_000;

export default async function waitForApi() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`API not reachable at ${API}/api/health after ${TIMEOUT_MS / 1000} s`, { cause: lastError });
}
