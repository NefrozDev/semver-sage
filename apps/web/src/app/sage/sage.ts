import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SageMood = 'idle' | 'thinking' | 'speaking' | 'error';

/** The animated sage: bobs while idle, channels his staff while thinking, nods while speaking. */
@Component({
  selector: 'app-sage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'mood()', role: 'img', '[attr.aria-label]': '"The sage is " + mood()' },
  template: `
    <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="orb" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#e9fffd" />
          <stop offset="45%" stop-color="#5ef2e0" />
          <stop offset="100%" stop-color="#1a8f9c" />
        </radialGradient>
        <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#5b3fa8" />
          <stop offset="100%" stop-color="#2c1c63" />
        </linearGradient>
      </defs>

      <ellipse class="shadow" cx="100" cy="250" rx="62" ry="7" />

      <g class="staff">
        <rect x="158" y="70" width="7" height="178" rx="3" fill="#7a4b2a" />
        <circle class="aura" cx="161.5" cy="58" r="22" />
        <circle class="orb" cx="161.5" cy="58" r="13" fill="url(#orb)" />
        <g class="runes">
          <circle cx="161.5" cy="24" r="2.5" />
          <circle cx="195" cy="58" r="2.5" />
          <circle cx="161.5" cy="92" r="2.5" />
          <circle cx="128" cy="58" r="2.5" />
        </g>
      </g>

      <g class="body">
        <path d="M58 248 L74 128 Q100 112 126 128 L142 248 Z" fill="url(#robe)" />
        <path d="M92 130 L100 248 L108 130 Z" fill="#f2c94c" opacity=".85" />
        <path class="arm" d="M122 140 Q150 150 158 150 L160 162 Q140 166 118 158 Z" fill="#4a3290" />
        <circle cx="160" cy="156" r="7" fill="#f0c9a0" />

        <g class="head">
          <circle cx="100" cy="104" r="26" fill="#f0c9a0" />
          <g class="eyes" fill="#2b2140">
            <ellipse cx="90" cy="100" rx="3" ry="3.6" />
            <ellipse cx="110" cy="100" rx="3" ry="3.6" />
          </g>
          <path d="M84 92 q6 -4 12 0 M104 92 q6 -4 12 0" stroke="#e8e8f0" stroke-width="3" fill="none" stroke-linecap="round" />
          <path class="beard" d="M76 108 Q78 150 100 172 Q122 150 124 108 Q112 118 100 116 Q88 118 76 108 Z" fill="#eef0f7" />
          <path class="mouth" d="M94 118 Q100 122 106 118" stroke="#9a8aa8" stroke-width="2" fill="none" stroke-linecap="round" />
          <path d="M60 86 Q100 72 140 86 Q100 96 60 86 Z" fill="#23175a" />
          <path d="M70 84 L104 6 Q110 2 112 10 L130 84 Z" fill="#3a2786" />
          <path d="M104 6 Q118 0 124 14 Q114 8 108 14 Z" fill="#3a2786" />
          <path class="star" d="M100 44 l3 7 7 .6 -5.4 4.6 1.8 7 -6.4-3.9 -6.4 3.9 1.8-7 -5.4-4.6 7-.6z" fill="#f2c94c" />
        </g>
      </g>

      <g class="sparkles" fill="#9ff6ec">
        <circle cx="40" cy="70" r="2.5" />
        <circle cx="60" cy="30" r="1.8" />
        <circle cx="140" cy="20" r="2" />
        <circle cx="30" cy="140" r="1.6" />
      </g>
    </svg>
  `,
  styleUrl: './sage.scss',
})
export class Sage {
  readonly mood = input<SageMood>('idle');
}
