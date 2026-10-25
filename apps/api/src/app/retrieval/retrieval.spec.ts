import { versionToNum, type Framework } from '@semver-sage/types';
import { reciprocalRankFusion } from './rrf';
import { IndexedVersionRow, resolveScope } from './scope';

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

describe('reciprocalRankFusion', () => {
  it('rewards items ranked well in several lists', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'd', 'e']], (x) => x);
    expect(fused.map((f) => f.item)).toEqual(['b', 'a', 'd', 'c', 'e']);
  });
});
