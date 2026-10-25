import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AskRequest,
  DetectedDependency,
  detectFromPackageJson,
  Framework,
  FRAMEWORK_IDS,
  FRAMEWORKS,
  IndexedVersion,
  isAngularJsVersion,
} from '@semver-sage/types';

/** The question box: question, optional scope (framework, version, compare, package.json), Ask. */
@Component({
  selector: 'app-ask-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './ask-form.html',
  styleUrl: './ask-form.scss',
})
export class AskForm {
  readonly indexed = input<IndexedVersion[]>([]);
  readonly busy = input(false);
  readonly ask = output<AskRequest>();
  readonly stop = output<void>();

  protected readonly question = signal('');
  protected readonly framework = signal<Framework | ''>('');
  protected readonly version = signal('');
  protected readonly compareVersion = signal('');
  protected readonly detected = signal<DetectedDependency[]>([]);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly frameworks = computed(() =>
    FRAMEWORK_IDS.map((id) => ({
      id,
      label: FRAMEWORKS[id].label,
      available: this.indexed().some((v) => v.framework === id),
    })),
  );

  protected readonly versions = computed(() =>
    this.indexed()
      .filter((v) => v.framework === this.framework())
      .map((v) => v.version),
  );

  protected label(framework: Framework): string {
    return FRAMEWORKS[framework].label;
  }

  /** A package.json's "angular" (1.x) dependency is AngularJS, not Angular. */
  protected dependencyLabel(dep: DetectedDependency): string {
    const name = dep.framework === 'angular' && isAngularJsVersion(dep.version) ? 'AngularJS' : this.label(dep.framework);
    return `${name} ${dep.version}`;
  }

  protected isIndexed(framework: Framework): boolean {
    return this.indexed().some((v) => v.framework === framework);
  }

  protected setFramework(framework: Framework | ''): void {
    this.framework.set(framework);
    this.version.set('');
    this.compareVersion.set('');
  }

  protected useDependency(dep: DetectedDependency): void {
    this.framework.set(dep.framework);
    this.version.set(dep.version);
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadError.set(null);
    try {
      const found = detectFromPackageJson(JSON.parse(await file.text()));
      this.detected.set(found);
      if (!found.length) this.uploadError.set('No supported frameworks found in that package.json.');
      const first = found.find((d) => this.isIndexed(d.framework));
      if (first) this.useDependency(first);
    } catch {
      this.uploadError.set("That doesn't look like a valid package.json.");
    } finally {
      (event.target as HTMLInputElement).value = '';
    }
  }

  protected submit(): void {
    const question = this.question().trim();
    if (!question || this.busy()) return;
    this.ask.emit({
      question,
      framework: this.framework() || undefined,
      version: (this.framework() && this.version().trim()) || undefined,
      compareVersion: (this.framework() && this.compareVersion().trim()) || undefined,
    });
    // The question is shown above the answer; the box is ready for a follow-up. The scope stays.
    this.question.set('');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }
}
