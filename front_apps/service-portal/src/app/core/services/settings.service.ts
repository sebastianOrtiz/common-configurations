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
}

export interface PublicSettings {
  voice_assistant: VoiceAssistantSettings;
}

const DEFAULT_SETTINGS: PublicSettings = {
  voice_assistant: {
    enabled: false,
    ai_enabled: false,
    name: 'Asistente',
    language: 'es-ES',
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
}
