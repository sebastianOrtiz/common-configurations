/**
 * Voice Diagnostics Service
 *
 * Captures what the voice assistant hears, how it interprets it, what it
 * executes, whether it really navigates, and what it says. Events are:
 *
 * - ALWAYS kept in an in-memory ring buffer (last `BUFFER_SIZE`) so the user
 *   can export them as JSON from the bubble.
 * - Sent to the backend (`log_events`) in micro-batches ONLY when the public
 *   setting `voice_diagnostics_enabled` is true. Sending is best-effort: it
 *   can never throw nor interrupt the assistant flow.
 */

import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FrappeApiService } from '../frappe-api.service';
import { SettingsService } from '../settings.service';
import { StateService } from '../state.service';

export type VoiceEventType =
  | 'command_heard'
  | 'interpret'
  | 'action_dispatched'
  | 'navigation'
  | 'tts'
  | 'no_match'
  | 'error'
  | 'other';

export type VoiceInterpretSource = 'rule' | 'ai' | 'none';

export type VoiceEventOutcome =
  | 'dispatched'
  | 'no_match'
  | 'redirect_intended'
  | 'redirect_done'
  | 'navigated'
  | 'error'
  | 'spoken';

export interface VoiceDiagnosticEvent {
  event_type: VoiceEventType;
  route?: string;
  transcript?: string;
  interpreted_action?: string;
  interpret_source?: VoiceInterpretSource;
  outcome?: VoiceEventOutcome;
  tts_text?: string;
  details?: Record<string, unknown>;
  ts?: string;
}

const LOG_EVENTS_API = 'common_configurations.api.diagnostics.log_events';
const BUFFER_SIZE = 300;
const FLUSH_DEBOUNCE_MS = 2000;
const FLUSH_BATCH_SIZE = 20;
/** Cap on the unsent queue so a dead backend can't grow memory unbounded. */
const MAX_PENDING = 200;

@Injectable({ providedIn: 'root' })
export class VoiceDiagnosticsService {
  private router = inject(Router);
  private frappeApi = inject(FrappeApiService);
  private settingsService = inject(SettingsService);
  private stateService = inject(StateService);

  /** One id per page load (a full reload starts a new session). */
  readonly sessionId: string = this.generateSessionId();

  private buffer: VoiceDiagnosticEvent[] = [];
  private pending: VoiceDiagnosticEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Record an event. Never throws. */
  record(event: VoiceDiagnosticEvent): void {
    try {
      const full: VoiceDiagnosticEvent = {
        ...event,
        route: event.route ?? this.currentRoute(),
        ts: event.ts ?? new Date().toISOString(),
      };

      this.buffer.push(full);
      if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();

      if (this.settingsService.settings().voice_assistant.diagnostics_enabled) {
        this.pending.push(full);
        if (this.pending.length > MAX_PENDING) this.pending.shift();
        if (this.pending.length >= FLUSH_BATCH_SIZE) {
          void this.flush();
        } else {
          this.scheduleFlush();
        }
      }
    } catch {
      /* diagnostics must never break the assistant */
    }
  }

  /** Convenience for errors. */
  recordError(source: string, err: unknown, extra?: Record<string, unknown>): void {
    const message = err instanceof Error ? err.message : String(err ?? '');
    this.record({
      event_type: 'error',
      outcome: 'error',
      details: { source, message, ...(extra || {}) },
    });
  }

  /** Download the current buffer as a JSON file. */
  exportJson(): void {
    try {
      const payload = {
        session_id: this.sessionId,
        portal: this.portalName(),
        exported_at: new Date().toISOString(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        events: this.buffer,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostico-asistente-${this.sessionId.slice(0, 8)}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('[VoiceDiagnostics] export failed:', err);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.pending.length) return;
    const batch = this.pending.splice(0, this.pending.length);
    try {
      await new Promise<void>((resolve) => {
        this.frappeApi
          .callMethod(LOG_EVENTS_API, {
            events: JSON.stringify(batch),
            portal: this.portalName(),
            session_id: this.sessionId,
            honeypot: '',
          })
          .subscribe({ next: () => resolve(), error: () => resolve() });
      });
    } catch {
      /* best-effort: drop the batch */
    }
  }

  private currentRoute(): string {
    try {
      return this.router.url;
    } catch {
      return '';
    }
  }

  private portalName(): string {
    return this.stateService.selectedPortal()?.portal_name || '';
  }

  private generateSessionId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
  }
}
