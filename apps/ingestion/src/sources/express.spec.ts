import { cleanExpressMdx, expressUrlPath } from './express';

describe('expressUrlPath', () => {
  it.each([
    ['src/content/api/5x/api/request/index.mdx', 'en/5x/api/request/'],
    ['src/content/api/3x/api.mdx', 'en/3x/api/'],
    ['src/content/docs/en/4x/guide/routing.mdx', 'en/4x/guide/routing/'],
  ])('%s', (sourcePath, url) => {
    expect(expressUrlPath(sourcePath)).toBe(url);
  });
});

describe('cleanExpressMdx', () => {
  it('drops component imports but not code', () => {
    const md = "import Alert from '@components/Alert.astro';\nText\n```js\nimport express from 'express';\n```";
    expect(cleanExpressMdx(md)).toBe("Text\n```js\nimport express from 'express';\n```");
  });
});
