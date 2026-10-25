import { parseVerdict } from './judge';

describe('parseVerdict', () => {
  it('reads the verdict wrapped in prose or a code fence', () => {
    expect(parseVerdict('Claims: 1 ok, 2 not.\n```json\n{"supported": 1, "total": 2}\n```')).toEqual({
      supported: 1,
      total: 2,
    });
  });

  it('accepts any key order and skips objects that are not the verdict', () => {
    expect(parseVerdict('{claim one} then {"total": 4, "supported": 3}')).toEqual({ supported: 3, total: 4 });
  });

  it('returns null without a usable verdict', () => {
    expect(parseVerdict('I cannot grade this.')).toBeNull();
    expect(parseVerdict('{"supported": "many", "total": 2}')).toBeNull();
    expect(parseVerdict('{' + ' '.repeat(50_000))).toBeNull();
  });
});
