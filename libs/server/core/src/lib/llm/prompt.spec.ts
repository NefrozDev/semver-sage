import type { Citation, ResolvedScope } from '@semver-sage/types';
import { buildCompareMessages, buildMessages } from './prompt';

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
