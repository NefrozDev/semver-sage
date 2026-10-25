import { comparisonTopic, detectComparison, detectFrameworks, detectFromPackageJson, primaryMention } from './detect';

const first = (q: string) => {
  const [m] = detectFrameworks(q);
  return m ? { framework: m.framework, version: m.version } : null;
};

describe('detectFrameworks', () => {
  it.each([
    ['How did computed properties work in Vue 2?', 'vue', '2'],
    ['vue@2.7 filters', 'vue', '2.7'],
    ['How did this work in Angular 12?', 'angular', '12'],
    ['Angular v17 control flow', 'angular', '17'],
    ['since when does Node have built-in fetch?', 'node', null],
    ['node 18 fetch', 'node', '18'],
    ['What changed in Next.js routing between 12 and 14?', 'nextjs', null],
    ['next 13 app router', 'nextjs', '13'],
    ['React 18 automatic batching', 'react', '18'],
    ['NestJS guards', 'nestjs', null],
    ['express.js 4 router', 'express', '4'],
    ['Nuxt 3 server routes', 'nuxt', '3'],
    ['How do runes work in Svelte 5?', 'svelte', '5'],
    ['What are satisfies expressions in TypeScript 4.9?', 'typescript', '4.9'],
    ['TS 5 decorators', 'typescript', '5'],
  ])('%s', (question, framework, version) => {
    expect(first(question)).toEqual({ framework, version });
  });

  it.each([
    'How do I remove a DOM node?',
    "What's next after mounting?",
    'How should a component react to prop changes?',
    'Please express this as a function',
    'How do I set up SvelteKit routing?',
    'What is the TSLint replacement?',
  ])('ignores everyday words: %s', (question) => {
    expect(detectFrameworks(question)).toEqual([]);
  });

  it('returns every mention in order', () => {
    const found = detectFrameworks('Vue 2 vs Vue 3 reactivity, compared to React');
    expect(found.map((m) => [m.framework, m.version])).toEqual([
      ['vue', '2'],
      ['vue', '3'],
      ['react', null],
    ]);
  });
});

describe('detectComparison', () => {
  it.each([
    ['What changed in Vue 2 vs Vue 3 for v-model?', 'vue', '2', '3'],
    ['What changed in Next.js routing between 12 and 14?', 'nextjs', '12', '14'],
    ['Angular 17 → 12 control flow', 'angular', '12', '17'],
    ['Migrating from Node 16 to 20: what about fetch?', 'node', '16', '20'],
    ['React 17 vs 18 batching', 'react', '17', '18'],
  ])('%s', (question, framework, from, to) => {
    expect(detectComparison(question)).toEqual({ framework, from, to });
  });

  it.each([
    'How do computed properties work in Vue 2?',
    'Using Vue 3 with Node 18',
    'Vue 3 and Vue 3.0 setup',
  ])('ignores single-version questions: %s', (question) => {
    expect(detectComparison(question)).toBeNull();
  });
});

describe('primaryMention', () => {
  const primary = (q: string) => primaryMention(detectFrameworks(q))?.framework ?? null;

  it.each([
    ['How do I run a TypeScript file directly in Node 22?', 'node'],
    ['How do I type props in Vue with TypeScript?', 'vue'],
    ['TypeScript 5 decorators in NestJS', 'typescript'],
    ['What are mapped types in TypeScript?', 'typescript'],
    ['Next.js 14 on Node 18', 'nextjs'],
  ])('%s', (question, framework) => {
    expect(primary(question)).toBe(framework);
  });
});

describe('comparisonTopic', () => {
  it.each([
    ['What changed in v-model between Vue 2 and 3?', 'v-model'],
    ['What changed in Next.js routing between 12 and 14?', 'routing'],
    ['Vue 2 vs Vue 3 reactivity', 'reactivity'],
    ['Migrating from Node 16 to 20: what about fetch?', 'what about fetch'],
  ])('%s', (question, topic) => {
    expect(comparisonTopic(question)).toBe(topic);
  });

  it('falls back to the question when nothing is left', () => {
    expect(comparisonTopic('Vue 2 vs 3?')).toBe('Vue 2 vs 3?');
  });
});

describe('detectFromPackageJson', () => {
  it('reads dependency ranges and engines', () => {
    const found = detectFromPackageJson({
      dependencies: { vue: '^2.6.14', express: '~4.18.2' },
      devDependencies: { '@angular/core': '>=12.0.0 <13' },
      engines: { node: '>=18' },
    });
    expect(found).toEqual([
      { framework: 'angular', version: '12.0.0', from: 'devDependencies.@angular/core' },
      { framework: 'vue', version: '2.6.14', from: 'dependencies.vue' },
      { framework: 'express', version: '4.18.2', from: 'dependencies.express' },
      { framework: 'node', version: '18', from: 'engines.node' },
    ]);
  });

  it('skips ranges without a concrete version', () => {
    expect(detectFromPackageJson({ dependencies: { react: 'latest' } })).toEqual([]);
  });
});
