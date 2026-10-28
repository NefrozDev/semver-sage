import type { Citation, ResolvedScope } from '@semver-sage/types';
import { buildCompareMessages, buildMessages, buildSinceMessages } from './prompt';

const scope = (version: string): ResolvedScope => ({
  framework: 'vue',
  requestedVersion: version,
  version,
  source: 'question',
});

const citation = (n: number, version: string, firstVersion = version, lastVersion = version): Citation => ({
  n,
  framework: 'vue',
  version,
  firstVersion,
  lastVersion,
  url: 'https://x',
  pageTitle: 'Filters',
  section: 'Usage',
  snippet: `snippet ${n}`,
});

describe('buildMessages', () => {
  const [system, user] = buildMessages('How do filters work?', scope('2'), [citation(1, '2', '2', '3'), citation(2, '2')]);

  it('scopes the answer to the version and demands [n] citations without URLs', () => {
    expect(system.role).toBe('system');
    expect(system.content).toContain('Answer the question for Vue 2');
    expect(system.content).toContain('Never write URLs');
  });

  it('numbers the sources with their version range, then restates the citation format', () => {
    expect(user.content).toContain('[1] Vue 2 docs, "Filters › Usage" (this text appears in versions: 2–3)\nsnippet 1');
    expect(user.content).toContain('[2] Vue 2 docs, "Filters › Usage" (this text appears in versions: only in 2)');
    expect(user.content.indexOf('Question: How do filters work?')).toBeLessThan(user.content.indexOf('[1].'));
  });

  it('targets every framework when none was detected', () => {
    const [systemAll] = buildMessages('q', { framework: null, requestedVersion: null, version: null, source: 'none' }, []);
    expect(systemAll.content).toContain('the latest indexed version of each framework');
  });
});

describe('buildCompareMessages', () => {
  it('asks for before, after and what changed', () => {
    const [system] = buildCompareMessages('v-model?', scope('2'), scope('3'), [citation(1, '2'), citation(2, '3')]);
    expect(system.content).toContain('what changed between Vue 2 and Vue 3');
    expect(system.content).toContain('**In 2**, **In 3**, and **What changed**');
  });
});

describe('buildSinceMessages', () => {
  const sources = [citation(1, '1'), citation(2, '3', '2', '3')];

  it('states the earliest version found and asks for it first, in bold', () => {
    const [system, user] = buildSinceMessages('When was Teleport added?', scope('3'), { earliest: '2', oldest: '1' }, sources);
    expect(system.content).toContain('since which version something exists in Vue');
    expect(system.content).toContain('from version 1 to 3');
    expect(system.content).toContain('found it in the docs of Vue 2 at the earliest');
    expect(system.content).toContain("Older indexed versions (back to 1) don't mention it.");
    expect(system.content).toContain('"**Since Vue 2.**"');
    expect(system.content).toContain('Added in: v17.5.0');
    expect(user.content).toContain('[2] Vue 3 docs, "Filters › Usage" (this text appears in versions: 2–3)');
  });

  it('says "at least since" when the earliest is the oldest indexed version', () => {
    const [system] = buildSinceMessages('q', scope('3'), { earliest: '1', oldest: '1' }, sources);
    expect(system.content).toContain('exists at least since Vue 1');
    expect(system.content).toContain("older docs aren't indexed");
    expect(system.content).not.toContain("Older indexed versions");
  });

  it('admits when nothing was found', () => {
    const [system] = buildSinceMessages('q', scope('3'), { earliest: null, oldest: '1' }, []);
    expect(system.content).toContain('found no clear mention of it');
    expect(system.content).not.toContain('at least since');
    expect(system.content).toContain('"**Since Vue X.**"');
  });
});
