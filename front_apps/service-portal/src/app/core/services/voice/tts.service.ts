/**
 * Text-To-Speech Service
 *
 * Thin wrapper around the browser's SpeechSynthesis API.
 * Picks the most natural-sounding voice available for the requested
 * language AND preferred gender (Web Speech API does not expose gender
 * directly, so we infer it from known voice names).
 */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  /**
   * How many consecutive utterances failed to actually START speaking. The
   * browser/OS speech engine can wedge (no audio at all until the OS/browser
   * is restarted — not fixable from JS). We can't prevent that, but we detect
   * it so the UI can degrade gracefully (rely on the on-screen text) instead
   * of stalling in silence.
   */
  private noStartStreak = 0;

  /** True once TTS looks wedged (2+ utterances never started). The UI can show a hint. */
  readonly degraded = signal<boolean>(false);

  constructor() {
    if (this.synth) {
      this.synth.getVoices();
      this.synth.onvoiceschanged = () => this.synth?.getVoices();
    }
  }

  isSupported(): boolean {
    return !!this.synth;
  }

  cancel(): void {
    if (!this.synth) return;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    // Some Chrome builds leave the engine stuck "paused" after a cancel(),
    // which silently mutes every later utterance. A resume() right after keeps
    // it healthy.
    try {
      this.synth.resume();
    } catch {
      /* ignore */
    }
  }

  /**
   * Speak a text. Returns a promise that resolves when speech ends or fails.
   *
   * @param text text to synthesize
   * @param language BCP-47 language tag
   * @param gender preferred voice gender; falls back if no match
   */
  speak(
    text: string,
    language: string = 'es-ES',
    gender: 'female' | 'male' = 'female'
  ): Promise<void> {
    return new Promise((resolve) => {
      const synth = this.synth;
      if (!synth || !text) {
        resolve();
        return;
      }

      // Resolve exactly once. SpeechSynthesis is flaky: `onend` sometimes never
      // fires, which would otherwise hang any `await speak(...)` forever and
      // freeze a guided voice flow. A duration-based safety timeout guarantees
      // the promise always settles.
      let settled = false;
      let noStartWatch: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (noStartWatch) clearTimeout(noStartWatch);
        resolve();
      };
      // ~120ms per char, clamped to a sane [4s, 20s] window.
      const maxMs = Math.min(20000, Math.max(4000, text.length * 120));
      const timer = setTimeout(finish, maxMs);

      const startSpeaking = () => {
        if (settled) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = language;
        utter.rate = 1;
        utter.pitch = 1;
        utter.volume = 1;

        const chosen = this.pickBestVoice(language, gender);
        if (chosen) utter.voice = chosen;

        utter.onstart = () => {
          // Real audio started: engine is healthy again.
          this.noStartStreak = 0;
          this.degraded.set(false);
          if (noStartWatch) clearTimeout(noStartWatch);
        };
        utter.onend = () => finish();
        utter.onerror = () => finish();

        // Watchdog: if speech never actually STARTS within ~1s, the engine is
        // wedged — don't stall the flow in silence, resolve and let the visible
        // card carry the guidance. Track the streak so the UI can warn.
        noStartWatch = setTimeout(() => {
          if (settled) return;
          this.noStartStreak += 1;
          if (this.noStartStreak >= 2) this.degraded.set(true);
          finish();
        }, 1500);

        synth.speak(utter);

        // Chrome/macOS: the engine can start "paused" (no audio). A single
        // resume() right after speak() nudges it awake. We deliberately do NOT
        // keep pausing/resuming on an interval — that churn is itself a known
        // way to wedge the engine.
        try {
          synth.resume();
        } catch {
          /* not all engines implement resume */
        }
      };

      // Key macOS/Chrome fix: calling `cancel()` and then `speak()` in the SAME
      // tick makes the new utterance cancel itself — `onend` fires instantly and
      // NO audio plays. So only cancel when something is actually speaking, and
      // give the engine a short beat to settle before the new utterance. When
      // nothing is speaking (the common case, incl. the first line), speak
      // synchronously so it stays inside the user-gesture that unlocks audio.
      if (synth.speaking || synth.pending) {
        synth.cancel();
        setTimeout(startSpeaking, 150);
      } else {
        startSpeaking();
      }
    });
  }

  /**
   * Known voice name → gender heuristic. Web Speech API does NOT expose
   * gender, so we infer it from the voice name (covers Microsoft, macOS,
   * Google and common Spanish/English TTS voices).
   */
  private readonly FEMALE_NAMES = [
    'helena', 'sabina', 'dalia', 'paloma', 'esperanza',
    'monica', 'mónica', 'paulina', 'marisol', 'soledad', 'rebeca',
    'lucia', 'lucía', 'isabel', 'andrea', 'ximena', 'fernanda', 'gabriela',
    'carolina', 'valentina', 'camila', 'sofia', 'sofía', 'elena', 'laura',
    'marina', 'conchita', 'nora', 'alba', 'sara',
    'samantha', 'victoria', 'karen', 'allison', 'ava', 'susan', 'zira',
    'cortana', 'salli', 'kimberly', 'kendra', 'joanna',
  ];

  private readonly MALE_NAMES = [
    'pablo', 'jorge', 'raul', 'raúl',
    'diego', 'juan', 'carlos', 'alvaro', 'álvaro',
    'miguel', 'andres', 'andrés', 'manuel', 'antonio', 'david', 'javier',
    'alberto', 'alejandro', 'ignacio', 'alonso', 'sebastian', 'sebastián',
    'tomas', 'tomás', 'mateo', 'fernando',
    'daniel', 'tom', 'fred', 'alex', 'mark', 'james',
    'justin', 'matthew', 'paul',
  ];

  private detectGender(voice: SpeechSynthesisVoice): 'female' | 'male' | 'unknown' {
    const name = voice.name.toLowerCase();
    if (/\b(female|woman|mujer|femenina|femenino)\b/.test(name)) return 'female';
    if (/\b(male|man|hombre|masculina|masculino)\b/.test(name)) return 'male';

    for (const f of this.FEMALE_NAMES) {
      if (name.includes(f)) return 'female';
    }
    for (const m of this.MALE_NAMES) {
      if (name.includes(m)) return 'male';
    }
    return 'unknown';
  }

  /**
   * Pick the most natural-sounding voice that matches language + gender.
   * Priority within each tier: gender-matched > unknown gender > other.
   * Quality order: Google > Microsoft Natural/Online > any natural > any.
   */
  private pickBestVoice(
    language: string,
    gender: 'female' | 'male' = 'female'
  ): SpeechSynthesisVoice | null {
    if (!this.synth) return null;
    const voices = this.synth.getVoices();
    if (!voices || !voices.length) return null;

    const baseLang = language.split('-')[0];
    const matchLang = (v: SpeechSynthesisVoice) => v.lang === language;
    const matchBase = (v: SpeechSynthesisVoice) => v.lang.startsWith(baseLang);
    const matchGender = (v: SpeechSynthesisVoice) => this.detectGender(v) === gender;

    const isGoogle = (v: SpeechSynthesisVoice) => /google/i.test(v.name);
    const isMicrosoftNatural = (v: SpeechSynthesisVoice) =>
      /microsoft/i.test(v.name) && /natural|neural|online/i.test(v.name);
    const isNatural = (v: SpeechSynthesisVoice) =>
      /natural|neural|premium|enhanced|wavenet|online/i.test(v.name);

    // Gender-matched tiers (preferred). Local (offline) voices go first: they
    // play reliably, whereas network voices (Google/online) sometimes fail
    // SILENTLY — no audio and no error — which reads as "the assistant went mute".
    const genderTiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
      (v) => matchLang(v) && matchGender(v) && v.localService,
      (v) => matchBase(v) && matchGender(v) && v.localService,
      (v) => matchLang(v) && matchGender(v) && isGoogle(v),
      (v) => matchBase(v) && matchGender(v) && isGoogle(v),
      (v) => matchLang(v) && matchGender(v) && isMicrosoftNatural(v),
      (v) => matchBase(v) && matchGender(v) && isMicrosoftNatural(v),
      (v) => matchLang(v) && matchGender(v) && isNatural(v),
      (v) => matchBase(v) && matchGender(v) && isNatural(v),
      (v) => matchLang(v) && matchGender(v),
      (v) => matchBase(v) && matchGender(v),
    ];

    for (const test of genderTiers) {
      const found = voices.find(test);
      if (found) return found;
    }

    // Fall back ignoring gender if no gender match exists (local first, again).
    const fallbackTiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
      (v) => matchLang(v) && v.localService,
      (v) => matchBase(v) && v.localService,
      (v) => matchLang(v) && isGoogle(v),
      (v) => matchBase(v) && isGoogle(v),
      (v) => matchLang(v) && isMicrosoftNatural(v),
      (v) => matchBase(v) && isMicrosoftNatural(v),
      (v) => matchLang(v) && isNatural(v),
      (v) => matchBase(v) && isNatural(v),
      (v) => matchLang(v),
      (v) => matchBase(v),
    ];

    for (const test of fallbackTiers) {
      const found = voices.find(test);
      if (found) return found;
    }

    return null;
  }
}
