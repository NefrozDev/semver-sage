import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FRAMEWORKS, IndexedVersion } from '@semver-sage/types';
import { AskForm } from './ask-form/ask-form';
import { CitationList } from './citation-list/citation-list';
import { DialogBox } from './dialog-box/dialog-box';
import { Sage, SageMood } from './sage/sage';
import { SageStore } from './sage.store';

const GREETING =
  'Greetings, traveler. I am the **Semver Sage**. Most docs only remember the latest version, but my ' +
  'scrolls span them all. Ask how something works in *your* version, or hand me your `package.json` ' +
  'and I will answer for exactly what you have installed.';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sage, DialogBox, AskForm, CitationList],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(SageStore);
  protected readonly versions = httpResource<IndexedVersion[]>(() => '/api/versions', {
    defaultValue: [],
  });
  protected readonly typing = signal(false);

  protected readonly busy = computed(() => ['thinking', 'speaking'].includes(this.store.status()));

  protected readonly dialogText = computed(() =>
    this.store.status() === 'idle' ? GREETING : this.store.answer(),
  );

  protected readonly mood = computed<SageMood>(() => {
    const status = this.store.status();
    if (status === 'thinking') return 'thinking';
    if (this.typing() || status === 'speaking') return 'speaking';
    return status === 'error' ? 'error' : 'idle';
  });

  protected readonly scopeLabel = computed(() => {
    const scope = this.store.scope();
    if (!scope) return null;
    if (!scope.framework) return 'Searching the latest docs of every framework';
    const name = FRAMEWORKS[scope.framework].label;
    const compare = this.store.compare();
    if (compare) return `Comparing the ${name} ${scope.version} and ${compare.version} scrolls`;
    return scope.version ? `Reading the ${name} ${scope.version} scrolls` : `No ${name} scrolls yet`;
  });

  protected readonly indexedSummary = computed(() => {
    const byFramework = new Map<string, string[]>();
    for (const v of this.versions.value()) {
      const label = FRAMEWORKS[v.framework].label;
      byFramework.set(label, [...(byFramework.get(label) ?? []), v.version]);
    }
    return [...byFramework].map(([label, versions]) => `${label} ${versions.join(', ')}`).join(' · ');
  });
}
