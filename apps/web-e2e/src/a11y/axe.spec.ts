import { test } from '@playwright/test';
import { expectNoAxeViolations } from '../support/axe';
import { openScreen, screens } from '../support/screens';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`every state meets the automated WCAG 2.2 AA rules, ${colorScheme} theme`, () => {
    // Still frames: a colour check must not land halfway through an animation.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    for (const screen of screens) {
      test(screen.name, async ({ page }) => {
        await openScreen(page, screen);

        await expectNoAxeViolations(page);
      });
    }
  });
}
