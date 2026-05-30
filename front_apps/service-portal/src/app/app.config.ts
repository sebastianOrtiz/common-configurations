import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { routes } from './app.routes';
import { SettingsService } from './core/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
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
