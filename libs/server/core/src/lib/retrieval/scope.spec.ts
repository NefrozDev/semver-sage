import { versionToNum, type Framework } from '@semver-sage/types';
import { IndexedVersionRow, resolveComparison, resolveScope } from './scope';

const row = (framework: Framework, version: string): IndexedVersionRow => ({
  framework,
  version,
  versionNum: versionToNum(version),
});
const indexed = [row('vue', '2'), row('vue', '3'), row('nextjs', '13.5'), row('nextjs', '14.2')];

describe('resolveScope', () => {
  it('uses the framework and version from the question', () => {
    const scope = resolveScope({ question: 'How do filters work in Vue 2.6?' }, indexed);
    expect(scope).toMatchObject({ framework: 'vue', requestedVersion: '2.6', version: '2', source: 'question' });
    expect(scope.note).toBeUndefined();
  });

  it('lets explicit request fields win', () => {
    const scope = resolveScope({ question: 'Vue 2 filters?', framework: 'vue', version: '3' }, indexed);
    expect(scope).toMatchObject({ version: '3', source: 'request' });
  });

  it('defaults to the latest indexed version', () => {
    expect(resolveScope({ question: 'Next.js middleware' }, indexed)).toMatchObject({
      framework: 'nextjs',
      version: '14.2',
      source: 'latest',
    });
  });

  it('picks the newest indexed version at or below the requested one', () => {
    expect(resolveScope({ question: 'next 14.0 caching' }, indexed).version).toBe('13.5');
  });

  it('maps a bare major to its newest indexed minor', () => {
    const minors = [row('react', '15.6'), row('react', '16.0'), row('react', '16.8'), row('react', '16.14'), row('react', '17')];
    for (const question of ['React 16 context', 'React v16 context', 'React 16.x context']) {
      const scope = resolveScope({ question }, minors);
      expect(scope).toMatchObject({ version: '16.14', source: 'question' });
      expect(scope.note).toBeUndefined();
    }
    expect(resolveScope({ question: 'context', framework: 'react', version: '16' }, minors).version).toBe('16.14');
  });

  it('keeps an explicit minor, and maps an unindexed one to the closest older minor', () => {
    const minors = [row('react', '0.14'), row('react', '16.0'), row('react', '16.8'), row('react', '16.14')];
    expect(resolveScope({ question: 'hooks in React 16.8' }, minors).version).toBe('16.8');
    expect(resolveScope({ question: 'hooks in React 16.9.0' }, minors).version).toBe('16.8');
    expect(resolveScope({ question: 'mixins in React 0.14' }, minors).version).toBe('0.14');
    expect(resolveScope({ question: 'mixins in React 0' }, minors).version).toBe('0.14');
  });

  it('explains when the requested major is not indexed', () => {
    const scope = resolveScope({ question: 'Vue 1 directives' }, indexed);
    expect(scope.version).toBe('2');
    expect(scope.note).toMatch(/Vue 1 isn't indexed/);
  });

  it('flags frameworks without docs', () => {
    expect(resolveScope({ question: 'Angular 12 forms' }, indexed)).toMatchObject({
      framework: 'angular',
      version: null,
      note: "Angular docs aren't indexed yet.",
    });
  });

  it('searches everything when no framework is named', () => {
    expect(resolveScope({ question: 'how do I lazy load?' }, indexed)).toMatchObject({
      framework: null,
      versionNum: null,
      source: 'none',
    });
  });
});

describe('resolveComparison', () => {
  const versions = (pair: ReturnType<typeof resolveComparison>) => pair?.map((s) => s.version);

  it('detects a comparison in the question, oldest first', () => {
    expect(versions(resolveComparison({ question: 'Vue 3 vs Vue 2 v-model' }, indexed))).toEqual(['2', '3']);
  });

  it('takes the second version from the request', () => {
    const pair = resolveComparison({ question: 'v-model', framework: 'vue', version: '2', compareVersion: '3' }, indexed);
    expect(versions(pair)).toEqual(['2', '3']);
    expect(pair?.[0].source).toBe('request');
  });

  it('is not a comparison when both versions map to the same docs', () => {
    expect(resolveComparison({ question: 'Vue 2.6 vs 2.7 filters' }, indexed)).toBeNull();
    expect(resolveComparison({ question: 'Vue 2 filters' }, indexed)).toBeNull();
  });
});
