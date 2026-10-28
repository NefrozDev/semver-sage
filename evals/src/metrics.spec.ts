import {
  citationStats,
  GoldenItem,
  Retrieved,
  scoreItem,
  scoreSince,
  SinceItem,
  summarize,
  summarizeSince,
} from './metrics';

const item: GoldenItem = {
  id: 'x',
  question: 'q',
  framework: 'vue',
  version: '2',
  expect: ['v2/guide/filters.html', 'v2/api/#Vue-filter'],
};
const r = (version: string, url: string): Retrieved => ({ framework: 'vue', version, url });

describe('scoreItem', () => {
  it('scores rank-based metrics on the first relevant result', () => {
    const score = scoreItem(item, [
      r('2', 'https://v2.vuejs.org/v2/guide/computed.html'),
      r('2', 'https://v2.vuejs.org/v2/guide/filters.html#Basics'),
    ]);
    expect(score).toMatchObject({ hit1: 0, hit5: 1, reciprocalRank: 0.5, recall5: 0.5, firstRelevantRank: 2 });
  });

  it('does not count the right page from the wrong version', () => {
    const score = scoreItem(item, [r('3', 'https://v2.vuejs.org/v2/guide/filters.html')]);
    expect(score).toMatchObject({ hit5: 0, reciprocalRank: 0, versionPrecision5: 0 });
  });

  it('measures how many of the top 5 come from the asked version', () => {
    const score = scoreItem(item, [r('2', 'a'), r('3', 'b'), r('2', 'c'), r('3', 'd')]);
    expect(score.versionPrecision5).toBe(0.5);
  });
});

describe('summarize', () => {
  it('averages item scores', () => {
    const scores = [scoreItem(item, [r('2', 'v2/api/#Vue-filter')]), scoreItem(item, [])];
    expect(summarize(scores)).toMatchObject({ count: 2, hit1: 0.5, reciprocalRank: 0.5 });
  });
});

describe('citationStats', () => {
  it('finds valid and dangling [n] markers', () => {
    expect(citationStats('Use Vue.filter [1][7].', 6)).toEqual({ cites: true, invalid: 1 });
    expect(citationStats('No sources here.', 6)).toEqual({ cites: false, invalid: 0 });
  });
});

describe('scoreSince', () => {
  const since: SinceItem = { id: 's', question: 'When was useId added?', framework: 'react', earliest: '18', set: 'holdout' };

  it('is correct only when the search names the expected version', () => {
    expect(scoreSince(since, true, '18', ['18', '19'])).toEqual({
      id: 's',
      set: 'holdout',
      detected: true,
      correct: true,
      cited: true,
    });
    expect(scoreSince(since, true, '16.6', ['16.6', '18'])).toMatchObject({ correct: false, cited: true });
  });

  it('handles a search that found nothing', () => {
    expect(scoreSince(since, false, null, [])).toMatchObject({ detected: false, correct: false, cited: false });
  });
});

describe('summarizeSince', () => {
  it('averages detection, accuracy and citation rates', () => {
    const scores = [
      { id: 'a', set: 'tuning' as const, detected: true, correct: true, cited: true },
      { id: 'b', set: 'holdout' as const, detected: true, correct: false, cited: true },
      { id: 'c', set: 'holdout' as const, detected: false, correct: false, cited: false },
      { id: 'd', set: 'holdout' as const, detected: true, correct: true, cited: false },
    ];
    expect(summarizeSince(scores)).toEqual({ count: 4, detection: 0.75, accuracy: 0.5, cited: 0.5 });
  });

  it('returns zeros for no questions', () => {
    expect(summarizeSince([])).toEqual({ count: 0, detection: 0, accuracy: 0, cited: 0 });
  });
});
