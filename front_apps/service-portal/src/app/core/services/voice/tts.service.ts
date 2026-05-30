/**
 * Text-To-Speech Service
 *
 * Thin wrapper around the browser's SpeechSynthesis API.
 * Picks the most natural-sounding voice available for the requested language.
 */

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  constructor() {
    // Some browsers (Chrome) load voices asynchronously. Trigger a load.
    if (this.synth) {
      // First call may return empty; the voiceschanged event populates the list.
      this.synth.getVoices();
      this.synth.onvoiceschanged = () => this.synth?.getVoices();
    }
  }

  isSupported(): boolean {
    return !!this.synth;
  }

  /** Cancels any ongoing speech */
  cancel(): void {
    this.synth?.cancel();
  }

  /**
   * Speak a text. Returns a promise that resolves when speech ends or fails.
   */
  speak(text: string, language: string = 'es-ES'): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth || !text) {
        resolve();
        return;
      }

      // Cancel any previous speech to avoid overlapping
      this.synth.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = language;
      utter.rate = 1;
      utter.pitch = 1;

      const chosen = this.pickBestVoice(language);
      if (chosen) utter.voice = chosen;

      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      this.synth.speak(utter);
    });
  }

  /**
   * Pick the most natural-sounding voice available.
   * Priority: Google network voices (most natural) > Microsoft natural/online > others.
   */
  private pickBestVoice(language: string): SpeechSynthesisVoice | null {
    if (!this.synth) return null;
    const voices = this.synth.getVoices();
    if (!voices || !voices.length) return null;

    const baseLang = language.split('-')[0];
    const matchLang = (v: SpeechSynthesisVoice) => v.lang === language;
    const matchBase = (v: SpeechSynthesisVoice) => v.lang.startsWith(baseLang);

    const isGoogle = (v: SpeechSynthesisVoice) => /google/i.test(v.name);
    const isMicrosoftNatural = (v: SpeechSynthesisVoice) =>
      /microsoft/i.test(v.name) && /natural|neural|online/i.test(v.name);
    const isNatural = (v: SpeechSynthesisVoice) =>
      /natural|neural|premium|enhanced|wavenet|online/i.test(v.name);

    // Priority list (first match wins)
    const tiers: Array<(v: SpeechSynthesisVoice) => boolean> = [
      (v) => matchLang(v) && isGoogle(v),               // Google exact lang
      (v) => matchBase(v) && isGoogle(v),               // Google same family
      (v) => matchLang(v) && isMicrosoftNatural(v),     // MS Natural exact
      (v) => matchBase(v) && isMicrosoftNatural(v),     // MS Natural family
      (v) => matchLang(v) && isNatural(v),              // Any natural exact
      (v) => matchBase(v) && isNatural(v),              // Any natural family
      (v) => matchLang(v),                              // Any exact lang
      (v) => matchBase(v),                              // Any same family
    ];

    for (const test of tiers) {
      const found = voices.find(test);
      if (found) return found;
    }

    return null;
  }
}
