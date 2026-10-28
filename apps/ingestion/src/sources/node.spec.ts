import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReleaseTag } from '../git';
import { nodeAdapter, nodeLegacyId, nodeVersions, renderNodeMetadata } from './node';

describe('nodeVersions', () => {
  const tag = (version: string): ReleaseTag => {
    const [major, minor, patch] = version.split('.').map(Number);
    return { tag: `v${version}`, major, minor, patch };
  };
  const tags = [
    '0.1.104', '0.2.6', '0.3.8', '0.4.12', '0.6.21', '0.8.28', '0.9.12', '0.10.47', '0.10.48', '0.11.16', '0.12.18',
    '1.8.4', '3.3.1', '4.9.1', '22.11.0',
  ].map(tag);

  it('indexes the stable 0.x lines from 0.2, then one release per major, oldest first', () => {
    expect(nodeVersions(tags).map((v) => `${v.version}@${v.ref}`)).toEqual([
      '0.2@v0.2.6',
      '0.4@v0.4.12',
      '0.6@v0.6.21',
      '0.8@v0.8.28',
      '0.10@v0.10.48',
      '0.12@v0.12.18',
      '1@v1.8.4',
      '3@v3.3.1',
      '4@v4.9.1',
      '22@v22.11.0',
    ]);
  });

  it('cites io.js majors on iojs.org and everything else, 0.x included, on nodejs.org', () => {
    const base = Object.fromEntries(nodeVersions(tags).map((v) => [v.version, v.docsBaseUrl]));
    expect(base['0.12']).toBe('https://nodejs.org/docs/v0.12.18/');
    expect(base['1']).toBe('https://iojs.org/dist/v1.8.4/doc/');
    expect(base['3']).toBe('https://iojs.org/dist/v3.3.1/doc/');
    expect(base['4']).toBe('https://nodejs.org/docs/v4.9.1/');
  });

  it('reads Node 0.2 from its single API page, later lines from doc/api', () => {
    const paths = Object.fromEntries(nodeVersions(tags).map((v) => [v.version, v.paths]));
    expect(paths['0.2']).toEqual(['doc/api.markdown']);
    expect(paths['0.4']).toEqual(['doc/api']);
  });
});

describe('nodeAdapter.loadPages', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'node-docs-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('maps Node 0.2 to api.html and doc/api pages to api/<module>.html, skipping the index', async () => {
    await mkdir(join(dir, 'doc/api'), { recursive: true });
    const text = 'Reads the entire contents of a file asynchronously and calls back with the data.';
    await writeFile(join(dir, 'doc/api.markdown'), `## fs.readFile(filename, [callback])\n\n${text}`);
    await writeFile(join(dir, 'doc/api/fs.markdown'), `## fs.readFile(filename, [encoding], [callback])\n\n${text}`);
    await writeFile(join(dir, 'doc/api/_toc.markdown'), `## Table of contents\n\n${text}`);
    const source = { version: '0.2', repo: 'nodejs/node', ref: 'v0.2.6', docsBaseUrl: 'https://nodejs.org/docs/v0.2.6/' };

    const single = await nodeAdapter.loadPages(dir, { ...source, paths: ['doc/api.markdown'] });
    const split = await nodeAdapter.loadPages(dir, { ...source, paths: ['doc/api'] });

    expect(single.map((p) => p.urlPath)).toEqual(['api.html']);
    expect(split.map((p) => p.urlPath)).toEqual(['api/fs.html']);
  });
});

describe('renderNodeMetadata', () => {
  it('renders YAML history like nodejs.org', () => {
    const md = [
      '## `fetch`',
      '',
      '<!-- YAML',
      'added:',
      '  - v17.5.0',
      '  - v16.15.0',
      'changes:',
      '  - version:',
      '    - v21.0.0',
      '    pr-url: https://github.com/nodejs/node/pull/45684',
      '    description: No longer',
      '                 experimental.',
      '-->',
      '',
      'A browser-compatible implementation of [`fetch()`][].',
      '',
      '[`fetch()`]: https://developer.mozilla.org/en-US/docs/Web/API/fetch',
    ].join('\n');
    const out = renderNodeMetadata(md);
    expect(out).toContain('*Added in: v17.5.0, v16.15.0*');
    expect(out).toContain('History:\n- v21.0.0: No longer experimental.');
    expect(out).not.toContain('developer.mozilla.org');
  });

  it('keeps the module introduction version', () => {
    expect(renderNodeMetadata('<!--introduced_in=v0.10.0-->')).toBe('*Introduced in: v0.10.0*');
  });
});

describe('nodeLegacyId', () => {
  it('matches the anchors nodejs.org has kept stable since v14', () => {
    expect(nodeLegacyId('fs.readFile(path[, options], callback)', 'doc/api/fs.md')).toBe(
      'fs_fs_readfile_path_options_callback',
    );
    expect(nodeLegacyId('Class: fs.Dir', 'doc/api/fs.md')).toBe('fs_class_fs_dir');
    expect(nodeLegacyId('Asynchronous process creation', 'doc/api/child_process.md')).toBe(
      'child_process_asynchronous_process_creation',
    );
  });
});
