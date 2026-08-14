import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { StateService } from '../services/state.service';
import { USER_CONTACT_AUTH_HEADER } from '../services/frappe-api.service';

/**
 * Attaches the User Contact auth token (X-User-Contact-Token) to every
 * same-origin request.
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
 */
export const userContactTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const state = inject(StateService);
  const token = state.getAuthToken();

  // TEMP DEBUG (SSO): confirms this NEW bundle is live and whether a token is
  // available at request time. Logs only a boolean, never the token value.
  // Remove once the SSO delegated-auth issue is confirmed fixed.
  if (req.url.includes('/api/method/')) {
    console.log('[SSO Debug v2] interceptor run', {
      url: req.url,
      hasToken: !!token,
      sameOrigin: isSameOrigin(req.url),
    });
  }

  if (token && isSameOrigin(req.url)) {
    req = req.clone({ setHeaders: { [USER_CONTACT_AUTH_HEADER]: token } });
  }

  return next(req);
};

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
