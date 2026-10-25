import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FRAMEWORKS, IndexedVersion, isAngularJsVersion, versionToNum } from '@semver-sage/types';
import { AnswerCard } from './answer-card/answer-card';
import { AskForm } from './ask-form/ask-form';
import { CitationList } from './citation-list/citation-list';
import { Sage, SageMood } from './sage/sage';
import { SageStore } from './sage.store';

const GREETING =
  'Greetings, traveler. I am the **Semver Sage**. Most docs only remember the latest version; I remember ' +
  'them all. Ask how something works in *your* version, or hand me your `package.json` and I will ' +
  'answer for exactly what you have installed.';

const CAPTIONS: Record<SageMood, string> = {
  idle: 'Ready when you are',
  reflecting: 'Reflecting…',
  talking: 'Speaking',
  error: 'Something went wrong',
};

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sage, AnswerCard, AskForm, CitationList],
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

  protected readonly answerText = computed(() =>
    this.store.status() === 'idle' ? GREETING : this.store.answer(),
  );

  protected readonly mood = computed<SageMood>(() => {
    const status = this.store.status();
    if (status === 'thinking') return 'reflecting';
    if (this.typing() || status === 'speaking') return 'talking';
    return status === 'error' ? 'error' : 'idle';
  });

  protected readonly caption = computed(() => CAPTIONS[this.mood()]);

  protected readonly scopeLabel = computed(() => {
    const scope = this.store.scope();
    if (!scope) return null;
    if (!scope.framework) return 'Latest docs of every framework';
    if (scope.framework === 'angular' && isAngularJsVersion(scope.requestedVersion)) {
      return 'AngularJS is not Angular';
    }
    const name = FRAMEWORKS[scope.framework].label;
    const compare = this.store.compare();
    if (compare) return `Comparing ${name} ${scope.version} → ${compare.version}`;
    return scope.version ? `${name} ${scope.version} docs` : null;
  });

  /** "Angular 2–22", "Vue 2, 3": one entry per framework, as ranges. */
  protected readonly indexed = computed(() => {
    const byFramework = new Map<string, string[]>();
    for (const v of this.versions.value()) {
      byFramework.set(v.framework, [...(byFramework.get(v.framework) ?? []), v.version]);
    }
    return [...byFramework]
      .map(([framework, versions]) => {
        const sorted = versions.sort((a, b) => versionToNum(a) - versionToNum(b));
        const range = sorted.length > 2 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ');
        return { label: FRAMEWORKS[framework as keyof typeof FRAMEWORKS].label, range };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  });
}
