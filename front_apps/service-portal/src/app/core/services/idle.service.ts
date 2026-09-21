/**
 * Idle Service
 *
 * Logs out (ends the session, see `SessionService.endSession`) an
 * authenticated, non-anonymous User Contact after N minutes of inactivity.
 * The token itself lives 30 days in localStorage — nothing else caps it by
 * inactivity, which this service exists to do.
 *
 * - Global activity listeners (click/keydown/pointerdown/mousemove/scroll/
 *   touchstart/visibilitychange) are attached ONCE, OUTSIDE Angular's zone
 *   (`NgZone.runOutsideAngular`) so a `mousemove` doesn't trigger change
 *   detection on every pixel — only the eventual timeout/logout does. The
 *   reset itself is throttled (~1s) so a burst of events doesn't restart the
 *   timer needlessly often.
 * - Only ARMED while `StateService.isUserContactAuthenticated()` is true AND
 *   the user isn't the anonymous/guest contact — anonymous/guest browsing
 *   never times out.
 * - Timeout: `StateService.selectedPortal()?.idle_timeout_minutes` when > 0,
 *   otherwise `DEFAULT_IDLE_TIMEOUT_MINUTES`.
 * - Voice flows don't generate pointer/keyboard events, so `notifyActivity()`
 *   is exposed for `SttService`/the voice assistant to call while the
 *   citizen is speaking.
 * - Multi-tab: every reset stamps `localStorage[sp_last_activity]`; a
 *   `storage` event from another tab resets this tab's timer too, so
 *   activity in one tab keeps every open tab of the same session alive.
 *
 * Started once from the root component (`App.ngOnInit`).
 */

import { Injectable, NgZone, inject } from '@angular/core';
import { StateService } from './state.service';
import { SessionService } from './session.service';

/** localStorage key used to sync activity across tabs. */
const LAST_ACTIVITY_KEY = 'sp_last_activity';
/** Fallback timeout when the portal doesn't configure `idle_timeout_minutes`. */
const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
/** Minimum time between timer resets — activity fires very frequently (mousemove). */
const ACTIVITY_THROTTLE_MS = 1000;
/** How often the periodic safety check re-evaluates armed/disarmed state. */
const ARM_CHECK_INTERVAL_MS = 5000;
/** DOM events counted as "activity". */
const ACTIVITY_EVENTS: readonly string[] = [
  'click',
  'keydown',
  'pointerdown',
  'mousemove',
  'scroll',
  'touchstart',
];

@Injectable({ providedIn: 'root' })
export class IdleService {
  private zone = inject(NgZone);
  private state = inject(StateService);
  private session = inject(SessionService);

  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastResetAt = 0;
  private started = false;

  /**
   * Wire up the global listeners. Idempotent — safe to call more than once
   * (only the first call attaches anything).
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.zone.runOutsideAngular(() => {
      const onActivity = () => this.handleActivity();
      for (const evt of ACTIVITY_EVENTS) {
        document.addEventListener(evt, onActivity, { passive: true });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.handleActivity();
      });
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === LAST_ACTIVITY_KEY) this.handleActivity();
      });

      // Safety net: re-evaluate armed/disarmed state even without a fresh
      // DOM event — e.g. right after login there's no guaranteed activity
      // event before the timer should start counting.
      setInterval(() => this.ensureArmedState(), ARM_CHECK_INTERVAL_MS);
    });
  }

  /**
   * Public: let voice flows (STT listening/partial results) count as
   * activity even though they involve no pointer/keyboard interaction.
   */
  notifyActivity(): void {
    this.handleActivity();
  }

  private isArmed(): boolean {
    return this.state.isUserContactAuthenticated() && !this.state.isAnonymousUser();
  }

  /** Real activity: throttled reset of the timer + broadcast to other tabs. */
  private handleActivity(): void {
    if (!this.isArmed()) {
      this.clearTimer();
      return;
    }

    const now = Date.now();
    if (now - this.lastResetAt < ACTIVITY_THROTTLE_MS) {
      return;
    }
    this.lastResetAt = now;

    this.armTimer();
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {
      /* private mode / storage disabled — multi-tab sync degrades gracefully */
    }
  }

  /** Periodic check: start the timer the moment auth becomes armed, or stop it once it isn't. Never resets an already-running timer. */
  private ensureArmedState(): void {
    if (!this.isArmed()) {
      this.clearTimer();
      return;
    }
    if (this.timerId === null) {
      this.lastResetAt = Date.now();
      this.armTimer();
    }
  }

  private armTimer(): void {
    this.clearTimer();
    const minutes = this.timeoutMinutes();
    this.timerId = setTimeout(() => this.onTimeout(), minutes * 60 * 1000);
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private timeoutMinutes(): number {
    const configured = this.state.selectedPortal()?.idle_timeout_minutes;
    return configured && configured > 0 ? configured : DEFAULT_IDLE_TIMEOUT_MINUTES;
  }

  private onTimeout(): void {
    this.clearTimer();
    if (!this.isArmed()) return; // logged out / portal changed while the timer was pending
    this.session.endSession('session_timeout');
  }
}
