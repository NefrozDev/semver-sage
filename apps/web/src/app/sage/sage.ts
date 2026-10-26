import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SageMood = 'idle' | 'reflecting' | 'talking' | 'error';

const LABELS: Record<SageMood, string> = {
  idle: 'The sage is waiting for your question',
  reflecting: 'The sage is reflecting',
  talking: 'The sage is speaking',
  error: 'The sage hit a problem',
};

/**
 * The sage, in three poses: idle (staff in hand, breathing, blinking, arms swaying), reflecting
 * (eyes closed, stroking his beard, thoughts orbiting) and talking (open-palm gesture, moving mouth,
 * staff raised, a spark on the crystal, the crystal rippling). "error" is the idle pose with a
 * worried brow and a dimmed crystal. Arms rotate at the shoulder and elbow so sleeves follow hands.
 */
@Component({
  selector: 'app-sage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'mood()', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    <svg viewBox="0 0 240 280" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sage-robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5b5bd6" />
          <stop offset="1" stop-color="#2b2870" />
        </linearGradient>
        <linearGradient id="sage-sleeve" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4c4bc4" />
          <stop offset="1" stop-color="#312e81" />
        </linearGradient>
        <linearGradient id="sage-hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3f3aa8" />
          <stop offset="1" stop-color="#1f1c55" />
        </linearGradient>
        <linearGradient id="sage-beard" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#cfd6e3" />
        </linearGradient>
        <linearGradient id="sage-wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#9a6a3c" />
          <stop offset="1" stop-color="#6b4423" />
        </linearGradient>
        <radialGradient id="sage-crystal" cx="40%" cy="35%" r="70%">
          <stop offset="0" stop-color="#f0fdff" />
          <stop offset="0.45" stop-color="#67e8f9" />
          <stop offset="1" stop-color="#0e7490" />
        </radialGradient>
      </defs>

      <circle class="halo" cx="120" cy="138" r="104" />
      <ellipse class="shadow" cx="120" cy="266" rx="74" ry="8" />

      <g class="figure">
        <!-- robe -->
        <path d="M88 140 C76 172 66 220 58 262 Q120 276 182 262 C174 220 164 172 152 140 Q120 128 88 140 Z" fill="url(#sage-robe)" />
        <path d="M114 150 L126 150 L129 270 L111 270 Z" fill="#f2c94c" opacity="0.85" />
        <path d="M58 255 Q120 269 182 255 L182 262 Q120 276 58 262 Z" fill="#f2c94c" opacity="0.85" />

        <g class="head">
          <!-- hood and face -->
          <path d="M120 40 C153 43 170 70 170 104 C170 132 157 150 146 157 L94 157 C83 150 70 132 70 104 C70 70 87 43 120 40 Z" fill="url(#sage-hood)" />
          <ellipse cx="120" cy="103" rx="28" ry="31" fill="#15123a" />
          <ellipse cx="120" cy="101" rx="23" ry="26" fill="#f3d5bd" />
          <circle cx="106" cy="110" r="4.5" fill="#f4a7a0" opacity="0.35" />
          <circle cx="134" cy="110" r="4.5" fill="#f4a7a0" opacity="0.35" />
          <path d="M118 103 Q120 109 122 103" stroke="#d9a888" stroke-width="2" fill="none" stroke-linecap="round" />

          <g class="brows">
            <path d="M103 90 Q110 86 116 89" />
            <path d="M124 89 Q130 86 137 90" />
          </g>

          @switch (pose()) {
            @case ('reflecting') {
              <g class="eyes-closed">
                <path d="M106 99 Q111 103 116 99" />
                <path d="M124 99 Q129 103 134 99" />
              </g>
            }
            @default {
              <g class="eyes">
                <ellipse cx="111" cy="99" rx="2.7" ry="3.4" />
                <ellipse cx="129" cy="99" rx="2.7" ry="3.4" />
                <circle cx="112" cy="97.8" r="0.9" fill="#fff" />
                <circle cx="130" cy="97.8" r="0.9" fill="#fff" />
              </g>
            }
          }

          <!-- beard -->
          <path d="M97 107 C96 132 104 160 120 188 C136 160 144 132 143 107 C136 117 128 121 120 121 C112 121 104 117 97 107 Z" fill="url(#sage-beard)" />
          <path d="M110 132 Q113 150 118 166 M130 132 Q127 150 122 166" stroke="#c4ccda" stroke-width="1.4" fill="none" opacity="0.8" />
          @if (pose() === 'talking') {
            <ellipse class="mouth" cx="120" cy="124" rx="4.5" ry="3" fill="#6b2a1a" />
          }
          <path d="M105 117 C109 111 116 112 120 116 C124 112 131 111 135 117 C130 120 125 120 120 118 C115 120 110 120 105 117 Z" fill="#e8edf4" />
        </g>

        <!-- staff arm: staff, sleeve and hand pivot together at the shoulder -->
        <g class="staff-arm">
          <g class="staff">
            <rect x="176" y="66" width="8" height="198" rx="4" fill="url(#sage-wood)" />
            <circle class="glow" cx="180" cy="48" r="24" />
            @if (pose() === 'talking') {
              <circle class="ripple" cx="180" cy="48" r="16" />
              <circle class="ripple late" cx="180" cy="48" r="16" />
            }
            <path class="crystal" d="M180 26 L191 46 L180 68 L169 46 Z" fill="url(#sage-crystal)" />
            <path d="M180 26 L180 68 M169 46 L191 46" stroke="#ffffff" stroke-width="0.8" opacity="0.5" />
            <!-- created when the answer starts, so the flash plays once and the star keeps twinkling -->
            @if (pose() === 'talking') {
              <g class="spark">
                <circle class="flash" cx="180" cy="40" r="14" />
                <circle class="mote" cx="180" cy="24" r="1.6" style="--dx: -9px" />
                <circle class="mote" cx="180" cy="24" r="1.2" style="--dx: 8px" />
                <circle class="mote" cx="180" cy="24" r="1.4" style="--dx: 2px" />
                <path class="star" d="M180 14 Q181.6 24.4 192 26 Q181.6 27.6 180 38 Q178.4 27.6 168 26 Q178.4 24.4 180 14 Z" />
              </g>
            }
          </g>
          @if (pose() === 'reflecting') {
            <path class="sleeve" d="M150 150 Q164 168 177 186" />
            <circle class="hand" cx="180" cy="188" r="7" />
          } @else {
            <path class="sleeve" d="M150 150 Q166 160 177 172" />
            <circle class="hand" cx="180" cy="174" r="7" />
          }
        </g>

        <!-- free arm: upper arm pivots at the shoulder, forearm and hand at the elbow -->
        <g class="free-arm">
          @switch (pose()) {
            @case ('reflecting') {
              <path class="sleeve" d="M90 150 Q76 170 84 188" />
              <g class="forearm">
                <path class="sleeve" d="M84 188 Q102 186 109 161" />
                <circle class="hand" cx="110" cy="156" r="7.5" />
              </g>
            }
            @case ('talking') {
              <path class="sleeve" d="M90 150 Q76 162 66 168" />
              <g class="forearm">
                <path class="sleeve" d="M66 168 Q54 164 49 153" />
                <g class="hand palm">
                  <ellipse cx="41" cy="146" rx="10" ry="6.5" transform="rotate(-40 41 146)" />
                  <circle cx="49" cy="140" r="3" />
                </g>
              </g>
            }
            @default {
              <path class="sleeve" d="M90 150 Q82 182 88 210" />
              <circle class="hand" cx="89" cy="214" r="7" />
            }
          }
        </g>
      </g>

      @if (pose() === 'reflecting') {
        <g class="thoughts">
          <circle cx="120" cy="14" r="3.5" />
          <circle cx="152" cy="30" r="2.5" />
          <circle cx="88" cy="30" r="2.5" />
          <path d="M120 2 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6 Z" />
        </g>
      }
    </svg>
  `,
  styleUrl: './sage.scss',
})
export class Sage {
  readonly mood = input<SageMood>('idle');

  /** Error reuses the idle pose; CSS adds the worried brow. */
  protected readonly pose = computed(() => (this.mood() === 'error' ? 'idle' : this.mood()));
  protected readonly label = computed(() => LABELS[this.mood()]);
}
