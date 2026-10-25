import { cleanNestMarkdown } from './nestjs';

describe('cleanNestMarkdown', () => {
  it('promotes the first heading and keeps only the TypeScript sample', () => {
    const md = [
      '### Controllers',
      '',
      '#### Routing',
      '```typescript',
      '@@filename(cats.controller)',
      'export class CatsController {}',
      '@@switch',
      'export class CatsController { /* js */ }',
      '```',
    ].join('\n');
    expect(cleanNestMarkdown(md)).toBe(
      ['# Controllers', '', '#### Routing', '```typescript', '// cats.controller', 'export class CatsController {}', '```'].join(
        '\n',
      ),
    );
  });
});
