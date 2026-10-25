import { Citation, FRAMEWORKS, ResolvedScope } from '@semver-sage/types';
import type { ChatMessage } from './llm.provider';

const range = (c: Citation) =>
  c.firstVersion === c.lastVersion ? `only in ${c.firstVersion}` : `${c.firstVersion}–${c.lastVersion}`;

export function buildMessages(question: string, scope: ResolvedScope, citations: Citation[]): ChatMessage[] {
  const target = scope.framework
    ? `${FRAMEWORKS[scope.framework].label} ${scope.version}`
    : 'the latest indexed version of each framework';

  const system = [
    'You are Semver Sage, a wise and friendly expert on JavaScript framework documentation.',
    `Answer the question for ${target} using ONLY the numbered documentation excerpts provided.`,
    'Rules:',
    '- Cite the excerpts you rely on inline as [1], [2], ... right after the claim they support.',
    '- If the excerpts do not contain the answer, say so plainly instead of guessing.',
    '- Mind the version: never describe APIs from other versions as if they apply here.',
    '- Be concise. Prefer a short explanation plus a small code example in Markdown when helpful.',
    '- Stay in character lightly (a calm sage), but clarity always comes first.',
  ].join('\n');

  const context = citations
    .map(
      (c) =>
        `[${c.n}] ${FRAMEWORKS[c.framework].label} ${c.version} docs, "${c.pageTitle} › ${c.section}" ` +
        `(this text appears in versions: ${range(c)})\n${c.snippet}`,
    )
    .join('\n\n---\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Documentation excerpts:\n\n${context}\n\nQuestion: ${question}` },
  ];
}
