/**
 * Reads a request's Cookie header. Express has no cookie parser built in, and Semver Sage only
 * reads two cookies it wrote itself, so this stays small instead of adding a dependency.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      // Not written by us (malformed escape): treat it as missing.
      return undefined;
    }
  }
  return undefined;
}
