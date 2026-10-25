import { marked } from 'marked';

marked.use({ gfm: true, breaks: false });

/**
 * Renders answer markdown and turns "[2]" citation markers into links to the matching source card.
 * The result is bound with [innerHTML], which Angular sanitizes.
 */
export function renderAnswer(markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  return html.replace(
    /\[(\d{1,2})\](?![(:])/g,
    (_, n) => `<a class="cite" href="#source-${n}" title="Source ${n}">${n}</a>`,
  );
}
