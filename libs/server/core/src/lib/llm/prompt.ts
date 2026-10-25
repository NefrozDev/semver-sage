import { Citation, FRAMEWORKS, ResolvedScope } from '@semver-sage/types';
import type { ChatMessage } from './llm.provider';

const range = (c: Citation) =>
  c.firstVersion === c.lastVersion ? `only in ${c.firstVersion}` : `${c.firstVersion}–${c.lastVersion}`;

const label = (scope: ResolvedScope) =>
  scope.framework ? `${FRAMEWORKS[scope.framework].label} ${scope.version}` : 'the latest indexed version of each framework';

const SHARED_RULES = [
  '- Cite the excerpts you rely on inline as [1], [2], ... right after the claim they support.',
  '- If the excerpts do not contain the answer, say so plainly instead of guessing.',
  '- Be concise. Prefer a short explanation plus a small code example in Markdown when helpful.',
  '- Stay in character lightly (a calm sage), but clarity always comes first.',
];

function renderContext(citations: Citation[]): string {
  return citations
    .map(
      (c) =>
        `[${c.n}] ${FRAMEWORKS[c.framework].label} ${c.version} docs, "${c.pageTitle} › ${c.section}" ` +
        `(this text appears in versions: ${range(c)})\n${c.snippet}`,
    )
    .join('\n\n---\n\n');
}

export function buildMessages(question: string, scope: ResolvedScope, citations: Citation[]): ChatMessage[] {
  const system = [
    'You are Semver Sage, a wise and friendly expert on JavaScript framework documentation.',
    `Answer the question for ${label(scope)} using ONLY the numbered documentation excerpts provided.`,
    'Rules:',
    ...SHARED_RULES,
    '- Mind the version: never describe APIs from other versions as if they apply here.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Documentation excerpts:\n\n${renderContext(citations)}\n\nQuestion: ${question}` },
  ];
}

/** Compare mode: explain what changed from `from` to `to`, using excerpts from both versions. */
export function buildCompareMessages(
  question: string,
  from: ResolvedScope,
  to: ResolvedScope,
  citations: Citation[],
): ChatMessage[] {
  const system = [
    'You are Semver Sage, a wise and friendly expert on JavaScript framework documentation.',
    `The user wants to know what changed between ${label(from)} and ${label(to)}.`,
    'Use ONLY the numbered documentation excerpts; each says which version it comes from.',
    `Structure the answer as three short parts with bold labels: **In ${from.version}**, **In ${to.version}**, ` +
      'and **What changed** (end with a one-line migration hint when it applies).',
    'Rules:',
    ...SHARED_RULES,
    '- Only claim a difference the excerpts show; if they look the same, say the docs describe no change.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Documentation excerpts:\n\n${renderContext(citations)}\n\nQuestion: ${question}` },
  ];
}
