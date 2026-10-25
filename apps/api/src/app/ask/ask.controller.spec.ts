import { BadRequestException } from '@nestjs/common';
import { validate } from './ask.controller';

describe('validate (POST /api/ask body)', () => {
  it('accepts a question, trims it and drops empty scope fields', () => {
    expect(validate({ question: '  filters?  ', framework: null, version: null })).toEqual({
      question: 'filters?',
      framework: undefined,
      version: undefined,
      compareVersion: undefined,
    });
  });

  it('keeps a full scope', () => {
    expect(validate({ question: 'q', framework: 'vue', version: '2.6', compareVersion: '3' })).toMatchObject({
      framework: 'vue',
      version: '2.6',
      compareVersion: '3',
    });
  });

  it.each([
    [undefined, 'question must be'],
    [{ question: '   ' }, 'question must be'],
    [{ question: 'x'.repeat(1001) }, 'question must be'],
    [{ question: 42 }, 'question must be'],
    [{ question: 'q', framework: 'cobol' }, 'unknown framework'],
    [{ question: 'q', framework: 'vue', version: 'latest' }, 'invalid version'],
    [{ question: 'q', framework: 'vue', version: 3 }, 'invalid version'],
    [{ question: 'q', framework: 'vue', version: `${' '.repeat(40)}2` }, 'invalid version'],
    [{ question: 'q', framework: 'vue', compareVersion: 'x' }, 'invalid compareVersion'],
    [{ question: 'q', compareVersion: '3' }, 'compareVersion needs a framework'],
  ])('rejects %j', (body, message) => {
    expect(() => validate(body)).toThrow(BadRequestException);
    expect(() => validate(body)).toThrow(message);
  });
});
