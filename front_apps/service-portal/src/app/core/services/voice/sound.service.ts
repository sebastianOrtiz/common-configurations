/**
 * Sound Service
 *
 * Generates short beep tones via the Web Audio API. Used by the voice
 * assistant to give audio feedback when listening starts/ends.
 *
 * No external assets required.
 */

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  /**
   * Play a short beep. Default = a "listening starts" tone (higher).
   * @param freq frequency in Hz (default 880, A5)
   * @param durationMs duration in milliseconds (default 120)
   * @param volume 0–1 (default 0.08, gentle)
   */
  beep(freq: number = 880, durationMs: number = 120, volume: number = 0.08): void {
    const ctx = this.getCtx();
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      gain.gain.value = 0;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const dur = durationMs / 1000;
      // Quick fade in/out to avoid clicks
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.linearRampToValueAtTime(volume, now + dur - 0.02);
      gain.gain.linearRampToValueAtTime(0, now + dur);

      oscillator.start(now);
      oscillator.stop(now + dur);
    } catch {
      // Silent fail — audio is non-critical
    }
  }

  /** Plays the "listening starts" tone (higher pitch) */
  beepStart(): void {
    this.beep(880, 100, 0.07);
  }

  /** Plays the "listening ends" tone (lower pitch) */
  beepEnd(): void {
    this.beep(660, 80, 0.06);
  }
}
