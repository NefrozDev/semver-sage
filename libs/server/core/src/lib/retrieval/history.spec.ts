import {
  HistoryHit,
  isApiName,
  isEvidence,
  relevantHits,
  selectHistory,
  SIMILARITY_MARGIN,
  subjectLikePatterns,
  subjectPattern,
} from './history';
import { citationUrl } from './retriever';

let nextId = 0;
const hit = (overrides: Partial<HistoryHit>): HistoryHit => ({
  id: String(++nextId),
  sim: 0.8,
  firstVersionNum: 16_000_000,
  lastVersionNum: 16_000_000,
  urlPath: 'docs/page.html',
  sourcePath: 'docs/page.md',
  pageTitle: 'Page',
  section: 'Section',
  anchor: null,
  content: 'Text.',
  ...overrides,
});

describe('subjectPattern', () => {
  it.each([
    ['portals', 'Portals', true],
    ['interceptors', 'Binding interceptor classes', true],
    ['signals', 'Signaling', true],
    ['useId', 'useId()', true],
    ['useId', 'useIdentity', false],
    ['React.memo', 'Use React.memo to skip renders', true],
    ['express.json()', 'express.json([options])', true],
    ['@defer block', 'Use @defer to load', true],
    ['App Router', 'The app router uses layouts', true],
    ['App Router', 'Use next/router in your _app', false],
    ['worker_threads', 'Worker threads', true],
    ['optional chaining', 'Optional-chaining operator', true],
    // Generic words are dropped: "built-in fetch" looks for "fetch".
    ['built-in fetch', 'The fetch() function', true],
  ])('"%s" in "%s": %s', (topic, text, expected) => {
    expect(subjectPattern(topic)?.test(text)).toBe(expected);
  });

  it('is null when only generic words are left', () => {
    expect(subjectPattern('new built-in API')).toBeNull();
  });

  it('escapes regex characters from the question', () => {
    expect(subjectPattern('a+b (c)')?.test('a+b (c)')).toBe(true);
  });
});

describe('subjectLikePatterns', () => {
  it('stems plain words, keeps identifiers, splits snake_case and escapes LIKE wildcards', () => {
    expect(subjectLikePatterns('interceptors')).toEqual(['%interceptor%']);
    expect(subjectLikePatterns('useId')).toEqual(['%useId%']);
    expect(subjectLikePatterns('worker_threads')).toEqual(['%worker%', '%thread%']);
    expect(subjectLikePatterns('100% done')).toEqual(['%100\\%%', '%done%']);
    expect(subjectLikePatterns('built-in API')).toEqual([]);
  });
});

describe('isApiName', () => {
  it.each([
    ['getServerSideProps', true],
    ['fs.promises', true],
    ['next/image', true],
    ['@defer block', true],
    ['worker_threads', false],
    ['interceptors', false],
    ['App Router', false],
    ['new API', false],
  ])('%s: %s', (topic, expected) => {
    expect(isApiName(topic)).toBe(expected);
  });
});

describe('isEvidence', () => {
  const subject = subjectPattern('portals');
  const inTitle = hit({ section: 'Portals', content: 'Render children elsewhere.' });
  const inText = hit({ section: 'Overview', content: 'See portals.' });

  it('requires the subject in a title at "title" level, anywhere at "text" level', () => {
    expect(isEvidence(inTitle, subject, 'title')).toBe(true);
    expect(isEvidence(inText, subject, 'title')).toBe(false);
    expect(isEvidence(inText, subject, 'text')).toBe(true);
  });

  it('accepts anything at "similar" level or without a subject', () => {
    expect(isEvidence(hit({ section: 'Other' }), subject, 'similar')).toBe(true);
    expect(isEvidence(hit({ section: 'Other' }), null, 'title')).toBe(true);
  });
});

describe('relevantHits', () => {
  const best = hit({ sim: 0.85, section: 'Portals', firstVersionNum: 16_000_000 });
  const oldLookalike = hit({ sim: 0.83, section: 'Add-ons', content: 'Videos about React.', firstVersionNum: 13_000 });
  const passing = hit({ sim: 0.84, section: 'Overview', content: 'Portals are coming.' });
  const tooFar = hit({ sim: 0.85 - SIMILARITY_MARGIN - 0.01, section: 'Portals' });

  it('keeps close hits naming the subject in a title, so look-alike old pages do not count', () => {
    const { hits, level } = relevantHits([oldLookalike, best, passing, tooFar], subjectPattern('portals'));
    expect(level).toBe('title');
    expect(hits).toEqual([best]);
  });

  it('falls back to mentions in the text, then to the closest hits', () => {
    expect(relevantHits([passing, oldLookalike], subjectPattern('portals'))).toEqual({ hits: [passing], level: 'text' });
    const none = relevantHits([oldLookalike, passing], subjectPattern('suspense'));
    expect(none.level).toBe('similar');
    expect(none.hits).toEqual([passing, oldLookalike]);
  });

  it('handles no candidates', () => {
    expect(relevantHits([], subjectPattern('portals'))).toEqual({ hits: [], level: 'similar' });
  });
});

describe('selectHistory', () => {
  const v = (major: number) => major * 1_000_000;
  const old = hit({ sim: 0.7, firstVersionNum: v(6), lastVersionNum: v(11) });
  const older = hit({ sim: 0.6, firstVersionNum: v(4), lastVersionNum: v(5) });
  const recent = [0.9, 0.88, 0.86, 0.84, 0.82].map((sim) => hit({ sim, firstVersionNum: v(12), lastVersionNum: v(14) }));

  it('names the oldest evidence and cites it at its first version, the others at their newest', () => {
    const { earliestNum, picks } = selectHistory([...recent, old], [older], v(13));
    expect(earliestNum).toBe(v(4));
    expect(picks.map((p) => [p.hit.id, p.citeNum])).toEqual([
      [older.id, v(4)],
      [old.id, v(6)],
      // Capped at the asked version (13), oldest first, at most 6 sources.
      ...recent.slice(0, 4).map((h) => [h.id, v(13)]),
    ]);
  });

  it('does not cite the same chunk twice', () => {
    const { picks } = selectHistory([old, ...recent.slice(0, 1)], [old], v(14));
    expect(picks.map((p) => p.hit.id)).toEqual([old.id, recent[0].id]);
  });

  it('finds nothing without evidence', () => {
    expect(selectHistory([], [], v(14))).toEqual({ earliestNum: null, picks: [] });
  });
});

describe('citationUrl', () => {
  it('appends the URL path and anchor to the base', () => {
    expect(citationUrl('https://docs.nestjs.com/', 'interceptors', 'content/interceptors.md', 'basics')).toBe(
      'https://docs.nestjs.com/interceptors#basics',
    );
  });

  it('links the source file when the base has a {source} placeholder', () => {
    const base = 'https://github.com/nestjs/docs.nestjs.com/blob/11.0.0/{source}';
    expect(citationUrl(base, 'interceptors', 'content/interceptors.md', null)).toBe(
      'https://github.com/nestjs/docs.nestjs.com/blob/11.0.0/content/interceptors.md',
    );
  });
});
