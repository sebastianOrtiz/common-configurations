import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { SettingsService } from './core/services/settings.service';
import { userContactTokenInterceptor } from './core/interceptors/user-contact-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `paramsInheritanceStrategy: 'always'` propagates parent route params
    // to children with non-empty paths (e.g. /portal/:portalName/sso reads
    // `portalName` correctly from the child component's snapshot).
    provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    // `userContactTokenInterceptor` reads the User Contact token from
    // StateService on every request — the single source of truth for the
    // X-User-Contact-Token header (see the interceptor for why this fixes SSO).
    provideHttpClient(
      withInterceptors([userContactTokenInterceptor]),
      withInterceptorsFromDi(),
    ),
    // Load public settings (feature flags) at boot so any component
    // can read them synchronously via SettingsService.
    provideAppInitializer(() => {
      const settings = inject(SettingsService);
      return settings.load();
    })
    // Service Worker disabled - Frappe doesn't serve these files correctly
  ]
};
