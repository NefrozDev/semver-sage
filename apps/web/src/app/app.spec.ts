import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { App } from './app';
import { Sage } from './sage/sage';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('greets the user and lists indexed versions', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/versions')
      .flush([
        { framework: 'vue', version: '2', docsBaseUrl: '', chunkCount: 1, ingestedAt: '' },
        { framework: 'vue', version: '3', docsBaseUrl: '', chunkCount: 1, ingestedAt: '' },
      ]);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Semver Sage');
    expect(el.querySelector('app-answer-card .speaker')?.textContent).toContain('Sage');
    expect(el.querySelector('.indexed')?.textContent).toContain('Vue');
    expect(el.querySelector('.indexed .range')?.textContent).toBe('2, 3');

    // The sage waves hello first: no greeting yet, and he isn't speaking.
    const sage = el.querySelector('app-sage');
    expect(sage?.getAttribute('aria-label')).toBe('The sage is waiting for your question');
    expect(el.querySelector('app-answer-card .answer')?.textContent?.trim()).toBe('');

    // Once his wave is over, the greeting is typed out and he speaks.
    fixture.debugElement.query(By.directive(Sage)).componentInstance.greeted.emit();
    await fixture.whenStable();
    expect(sage?.getAttribute('aria-label')).toBe('The sage is speaking');
  });
});
