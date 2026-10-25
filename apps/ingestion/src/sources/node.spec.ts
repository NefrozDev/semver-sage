import { nodeLegacyId, renderNodeMetadata } from './node';

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
