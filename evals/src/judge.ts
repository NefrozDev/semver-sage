import type { LlmProvider } from '@semver-sage/server-core';
import type { Citation } from '@semver-sage/types';

/**
 * LLM-as-judge faithfulness: the share of the answer's claims that the sources support (0..1).
 * Returns null when the judge's reply can't be parsed. A small local model is a noisy judge;
 * point LLM_* at a stronger model for numbers worth quoting.
 */
export async function judgeFaithfulness(
  llm: LlmProvider,
  citations: Citation[],
  question: string,
  answer: string,
): Promise<number | null> {
  const sources = citations.map((c) => `[${c.n}] ${c.snippet}`).join('\n\n');
  const messages = [
    {
      role: 'system' as const,
      content:
        'You grade answers for faithfulness to sources. List the factual claims in the ANSWER, ' +
        'decide for each whether the SOURCES support it, then reply with ONLY a JSON object: ' +
        '{"supported": <number of supported claims>, "total": <number of claims>}',
    },
    {
      role: 'user' as const,
      content: `SOURCES:\n${sources}\n\nQUESTION: ${question}\n\nANSWER:\n${answer}`,
    },
  ];
  let reply = '';
  for await (const text of llm.stream(messages, new AbortController().signal)) reply += text;
  const match = /\{[^{}]*"supported"\s*:\s*(\d+)[^{}]*"total"\s*:\s*(\d+)[^{}]*\}/.exec(reply);
  if (!match) return null;
  const [supported, total] = [Number(match[1]), Number(match[2])];
  return total > 0 ? Math.min(1, supported / total) : null;
}
