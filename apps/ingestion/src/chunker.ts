import { createHash } from 'node:crypto';

export interface PageChunk {
  pageTitle: string;
  /** Heading trail inside the page ("Computed Properties > Basic Example"); page title if none. */
  section: string;
  anchor: string | null;
  text: string;
}

export interface ChunkOptions {
  /** Turns a heading (and the headings it sits under) into the anchor id the docs site generates. */
  slugify: (heading: string, parents: string[]) => string;
  /** Soft cap per chunk; sections above it are split on paragraph boundaries. */
  maxChars?: number;
  /** Chunks with fewer meaningful characters are dropped. */
  minChars?: number;
  /** Deepest heading level that starts a new chunk (default 3: h2 and h3). */
  splitDepth?: number;
}

const FENCE_RE = /^\s*(```|~~~)/;
// Regexes here stay linear (no overlapping quantifiers); trailing parts are trimmed in code.
const HEADING_RE = /^(#{1,6})\s+(\S.*)$/;
const ID_RE = /^[\w-]+$/;

/** Strips every leading and trailing `char` (a loop: `^c+|c+$` backtracks on long runs). */
export function trimChar(text: string, char: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === char) start++;
  while (end > start && text[end - 1] === char) end--;
  return text.slice(start, end);
}

/** Heading text without its closing sequence ("Usage ##" -> "Usage"); keeps at least one char. */
function headingText(raw: string): string {
  const text = raw.trimEnd();
  let end = text.length;
  while (end > 1 && text[end - 1] === '#') end--;
  return text.slice(0, end).trimEnd();
}

/** "Intro {#intro}" -> { text: "Intro", id: "intro" }; no valid trailing id -> id null. */
function splitCustomId(raw: string): { text: string; id: string | null } {
  const text = raw.trimEnd();
  const open = text.lastIndexOf('{#');
  const id = open >= 0 && text.endsWith('}') ? text.slice(open + 2, -1) : '';
  return ID_RE.test(id) ? { text: text.slice(0, open), id } : { text: raw, id: null };
}

/** react.dev heading ids: "## Usage {/*usage*\/}" -> "## Usage {#usage}". */
function mdxHeadingId(line: string): string {
  if (!/^#{1,6}\s/.test(line)) return line;
  const text = line.trimEnd();
  const open = text.lastIndexOf('{/*');
  const id = open >= 0 && text.endsWith('*/}') ? text.slice(open + 3, -3).trim() : '';
  return ID_RE.test(id) ? `${text.slice(0, open).trimEnd()} {#${id}}` : line;
}

/**
 * Applies mdxHeadingId to every line and, like the regex it replaced (`\s*$` in multiline mode),
 * drops the blank lines right after a converted heading: blank lines decide where chunks split.
 */
function mdxHeadingIds(text: string): string {
  const out: string[] = [];
  let afterId = false;
  for (const line of text.split('\n')) {
    if (afterId && !line.trim()) continue;
    const converted = mdxHeadingId(line);
    afterId = converted !== line;
    out.push(converted);
  }
  return out.join('\n');
}

/** Splits a line into alternating [prose, `code`, prose, ...] so code spans can be left alone. */
const proseParts = (line: string) => line.split(/(`+[^`]*`+)/);

function stripHtml(line: string): string {
  return proseParts(line)
    .map((part, i) => (i % 2 ? part : part.replace(/<\/?[A-Za-z][^>]*>/g, '')))
    .join('');
}

/**
 * Normalizes docs markdown from different site generators (VitePress, Hexo, ...) into plain
 * markdown: drops frontmatter, scripts/styles and HTML tags, keeps code blocks intact.
 */
export function cleanMarkdown(markdown: string): { title: string | null; body: string } {
  let text = markdown.replace(/\r\n?/g, '\n');
  let title: string | null = null;

  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (frontmatter) {
    const value = /^title:(.*)$/m.exec(frontmatter[1])?.[1].trim() ?? '';
    // One optional quote on each side, as `['"]?(.+?)['"]?` did
    const start = /^['"]/.test(value) && value.length > 1 ? 1 : 0;
    const end = /['"]$/.test(value) && value.length - start > 1 ? value.length - 1 : value.length;
    title = value.slice(start, end) || null;
    text = text.slice(frontmatter[0].length);
  }

  // Hexo tags (Vue 2 docs)
  text = text
    .replace(/\{%\s*codeblock\s+lang:(\w+)\s*%\}/g, '```$1')
    .replace(/\{%\s*endcodeblock\s*%\}/g, '```')
    .replace(/\{%\s*(end)?raw\s*%\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // MDX heading ids (react.dev) become "{#usage}" before MDX comments (Next.js docs) go
  text = mdxHeadingIds(text).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  const out: string[] = [];
  let inFence = false;
  let skipUntil: RegExp | null = null;

  for (const line of text.split('\n')) {
    if (skipUntil) {
      if (skipUntil.test(line)) skipUntil = null;
      continue;
    }
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const trimmed = line.trim();
    const block = /^<(script|style)\b/i.exec(trimmed);
    if (block) {
      const close = new RegExp(`</${block[1]}>`, 'i');
      if (!close.test(trimmed)) skipUntil = close;
      continue;
    }

    // VitePress API-style toggles carry meaning: keep them as labels.
    if (trimmed.startsWith('<div class="options-api">')) {
      out.push('*(Options API)*');
      continue;
    }
    if (trimmed.startsWith('<div class="composition-api">')) {
      out.push('*(Composition API)*');
      continue;
    }

    // VitePress containers: "::: tip Note" -> "**Note**", closing ":::" dropped
    if (trimmed.startsWith(':::')) {
      const rest = trimmed.replace(/^:+/, '').trim();
      const kind = /^\w[\w-]*/.exec(rest)?.[0];
      const label = kind ? rest.slice(kind.length).trim() : '';
      if (kind && kind !== 'code-group') {
        out.push(`**${label || kind[0].toUpperCase() + kind.slice(1)}**`);
      }
      continue;
    }

    out.push(stripHtml(line));
  }

  return { title, body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

function cleanHeading(raw: string): { text: string; customId: string | null } {
  const { text: withoutId, id: customId } = splitCustomId(raw);
  const text = stripHtml(withoutId)
    .replace(/\[([^[\]]+)\]\([^()]*\)/g, '$1')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, customId };
}

/** Splits text into blocks at blank lines, never inside a fenced code block. */
function blocks(text: string): string[] {
  const result: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '' && current.length) {
      result.push(current.join('\n'));
      current = [];
    } else if (inFence || line.trim() !== '') {
      current.push(line);
    }
  }
  if (current.length) result.push(current.join('\n'));
  return result;
}

function pack(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const block of blocks(text)) {
    if (current && current.length + block.length + 2 > maxChars) {
      parts.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Splits a docs page into heading-scoped chunks (h2..h`splitDepth`; deeper headings stay in the text). */
export function chunkMarkdown(markdown: string, options: ChunkOptions): PageChunk[] {
  const { slugify, maxChars = 1500, minChars = 60, splitDepth = 3 } = options;
  const { title: frontmatterTitle, body } = cleanMarkdown(markdown);

  interface Section {
    trail: string[];
    anchor: string | null;
    lines: string[];
  }
  const sections: Section[] = [{ trail: [], anchor: null, lines: [] }];
  let pageTitle = frontmatterTitle;
  // Open headings by level: stack[0] is the current h2, stack[1] the h3 under it, ...
  const stack: string[] = [];
  let inFence = false;

  for (const line of body.split('\n')) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const heading = inFence ? null : HEADING_RE.exec(line);
    const level = heading?.[1].length ?? 0;
    if (!heading || level > splitDepth) {
      sections[sections.length - 1].lines.push(line);
      continue;
    }
    const { text, customId } = cleanHeading(headingText(heading[2]));
    if (level === 1) {
      pageTitle ??= text;
      continue;
    }
    stack.length = level - 2;
    const parents = stack.filter(Boolean);
    stack[level - 2] = text;
    sections.push({ trail: stack.filter(Boolean), anchor: customId ?? slugify(text, parents), lines: [] });
  }

  const title = pageTitle ?? 'Untitled';
  const meaningful = (s: string) => s.replace(/[\s*_`#>|-]/g, '').length;

  return sections.flatMap(({ trail, anchor, lines }) =>
    pack(lines.join('\n').trim(), maxChars)
      .filter((text) => meaningful(text) >= minChars)
      .map((text) => ({ pageTitle: title, section: trail.join(' > ') || title, anchor, text })),
  );
}

/** Stable identity of a chunk's content at a URL; unchanged chunks hash the same across versions. */
export function chunkHash(urlPath: string, chunk: PageChunk): string {
  const normalized = [urlPath, chunk.section, chunk.text.replace(/\s+/g, ' ').trim()].join('\n');
  return createHash('sha256').update(normalized).digest('hex');
}

/** VitePress-style anchors: "Basic Example" -> "basic-example". */
export const kebabSlug = (heading: string) => trimChar(heading.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'), '-');

/** GitHub / github-slugger anchors: "req.params" -> "reqparams", "Foo Bar" -> "foo-bar". */
export const githubSlug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

/** Hexo-style anchors (case kept): "Vue.extend( options )" -> "Vue-extend-options". */
export const hexoSlug = (heading: string) =>
  trimChar(heading.replace(/[^\p{L}\p{N}]+/gu, '-'), '-');
