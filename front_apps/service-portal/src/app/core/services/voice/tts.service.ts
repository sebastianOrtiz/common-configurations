/**
 * Text-To-Speech Service
 *
 * Thin wrapper around the browser's SpeechSynthesis API.
 * Picks the most natural-sounding voice available for the requested
 * language AND preferred gender (Web Speech API does not expose gender
 * directly, so we infer it from known voice names).
 */

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

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
    this.synth?.cancel();
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
      if (!this.synth || !text) {
        resolve();
        return;
      }

      this.synth.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = language;
      utter.rate = 1;
      utter.pitch = 1;

      const chosen = this.pickBestVoice(language, gender);
      if (chosen) utter.voice = chosen;

      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      this.synth.speak(utter);
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

    // Gender-matched tiers (preferred)
    const genderTiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
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

    // Fall back ignoring gender if no gender match exists
    const fallbackTiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
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
