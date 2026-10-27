import { cleanNestMarkdown, nestSnapshotVersions } from './nestjs';

describe('nestSnapshotVersions', () => {
  it('snapshots master just before each next major shipped, cited on GitHub at the commit', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    const versions = await nestSnapshotVersions(commitAt, [10, 11]);

    expect(versions.map((v) => `${v.version}@${v.ref}`)).toEqual([
      '6@sha-2020-03-13',
      '7@sha-2021-07-07',
      '8@sha-2022-07-08',
      '9@sha-2023-06-15',
    ]);
    expect(versions[0]).toMatchObject({
      repo: 'nestjs/docs.nestjs.com',
      paths: ['content'],
      docsBaseUrl: 'https://github.com/nestjs/docs.nestjs.com/blob/sha-2020-03-13/',
    });
    expect(commitAt).toHaveBeenCalledTimes(4);
  });

  it('skips majors that have their own docs branch, without looking them up', async () => {
    const commitAt = vi.fn(async (before: string) => `sha-${before}`);
    const versions = await nestSnapshotVersions(commitAt, [9, 10, 11]);

    expect(versions.map((v) => v.version)).toEqual(['6', '7', '8']);
    expect(commitAt).not.toHaveBeenCalledWith('2023-06-15');
    expect(commitAt).toHaveBeenCalledTimes(3);
  });
});

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
