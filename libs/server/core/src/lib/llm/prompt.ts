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

// Small models follow instructions near the end of the prompt best, so restate the citation format
// (and the mode's main instruction, when there is one).
const userMessage = (citations: Citation[], question: string, instruction = '') =>
  `Documentation excerpts:\n\n${renderContext(citations)}\n\nQuestion: ${question}\n\n${instruction}` +
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

export interface HistoryVerdict {
  earliest: string | null;
  oldest: string;
}

/**
 * "Since when?" mode: the answer's first line, written by the API rather than the LLM so it always
 * matches the search ("**Since Node.js 16.**"). Null when the search found nothing.
 */
export function sinceAnswerStart(scope: ResolvedScope, history: HistoryVerdict): string | null {
  if (!history.earliest || !scope.framework) return null;
  const name = FRAMEWORKS[scope.framework].label;
  return history.earliest === history.oldest
    ? `**At least since ${name} ${history.earliest}**, the oldest docs indexed.\n\n`
    : `**Since ${name} ${history.earliest}.**\n\n`;
}

/**
 * "Since when?" mode: excerpts come from every indexed version, oldest first. When the search found
 * the subject, the answer already starts with `sinceAnswerStart` and the LLM only adds how it
 * evolved; a small model otherwise mixes up the earliest version with a later "Added in".
 */
export function buildSinceMessages(
  question: string,
  scope: ResolvedScope,
  history: HistoryVerdict,
  citations: Citation[],
): ChatMessage[] {
  const name = scope.framework ? FRAMEWORKS[scope.framework].label : 'the framework';
  const start = sinceAnswerStart(scope, history);
  const system = [
    'You are Semver Sage, a wise and friendly expert on JavaScript framework documentation.',
    `The user asks since which version something exists in ${name}. The indexed ${name} docs go from ` +
      `version ${history.oldest} to ${scope.version}.`,
    start
      ? `The first line of your answer is already written: ${start.trim()} Continue after it without ` +
        `repeating it, and never say it appeared in another version: later excerpts (migration guides, ` +
        `API changes) describe changes to something that already existed.`
      : 'The search found no clear mention of it: say so, and what the excerpts do show.',
    'Rules:',
    '- If an excerpt states a more precise release ("Added in: v17.5.0, v16.15.0", "new in 16.8"), ' +
      'give it, and mention backports or experimental stages it describes.',
    ...SHARED_RULES,
  ].join('\n');

  // A 3B model asked how a feature "evolved" invents milestones; describing the oldest excerpt is safe.
  const instruction =
    'The excerpts go from the oldest version to the newest. In one or two sentences, say what it is, ' +
    'as the oldest excerpt describes it, and cite it. If an excerpt calls it experimental or behind a ' +
    'flag, or gives a precise release ("Added in: ..."), say so. Do not describe later versions. Keep ' +
    'it under 60 words.\n';
  return [
    { role: 'system', content: system },
    { role: 'user', content: userMessage(citations, question, instruction) },
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
