/**
 * Fixed answers for questions the docs index shouldn't try to answer. They're streamed like an
 * LLM answer but cost no retrieval or model call.
 */

/** "Angular 1.x" is AngularJS: a different framework, not an older Angular. */
export const ANGULARJS_NOTICE = [
  'Ah, a question from the old kingdom. **Angular 1.x is AngularJS**, a different framework from',
  'Angular, not an earlier version of it.',
  '',
  '- **AngularJS** (1.x, 2010–2021) is built around `$scope`, controllers, directives and two-way',
  '  binding through the digest cycle. It reached end of support in January 2022.',
  '- **Angular** (2 and later) was a complete rewrite in TypeScript: components, dependency',
  '  injection, RxJS, the Angular CLI, and today signals and standalone components.',
  '',
  'Concepts and code rarely carry over one to one, so my Angular scrolls (2 through 22) would',
  'mislead you here. For AngularJS itself, see the official docs at https://docs.angularjs.org/guide.',
  '',
  'Moving an AngularJS app to Angular? The upgrade guide covers running both side by side',
  '(https://v17.angular.io/guide/upgrade). Ask me about it with an Angular version, for example',
  '"How do I upgrade from AngularJS in Angular 17?"',
].join('\n');
