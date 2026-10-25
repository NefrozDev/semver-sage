import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

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
    // The greeting is being typed out, so the sage starts in his talking pose.
    expect(el.querySelector('app-sage')?.getAttribute('aria-label')).toBe('The sage is speaking');
    expect(el.querySelector('.indexed')?.textContent).toContain('Vue');
    expect(el.querySelector('.indexed .range')?.textContent).toBe('2, 3');
  });
});
