import { kebabSlug } from '../chunker';
import { frontmatterField, loadMarkdownPages } from './markdown-repo';
import type { SourceAdapter, VersionSource } from './types';

const REPO = 'reactjs/react.dev';

/**
 * React keeps each major's docs on a branch of reactjs/react.dev: `v17.0.2` (the Gatsby-era
 * reactjs.org, class components first), `v18` and `main` (react.dev, hooks first).
 */
const VERSIONS: VersionSource[] = [
  { version: '17', repo: REPO, ref: 'v17.0.2', paths: ['content/docs'], docsBaseUrl: 'https://17.reactjs.org/' },
  {
    version: '18',
    repo: REPO,
    ref: 'v18',
    paths: ['src/content/learn', 'src/content/reference'],
    docsBaseUrl: 'https://18.react.dev/',
  },
  {
    version: '19',
    repo: REPO,
    ref: 'main',
    paths: ['src/content/learn', 'src/content/reference'],
    docsBaseUrl: 'https://react.dev/',
  },
];

/** react.dev: "src/content/reference/react/useState.md" -> "reference/react/useState" */
export function reactDevUrlPath(sourcePath: string): string {
  return sourcePath
    .replace(/^src\/content\//, '')
    .replace(/\.md$/, '')
    .replace(/\/index$/, '');
}

export const reactAdapter: SourceAdapter = {
  framework: 'react',

  async versions() {
    return VERSIONS;
  },

  loadPages(checkoutDir, source) {
    return loadMarkdownPages(checkoutDir, source, {
      slugify: (heading) => kebabSlug(heading),
      toUrlPath: (sourcePath, _source, markdown) =>
        // reactjs.org pages declare their URL ("permalink: docs/react-api.html").
        sourcePath.startsWith('content/docs/') ? frontmatterField(markdown, 'permalink') : reactDevUrlPath(sourcePath),
    });
  },
};
