// Serves the production build of the web app with SPA fallback. /api is left unserved (404):
// the tests mock it in the browser.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../dist/apps/web/browser/', import.meta.url));
const port = Number(process.argv[2] ?? 4300);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build at ${root}. Run: npx nx build web`);
  process.exit(1);
}

/** The file under `root` that `urlPath` names, or null when it decodes badly or points outside. */
function resolveInRoot(urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }
  const file = join(root, path);
  const rel = relative(root, file);
  return rel.startsWith('..') || isAbsolute(rel) ? null : file;
}

createServer((req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://x').pathname;
  if (urlPath.startsWith('/api/')) {
    res.writeHead(404).end();
    return;
  }
  const file = resolveInRoot(urlPath);
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream' });
  createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`web build on http://127.0.0.1:${port}`));
