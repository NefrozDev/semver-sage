import { Citation, FRAMEWORKS, ResolvedScope } from '@semver-sage/types';
import type { ChatMessage } from './llm.provider';

const range = (c: Citation) =>
  c.firstVersion === c.lastVersion ? `only in ${c.firstVersion}` : `${c.firstVersion}–${c.lastVersion}`;

const label = (scope: ResolvedScope) =>
  scope.framework ? `${FRAMEWORKS[scope.framework].label} ${scope.version}` : 'the latest indexed version of each framework';

const SHARED_RULES = [
  '- Cite the excerpts you rely on inline as [1], [2], ... right after the claim they support.',
  '- Never write URLs or links: the sources are shown to the user next to your answer.',
  '- If the excerpts do not contain the answer, say so plainly instead of guessing.',
  '- Be concise. Prefer a short explanation plus a small code example in Markdown when helpful.',
  '- Stay in character lightly (a calm sage), but clarity always comes first.',
];

// Small models follow instructions near the end of the prompt best, so restate the citation format.
const userMessage = (citations: Citation[], question: string) =>
  `Documentation excerpts:\n\n${renderContext(citations)}\n\nQuestion: ${question}\n\n` +
  'Answer using only these excerpts. Put the source number in brackets after each claim, ' +
  'for example: "Register it globally with Vue.filter() [1]." Do not write any URLs.';

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
    { role: 'user', content: userMessage(citations, question) },
  ];
}

/**
 * "Since when?" mode: excerpts come from every indexed version, oldest first. The search's verdict
 * (the oldest version whose docs mention the subject) is stated so a small model doesn't have to
 * work it out from the version ranges.
 */
export function buildSinceMessages(
  question: string,
  scope: ResolvedScope,
  history: { earliest: string | null; oldest: string },
  citations: Citation[],
): ChatMessage[] {
  const name = scope.framework ? FRAMEWORKS[scope.framework].label : 'the framework';
  const verdict = history.earliest
    ? `The search found it in the docs of ${name} ${history.earliest} at the earliest.`
    : 'The search found no clear mention of it.';
  const atOldest =
    history.earliest === history.oldest
      ? `${history.oldest} is the oldest indexed version, so say it exists at least since ${name} ` +
        `${history.oldest}: older docs aren't indexed.`
      : `Older indexed versions (back to ${history.oldest}) don't mention it.`;
  const system = [
    'You are Semver Sage, a wise and friendly expert on JavaScript framework documentation.',
    `The user asks since which version something exists in ${name}. The indexed ${name} docs go from ` +
      `version ${history.oldest} to ${scope.version}.`,
    `${verdict} ${history.earliest ? atOldest : ''}`.trim(),
    'Rules:',
    `- Start with the version in bold, e.g. "**Since ${name} ${history.earliest ?? 'X'}.**", then explain briefly.`,
    '- If an excerpt states a more precise version ("Added in: v17.5.0", "new in 16.8", "experimental"), ' +
      'give it too, and mention backports or experimental stages it describes.',
    ...SHARED_RULES,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: userMessage(citations, question) },
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
    { role: 'user', content: userMessage(citations, question) },
  ];
}
