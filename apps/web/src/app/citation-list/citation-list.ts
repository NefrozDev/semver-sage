import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Citation, FRAMEWORKS, Framework } from '@semver-sage/types';

/** Compact source cards, numbered like the [n] markers in the answer. */
@Component({
  selector: 'app-citation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ citations().length }} {{ citations().length === 1 ? 'source' : 'sources' }}</h2>
    <ol>
      @for (c of citations(); track c.n) {
        <li [id]="'source-' + c.n">
          <a [href]="c.url" target="_blank" rel="noopener" [title]="c.pageTitle + ' › ' + c.section">
            <span class="top">
              <span class="n">{{ c.n }}</span>
              <span class="badge version">{{ label(c.framework) }} {{ c.version }}</span>
              <span class="range" title="Versions this exact text appears in">
                @if (c.firstVersion === c.lastVersion) {
                  only {{ c.firstVersion }}
                } @else {
                  {{ c.firstVersion }}–{{ c.lastVersion }}
                }
              </span>
            </span>
            <span class="title">{{ c.section === c.pageTitle ? c.pageTitle : c.section }}</span>
            @if (c.section !== c.pageTitle) {
              <span class="page">{{ c.pageTitle }}</span>
            }
          </a>
        </li>
      }
    </ol>
  `,
  styleUrl: './citation-list.scss',
})
export class CitationList {
  readonly citations = input<Citation[]>([]);

  protected label(framework: Framework): string {
    return FRAMEWORKS[framework].label;
  }
}
