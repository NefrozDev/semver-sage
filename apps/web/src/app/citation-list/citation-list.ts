import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Citation, FRAMEWORKS, Framework } from '@semver-sage/types';

@Component({
  selector: 'app-citation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Sources</h2>
    <ol>
      @for (c of citations(); track c.n) {
        <li [id]="'source-' + c.n">
          <span class="n">{{ c.n }}</span>
          <div class="info">
            <a [href]="c.url" target="_blank" rel="noopener">
              {{ c.pageTitle }}@if (c.section !== c.pageTitle) {<span class="section"> › {{ c.section }}</span>}
            </a>
            <div class="badges">
              <span class="badge version">{{ label(c.framework) }} {{ c.version }}</span>
              <span class="badge range" title="Versions this exact text appears in">
                @if (c.firstVersion === c.lastVersion) {
                  only in {{ c.firstVersion }}
                } @else {
                  same in {{ c.firstVersion }}–{{ c.lastVersion }}
                }
              </span>
            </div>
          </div>
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
