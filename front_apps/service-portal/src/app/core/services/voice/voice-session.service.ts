/**
 * Voice Session Service
 *
 * Tracks the "continuous guided voice mode". The user activates it ONCE with a
 * click on the bubble (that gesture unlocks audio + microphone); from then on
 * the assistant re-activates itself on every SPA navigation until the user
 * says "parar" or closes the assistant on purpose.
 *
 * - `guidedActive` is persisted in `sessionStorage`: it survives SPA
 *   navigation and full reloads of the tab, and is lost when the tab closes.
 * - `audioUnlocked` is in-memory ONLY: a full page reload resets it, which is
 *   exactly how we tell "SPA navigation" (mic allowed) from "reload" (the
 *   browser blocks the mic until a new gesture).
 */

import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'sp_voice_guided_active';

@Injectable({ providedIn: 'root' })
export class VoiceSessionService {
  private _guidedActive = signal<boolean>(this.readStored());
  private _audioUnlocked = signal<boolean>(false);

  readonly guidedActive = this._guidedActive.asReadonly();
  readonly audioUnlocked = this._audioUnlocked.asReadonly();

  /** Guided mode is on but this page load has had no gesture yet (after a reload): "tap to continue". */
  readonly needsResume = computed(() => this._guidedActive() && !this._audioUnlocked());

  /** Guided mode is on AND audio is unlocked: safe to auto-start on navigation. */
  readonly canAutoStart = computed(() => this._guidedActive() && this._audioUnlocked());

  /** Turn guided mode on. Call from a user gesture (it also marks audio unlocked). */
  activate(): void {
    this._guidedActive.set(true);
    this._audioUnlocked.set(true);
    this.persist(true);
  }

  /** Mark audio as unlocked (a user gesture happened in this page load). */
  markAudioUnlocked(): void {
    this._audioUnlocked.set(true);
  }

  /** Turn guided mode off ("parar", closing on purpose, idle logout). */
  stop(): void {
    this._guidedActive.set(false);
    this.persist(false);
  }

  /** True when the utterance is an explicit "stop the assistant" command. */
  isStopPhrase(normalized: string): boolean {
    normalized = (normalized || '').replace(/[.,;:!¡¿?]/g, '').trim();
    return /^(parar|parar asistente|detente|detener|deten|para el asistente|desactivar asistente|desactivar el asistente)$|\b(parar el asistente|detener el asistente)\b/.test(normalized);
  }

  private readStored(): boolean {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private persist(active: boolean): void {
    try {
      if (active) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sessionStorage unavailable — in-memory only */
    }
  }
}
