import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { SettingsService } from './core/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `paramsInheritanceStrategy: 'always'` propagates parent route params
    // to children with non-empty paths (e.g. /portal/:portalName/sso reads
    // `portalName` correctly from the child component's snapshot).
    provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideHttpClient(withInterceptorsFromDi()),
    // Load public settings (feature flags) at boot so any component
    // can read them synchronously via SettingsService.
    provideAppInitializer(() => {
      const settings = inject(SettingsService);
      return settings.load();
    })
    // Service Worker disabled - Frappe doesn't serve these files correctly
  ]
};
