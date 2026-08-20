import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { StateService } from '../services/state.service';
import { USER_CONTACT_AUTH_HEADER } from '../services/frappe-api.service';

/**
 * Attaches the User Contact auth token (X-User-Contact-Token) to every
 * same-origin request, and force-reauthenticates when a sent token is
 * rejected as invalid.
 *
 * Reading the token straight from StateService on each request makes
 * StateService the single source of truth: any flow that authenticates
 * (registration/OTP, SSO, ...) is picked up on the very next call without
 * needing a full page reload to rehydrate an in-memory copy. This is what
 * previously broke delegated-auth (SSO): the token lived in a separate
 * in-memory field that the SSO flow never primed.
 *
 * The header is only added for same-origin requests so the token is never
 * leaked to third-party hosts if an absolute external URL is ever requested.
 *
 * Stale-token handling: there is only ONE active token per User Contact
 * server-side (a newer login/SSO invalidates any previous one). So a tab
 * holding an older token still shows the cached user in the header but every
 * data call fails with AuthenticationError. When we DID send a token and the
 * server rejects it as an auth failure, we deauthorize immediately and send
 * the user to the portal login — never leave them "logged-in but unable to
 * load anything".
 */
export const userContactTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const state = inject(StateService);
  const router = inject(Router);
  const token = state.getAuthToken();
  const sameOrigin = isSameOrigin(req.url);

  if (token && sameOrigin) {
    req = req.clone({ setHeaders: { [USER_CONTACT_AUTH_HEADER]: token } });
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      // Only act when WE sent a token (i.e. the user believes they're
      // logged in) and the server rejected it as an authentication failure.
      // Anonymous/guest browsing (no token) is left untouched, and we never
      // interrupt the authentication flows themselves (login/SSO/OTP/register),
      // where an old token may briefly coexist with a re-auth in progress.
      if (
        token &&
        sameOrigin &&
        !isAuthEndpoint(req.url) &&
        err instanceof HttpErrorResponse &&
        isAuthFailure(err)
      ) {
        forceReauth(state, router);
      }
      return throwError(() => err);
    })
  );
};

/**
 * True when the response is a User Contact authentication failure. Frappe
 * maps `AuthenticationError` to HTTP 401; we also inspect the body's
 * `exc_type` as a belt-and-suspenders check, WITHOUT treating PermissionError
 * (403) as a reason to log out.
 */
function isAuthFailure(err: HttpErrorResponse): boolean {
  if (err.status === 401) {
    return true;
  }
  const body: unknown = err.error;
  const excType =
    typeof body === 'string' ? body : (body as { exc_type?: string } | null)?.exc_type;
  return typeof excType === 'string' && excType.includes('AuthenticationError');
}

/**
 * Deauthorize the current User Contact and route to the portal's login /
 * registration. Guards against concurrent 401s: the first handler clears the
 * token, so any others see no token and skip.
 */
function forceReauth(state: StateService, router: Router): void {
  if (!state.getAuthToken()) {
    return; // already handled by a previous failing request
  }

  const portal = state.selectedPortal();
  // Clear only the User Contact auth; keep the selected portal so the login
  // page has its context and the user returns to the same portal.
  state.clearUserContact();

  const portalName = portal?.portal_name;
  if (portalName) {
    router.navigate(['/portal', portalName, 'register'], {
      queryParams: { reason: 'session_expired' },
    });
  } else {
    router.navigate(['/portals']);
  }
}

/**
 * True for the authentication endpoints themselves — we must not bounce the
 * user to login because one of THESE returned an auth error (that's the
 * normal way they report bad credentials / expired OTP / stale nonce).
 */
function isAuthEndpoint(url: string): boolean {
  return /(login|logout|sso|otp|register|verify|token|csrf|create_user_contact)/i.test(url);
}

function isSameOrigin(url: string): boolean {
  // Relative URLs (/api/..., api/...) are always same-origin.
  if (!/^https?:\/\//i.test(url)) {
    return true;
  }
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}
