import { expect, test } from '@playwright/test';
import { openScreen, screens } from '../support/screens';

interface FocusStop {
  /** The element, as a person would name it: its tag and text or label. */
  name: string;
  /** A visible outline or ring. */
  indicated: boolean;
  /** The outline against what surrounds it; null for a ring drawn with a shadow. */
  contrast: number | null;
  /** At least part of it shows, not covered by the tab bar or anything else. */
  visible: boolean;
}

/** Describes the focused element; null when the page itself has focus. */
function describeFocus(): FocusStop | null {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) return null;

  // The browser paints the colours, in order, on one white pixel: it resolves every colour
  // syntax (color-mix, color(srgb …)) and blends transparent ones as the screen shows them.
  const paint = (colors: string[]) => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return [255, 255, 255];
    for (const color of ['#fff', ...colors]) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const luminance = ([r, g, b]: number[]) => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  // The backgrounds the outline is drawn over: every ancestor's, from the page down.
  const backgrounds: string[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    backgrounds.unshift(getComputedStyle(node).backgroundColor);
  }

  // The outline may be the element's or, for a field drawn as a box around its input, its
  // container's (:focus-within), up to two levels up.
  const owners = [element, element.parentElement, element.parentElement?.parentElement];
  const outlined = owners.find((owner): owner is HTMLElement => {
    // A visually hidden input shows its focus on what wraps it.
    if (!owner || owner.getBoundingClientRect().width <= 1) return false;
    const own = getComputedStyle(owner);
    return own.outlineStyle !== 'none' && parseFloat(own.outlineWidth) >= 2;
  });
  const ring = getComputedStyle(element).boxShadow !== 'none';
  let contrast: number | null = null;
  if (outlined) {
    const behind = backgrounds.slice(0, backgrounds.length - owners.indexOf(outlined));
    const [l1, l2] = [
      luminance(paint([...behind, getComputedStyle(outlined).outlineColor])),
      luminance(paint(behind)),
    ].sort((a, b) => b - a);
    contrast = Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  }
  // An invisible outline (kept for Windows' high-contrast mode) leaves the ring to a shadow.
  const invisible = contrast === 1;
  if (invisible) contrast = null;
  const outline = !!outlined && !invisible;

  const box = element.getBoundingClientRect();
  const points = [
    [box.left + box.width / 2, box.top + box.height / 2],
    [box.left + 4, box.top + 4],
    [box.right - 4, box.top + 4],
    [box.left + 4, box.bottom - 4],
    [box.right - 4, box.bottom - 4],
  ];
  const visible = points.some(([x, y]) => {
    const top = document.elementFromPoint(x, y);
    return !!top && (element.contains(top) || top.contains(element));
  });

  const label = element.getAttribute('aria-label') ?? element.innerText ?? '';
  return {
    name: `${element.tagName.toLowerCase()} "${label.trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
    indicated: outline || ring,
    contrast,
    visible,
  };
}

test.describe('every screen works with the keyboard alone', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      // Tab through the page until focus comes back to where it started (2.1.1, 2.1.2).
      const stops: FocusStop[] = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        // Read the focus style as it settles, not halfway through a transition.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((animation) => animation instanceof CSSTransition)
              .map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
        const stop = await page.evaluate(describeFocus);
        if (!stop) continue;
        if (stops.some((seen) => seen.name === stop.name)) break;
        stops.push(stop);
      }

      expect(stops.length, 'something to reach with Tab').toBeGreaterThan(0);
      // 2.4.7: a focus indicator; 1.4.11: an outline at 3:1 against its surroundings;
      // 2.4.11: the focused element is not hidden behind anything.
      const problems = stops.flatMap((stop) => [
        ...(stop.indicated ? [] : [`${stop.name}: no focus indicator`]),
        ...(stop.contrast !== null && stop.contrast < 3
          ? [`${stop.name}: focus outline at ${stop.contrast}:1`]
          : []),
        ...(stop.visible ? [] : [`${stop.name}: hidden while focused`]),
      ]);
      expect(problems).toEqual([]);
    });
  }
});
