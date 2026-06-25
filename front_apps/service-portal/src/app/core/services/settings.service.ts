/**
 * Settings Service
 *
 * Loads public settings (feature flags + UI config) from the backend.
 * Cached as a signal so any component can react to changes.
 */

import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';

export interface VoiceAssistantSettings {
  enabled: boolean;
  ai_enabled: boolean;
  name: string;
  language: string;
  gender: 'female' | 'male';
}

export interface TenantHubSettings {
  /** URL of the Tenant Hub that sends users to this site, or null if not configured. */
  url: string | null;
}

export interface PublicSettings {
  voice_assistant: VoiceAssistantSettings;
  tenant_hub: TenantHubSettings;
}

const DEFAULT_SETTINGS: PublicSettings = {
  voice_assistant: {
    enabled: false,
    ai_enabled: false,
    name: 'Asistente',
    language: 'es-ES',
    gender: 'female',
  },
  tenant_hub: {
    url: null,
  },
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private frappeApi = inject(FrappeApiService);

  private _settings = signal<PublicSettings>(DEFAULT_SETTINGS);
  private _loaded = signal<boolean>(false);

  /** Public read-only signals */
  readonly settings = this._settings.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /**
   * Load settings from the backend. Idempotent — repeated calls reuse the cached
   * value unless `force = true`.
   */
  async load(force = false): Promise<void> {
    if (this._loaded() && !force) return;

    try {
      const response: any = await firstValueFrom(
        this.frappeApi.callMethod<PublicSettings>(
          'common_configurations.api.settings.get_public_settings',
          {},
          true
        )
      );
      const data = response?.message;
      if (data) {
        this._settings.set({
          voice_assistant: {
            ...DEFAULT_SETTINGS.voice_assistant,
            ...(data.voice_assistant || {}),
          },
          tenant_hub: {
            ...DEFAULT_SETTINGS.tenant_hub,
            ...(data.tenant_hub || {}),
          },
        });
      }
    } catch (err) {
      // Fallback to defaults silently — feature flags off when backend is unreachable
      console.warn('[SettingsService] Could not load public settings:', err);
    } finally {
      this._loaded.set(true);
    }
  }

  /** Convenience accessor for the most commonly used flag */
  isVoiceAssistantEnabled(): boolean {
    return this._settings().voice_assistant.enabled;
  }

  isVoiceAssistantAIEnabled(): boolean {
    return this._settings().voice_assistant.ai_enabled;
  }

  /**
   * URL of the Tenant Hub to render the "Back to directory" button.
   * Prefers the admin-configured value; falls back to the referrer that
   * the SSO consumer captured into localStorage when the user arrived
   * via SSO. Returns null if neither is available.
   */
  tenantHubUrl(): string | null {
    const configured = this._settings().tenant_hub?.url || null;
    if (configured) return configured;
    try {
      return localStorage.getItem('sp_tenant_hub_referrer');
    } catch {
      return null;
    }
  }
}
