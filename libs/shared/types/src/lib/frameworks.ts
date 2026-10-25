export const FRAMEWORK_IDS = [
  'angular',
  'react',
  'vue',
  'node',
  'express',
  'nestjs',
  'nextjs',
  'nuxt',
  'svelte',
  'typescript',
] as const;

export type Framework = (typeof FRAMEWORK_IDS)[number];

/**
 * A way a framework can be named in a question.
 * - `caseSensitive`: only match this exact casing (e.g. "Node" but not "node" in "DOM node").
 * - `needsVersion`: only match when directly followed by a version (e.g. "next 14").
 */
export interface FrameworkAlias {
  pattern: string;
  caseSensitive?: boolean;
  needsVersion?: boolean;
}

export interface FrameworkInfo {
  id: Framework;
  label: string;
  aliases: FrameworkAlias[];
  /** npm packages whose installed version is the framework version. */
  packages: string[];
}

export const FRAMEWORKS: Record<Framework, FrameworkInfo> = {
  angular: {
    id: 'angular',
    label: 'Angular',
    // Not "angular.js" / "AngularJS": that's the separate 1.x framework (see isAngularJsQuestion).
    aliases: [{ pattern: 'angular(?!\\.?js)' }],
    packages: ['@angular/core'],
  },
  react: {
    id: 'react',
    label: 'React',
    aliases: [
      { pattern: 'react\\.?js' },
      { pattern: 'React', caseSensitive: true },
      { pattern: 'react', needsVersion: true },
    ],
    packages: ['react'],
  },
  vue: {
    id: 'vue',
    label: 'Vue',
    aliases: [{ pattern: 'vue(?:\\.?js)?' }],
    packages: ['vue'],
  },
  node: {
    id: 'node',
    label: 'Node.js',
    aliases: [
      { pattern: 'node\\.?js' },
      { pattern: 'Node', caseSensitive: true },
      { pattern: 'node', needsVersion: true },
    ],
    packages: [],
  },
  express: {
    id: 'express',
    label: 'Express',
    aliases: [
      { pattern: 'express\\.?js' },
      { pattern: 'Express', caseSensitive: true },
      { pattern: 'express', needsVersion: true },
    ],
    packages: ['express'],
  },
  nestjs: {
    id: 'nestjs',
    label: 'NestJS',
    aliases: [
      { pattern: 'nest\\.?js' },
      { pattern: 'Nest', caseSensitive: true },
    ],
    packages: ['@nestjs/core'],
  },
  nextjs: {
    id: 'nextjs',
    label: 'Next.js',
    aliases: [
      { pattern: 'next\\.?js' },
      { pattern: 'next', needsVersion: true },
    ],
    packages: ['next'],
  },
  nuxt: {
    id: 'nuxt',
    label: 'Nuxt',
    aliases: [{ pattern: 'nuxt(?:\\.?js)?' }],
    packages: ['nuxt'],
  },
  svelte: {
    id: 'svelte',
    label: 'Svelte',
    // "SvelteKit" is a different framework: the alias regex requires a word boundary after "svelte".
    aliases: [{ pattern: 'svelte' }],
    packages: ['svelte'],
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    aliases: [{ pattern: 'typescript' }, { pattern: 'TS', caseSensitive: true }],
    packages: ['typescript'],
  },
};

export function isFramework(value: unknown): value is Framework {
  return (
    typeof value === 'string' &&
    (FRAMEWORK_IDS as readonly string[]).includes(value)
  );
}
