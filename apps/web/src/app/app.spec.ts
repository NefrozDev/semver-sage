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
    expect(el.querySelector('.nameplate')?.textContent).toContain('Sage');
    expect(el.querySelector('footer')?.textContent).toContain('Indexed: Vue 2, 3');
  });
});
