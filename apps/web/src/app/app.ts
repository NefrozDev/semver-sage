import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AskRequest, FRAMEWORKS, IndexedVersion, isAngularJsVersion, versionToNum } from '@semver-sage/types';
import { AnswerCard } from './answer-card/answer-card';
import { AskForm } from './ask-form/ask-form';
import { CitationList } from './citation-list/citation-list';
import { Sage, SageMood } from './sage/sage';
import { SageStore } from './sage.store';

const GREETING =
  'Greetings, traveler. I am the **Semver Sage**. Most docs only remember the latest version; I remember ' +
  'them all. Ask how something works in *your* version, or hand me your `package.json` and I will ' +
  'answer for exactly what you have installed.';

const EXAMPLES = [
  'How do I register a global filter in Vue 2?',
  'What changed in v-model between Vue 2 and 3?',
  'Since when does Node have a built-in fetch?',
  'How do runes work in Svelte 5?',
  'What does useActionState do in React 19?',
  'How did components work in Angular 2?',
];

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
  /** Indexed versions, or none while loading or if the API is down (value() throws on error). */
  protected readonly indexedVersions = computed(() => (this.versions.hasValue() ? this.versions.value() : []));
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
  protected readonly examples = EXAMPLES;

  /** "Answered by ollama/llama3.2:3b in 31 s" once an answer is complete. */
  protected readonly answerMeta = computed(() => {
    const model = this.store.model();
    const ms = this.store.elapsedMs();
    if (!model || model === 'none' || ms === null) return null;
    return `Answered by ${model} in ${Math.max(1, Math.round(ms / 1000))} s`;
  });

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
    const history = this.store.history();
    if (history) return `${name} ${history.oldest}–${scope.version} history`;
    return scope.version ? `${name} ${scope.version} docs` : null;
  });

  /** "Since when?" mode: what the search found, shown next to the scope. */
  protected readonly historyNote = computed(() => {
    const history = this.store.history();
    const framework = this.store.scope()?.framework;
    if (!history || !framework) return null;
    const name = FRAMEWORKS[framework].label;
    if (!history.earliest) return `No clear mention in the ${name} docs.`;
    return history.earliest === history.oldest
      ? `Already in the oldest indexed docs (${name} ${history.oldest}).`
      : `First found in the ${name} ${history.earliest} docs.`;
  });

  /** A new question replaces the previous answer, which starts at the top of the page. */
  protected ask(request: AskRequest): void {
    void this.store.ask(request);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** "Angular 2–22", "Vue 2, 3": one entry per framework, as ranges. */
  protected readonly indexed = computed(() => {
    const byFramework = new Map<string, string[]>();
    for (const v of this.indexedVersions()) {
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
