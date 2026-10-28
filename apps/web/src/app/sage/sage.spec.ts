import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SALUTE_DELAY_MS, SALUTE_MS, Sage, SageMood } from './sage';

describe('Sage', () => {
  let fixture: ComponentFixture<Sage>;
  let host: HTMLElement;

  let greeted = vi.fn<() => void>();

  /** Creates the sage (its wave timer starts now) with the given inputs. */
  function create(inputs: { mood?: SageMood; greet?: boolean } = {}) {
    fixture = TestBed.createComponent(Sage);
    fixture.componentRef.setInput('mood', inputs.mood ?? 'idle');
    fixture.componentRef.setInput('greet', inputs.greet ?? true);
    greeted = vi.fn<() => void>();
    fixture.componentInstance.greeted.subscribe(greeted);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const set = (name: 'mood' | 'greet', value: SageMood | boolean) => {
    fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  };

  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };

  const freeArm = () => [...host.querySelectorAll('.free-arm .sleeve')].map((p) => p.getAttribute('d'));
  const SALUTE_ARM = ['M90 150 Q74 148 64 134', 'M64 134 Q57 122 56 106'];
  const IDLE_ARM = ['M90 150 Q82 182 88 210'];

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('waving hello', () => {
    it('raises the free arm 2 s after it appears, lowers it for good, then lets the page speak', () => {
      create();
      advance(SALUTE_DELAY_MS - 1);
      expect(host.classList).not.toContain('saluting');
      expect(freeArm()).toEqual(IDLE_ARM);

      advance(1);
      expect(host.classList).toContain('saluting');
      expect(host.classList).toContain('idle');
      expect(freeArm()).toEqual(SALUTE_ARM);
      expect(host.querySelector('.free-arm .palm')).not.toBeNull();
      // Not before the wave is over.
      expect(greeted).not.toHaveBeenCalled();

      advance(SALUTE_MS);
      expect(host.classList).not.toContain('saluting');
      expect(freeArm()).toEqual(IDLE_ARM);
      expect(greeted).toHaveBeenCalledTimes(1);
      // Once only.
      advance(30_000);
      expect(host.classList).not.toContain('saluting');
      expect(greeted).toHaveBeenCalledTimes(1);
    });

    it('takes over the talking arm if the sage is already speaking', () => {
      create({ mood: 'talking' });
      advance(SALUTE_DELAY_MS);
      expect(freeArm()).toEqual(SALUTE_ARM);
      expect(host.classList).toContain('talking');
    });

    it('does not wave once a question was asked, and does not hold the page back', () => {
      create();
      advance(1000);
      set('greet', false);
      advance(SALUTE_DELAY_MS);
      expect(host.classList).not.toContain('saluting');
      expect(freeArm()).toEqual(IDLE_ARM);
      expect(greeted).toHaveBeenCalledTimes(1);
    });

    it('stops at once when a question is asked mid-wave', () => {
      create();
      advance(SALUTE_DELAY_MS + 500);
      expect(host.classList).toContain('saluting');

      set('greet', false);
      set('mood', 'reflecting');
      expect(host.classList).not.toContain('saluting');
      // The reflecting arm strokes the beard.
      expect(freeArm()).toEqual(['M90 150 Q76 170 84 188', 'M84 188 Q102 186 109 161']);
    });

    it('does not wave without greet', () => {
      create({ greet: false });
      advance(SALUTE_DELAY_MS + SALUTE_MS);
      expect(host.classList).not.toContain('saluting');
    });

    it('does not wave when the system asks for reduced motion, and lets the page speak at once', () => {
      const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
      vi.stubGlobal('matchMedia', matchMedia);
      create();
      advance(0);
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      expect(greeted).toHaveBeenCalledTimes(1);

      advance(SALUTE_DELAY_MS + 100);
      expect(host.classList).not.toContain('saluting');
      expect(freeArm()).toEqual(IDLE_ARM);
      expect(greeted).toHaveBeenCalledTimes(1);
    });

    it('cancels the pending wave when destroyed', () => {
      create();
      advance(1000);
      fixture.destroy();
      vi.advanceTimersByTime(SALUTE_DELAY_MS + SALUTE_MS);
      expect(fixture.componentInstance['armPose']()).toBe('idle');
      expect(greeted).not.toHaveBeenCalled();
    });
  });

  describe('reflecting', () => {
    it('opens glowing eyes instead of the usual ones, and levitates through its host class', () => {
      create({ mood: 'reflecting' });

      expect(host.classList).toContain('reflecting');
      expect(host.querySelectorAll('.eyes-glow ellipse')).toHaveLength(2);
      expect(host.querySelector('.eyes')).toBeNull();
      // The figure and its thoughts sit inside the groups the CSS lifts and floats.
      expect(host.querySelector('.lift .hover .figure')).not.toBeNull();
      expect(host.querySelector('.lift .hover .thoughts')).not.toBeNull();
      expect(host.getAttribute('aria-label')).toBe('The sage is reflecting');
    });

    it('never waves while reflecting', () => {
      create({ mood: 'reflecting' });
      advance(SALUTE_DELAY_MS);
      expect(host.classList).not.toContain('saluting');
    });
  });

  describe('starting to answer', () => {
    it('bursts with light from the crystal: glow, shockwave and twelve rays', () => {
      create({ mood: 'idle', greet: false });
      expect(host.querySelector('.burst')).toBeNull();

      set('mood', 'talking');
      const rays = [...host.querySelectorAll('.burst .rays path')].map((r) => r.getAttribute('transform'));
      expect(rays).toHaveLength(12);
      expect(rays[0]).toBe('rotate(0 180 44)');
      expect(rays[11]).toBe('rotate(330 180 44)');
      expect(host.querySelector('.burst .burst-glow')?.getAttribute('fill')).toBe('url(#sage-burst)');
      expect(host.querySelector('.burst .shockwave')).not.toBeNull();
      expect(host.querySelector('.spark .flash')).not.toBeNull();
      expect(host.querySelector('.eyes-glow')).toBeNull();
    });

    it('is gone once the sage is quiet again, so the next answer bursts anew', () => {
      create({ mood: 'talking', greet: false });
      set('mood', 'idle');
      expect(host.querySelector('.burst')).toBeNull();
      set('mood', 'talking');
      expect(host.querySelectorAll('.burst .rays path')).toHaveLength(12);
    });
  });
});
