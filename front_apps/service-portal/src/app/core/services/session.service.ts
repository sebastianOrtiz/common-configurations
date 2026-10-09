/**
 * Session Service
 *
 * Single place that ends a User Contact's session (deauthorizes + routes
 * back to the portal's login/registration screen). Shared by:
 * - `userContactTokenInterceptor`: when the server rejects the stored token
 *   as invalid (`reason: 'session_expired'`).
 * - `IdleService`: after N minutes of inactivity (`reason: 'session_timeout'`).
 *
 * Extracted so neither caller duplicates the clear-token + redirect logic
 * (previously only lived inside the interceptor's `forceReauth()`).
 */

import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { StateService } from './state.service';
import { VoiceSessionService } from './voice/voice-session.service';

/** Why the session ended — read by the registration page to show the right message. */
export type SessionEndReason = 'session_expired' | 'session_timeout';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private state = inject(StateService);
  private router = inject(Router);
  private voiceSession = inject(VoiceSessionService);

  /**
   * Deauthorize the current User Contact and route to the portal's login /
   * registration. Idempotent: a call after the token is already cleared is a
   * no-op, so concurrent triggers (e.g. two failing requests, or the idle
   * timer firing right as a request also 401s) never double-navigate.
   */
  endSession(reason: SessionEndReason): void {
    if (!this.state.getAuthToken()) {
      return; // already handled by a previous call
    }

    // The session is over: the continuous voice mode must not keep running.
    this.voiceSession.stop();

    const portal = this.state.selectedPortal();
    // Clear only the User Contact auth; keep the selected portal so the
    // login page has its context and the user returns to the same portal.
    this.state.clearUserContact();

    const portalName = portal?.portal_name;
    if (portalName) {
      this.router.navigate(['/portal', portalName, 'register'], {
        queryParams: { reason },
      });
    } else {
      this.router.navigate(['/portals']);
    }
  }
}
