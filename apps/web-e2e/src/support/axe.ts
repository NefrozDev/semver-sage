import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Every automated WCAG rule up to 2.2, levels A and AA. */
export const WCAG_AA = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/**
 * Fails with one readable line per violation and element: the rule, its WCAG criteria and
 * where it is, so a report says what to fix without opening the trace.
 */
export async function expectNoAxeViolations(
  page: Page,
  disabledRules: string[] = [],
): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .disableRules(disabledRules)
    .analyze();
  const lines = violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.tags.filter((tag) => /^wcag\d/.test(tag)).join(', ')}): ` +
        `${node.target.join(' ')} — ${node.failureSummary?.split('\n').slice(1).join(' ').trim()}`,
    ),
  );
  expect(lines).toEqual([]);
}
