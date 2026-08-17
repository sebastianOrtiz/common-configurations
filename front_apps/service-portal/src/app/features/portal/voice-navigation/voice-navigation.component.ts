/**
 * Voice Navigation Component
 *
 * "¿Qué necesitas? Búscalo por voz" — lets a citizen speak what they need
 * (e.g. "quiero renovar mi licencia") and routes them straight to the right
 * trámite, even if they don't know which secretaría offers it.
 *
 * Flow:
 * 1. Tap the mic → STT starts listening ("Escuchando…").
 * 2. Transcript obtained → call `resolve_navigation` ("Buscando…").
 * 3. Backend decides:
 *    - navigate: deep-link straight into the trámite (+ optional TTS).
 *    - choose: show a short list of candidate trámites to pick from.
 *    - none: "no encontré ese trámite" + link back to the secretarías grid.
 *
 * Only rendered when `SettingsService.isVoiceAssistantEnabled()` is true.
 */

import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { StateService } from '../../../core/services/state.service';
import { SettingsService } from '../../../core/services/settings.service';
import { SttService } from '../../../core/services/voice/stt.service';
import { TtsService } from '../../../core/services/voice/tts.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export interface NavigationResult {
  id: string;
  title: string;
  secretaria: string;
  tool_name: string;
  procedure_name: string;
  type: 'internal' | 'external';
  external_url?: string;
  score?: number;
}

export interface ResolveNavigationResponse {
  mode: 'navigate' | 'choose' | 'none';
  transcript: string;
  used_ai: boolean;
  clarifying_question: string | null;
  results: NavigationResult[];
}

type NavState = 'idle' | 'listening' | 'searching' | 'choose' | 'none' | 'error';

const NAVIGATION_API = 'common_configurations.api.navigation.resolve_navigation';

@Component({
  selector: 'app-voice-navigation',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './voice-navigation.component.html',
  styleUrls: ['./voice-navigation.component.scss'],
})
export class VoiceNavigationComponent implements OnDestroy {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private settingsService = inject(SettingsService);
  private sttService = inject(SttService);
  private ttsService = inject(TtsService);
  private router = inject(Router);

  // UI state
  protected state = signal<NavState>('idle');
  protected interimText = signal<string>('');
  protected transcript = signal<string>('');
  protected results = signal<NavigationResult[]>([]);
  protected clarifyingQuestion = signal<string | null>(null);
  protected errorMessage = signal<string | null>(null);

  /** Guards against a stale STT/API resolution landing after the user cancelled or restarted. */
  private requestId = 0;
  private searchSubscription?: Subscription;

  protected readonly isSttSupported = this.sttService.isSupported();

  protected readonly language = computed(
    () => this.settingsService.settings().voice_assistant.language
  );

  /** Same accessor pattern used across the portal (procedures-tool, pqr-tool, etc.) */
  protected get isVoiceAssistantAvailable(): boolean {
    return this.settingsService.isVoiceAssistantEnabled();
  }

  /**
   * Start listening for a voice query. Cancels/replaces any in-flight
   * listen or search (guarded via requestId so stale callbacks are ignored).
   */
  async startVoiceSearch(): Promise<void> {
    if (!this.isSttSupported) {
      this.errorMessage.set(
        'Tu navegador no soporta el reconocimiento de voz. Usa Chrome o Edge.'
      );
      this.state.set('error');
      return;
    }

    const myId = ++this.requestId;
    this.errorMessage.set(null);
    this.interimText.set('');
    this.transcript.set('');
    this.results.set([]);
    this.clarifyingQuestion.set(null);
    this.state.set('listening');

    try {
      const text = await this.sttService.listenOnce(this.language(), (interim) => {
        if (myId === this.requestId) this.interimText.set(interim);
      });
      if (myId !== this.requestId) return; // cancelled while listening

      const query = (text || '').trim();
      if (!query) {
        // Silence: quietly go back to the idle prompt, no need for an error.
        this.state.set('idle');
        return;
      }

      this.transcript.set(query);
      this.search(query, myId);
    } catch (err: any) {
      if (myId !== this.requestId) return;
      this.errorMessage.set(err?.message || 'No pudimos escucharte. Intenta de nuevo.');
      this.state.set('error');
    }
  }

  private search(query: string, myId: number): void {
    const portal = this.stateService.selectedPortal();
    if (!portal) {
      this.errorMessage.set('No se pudo determinar el portal actual.');
      this.state.set('error');
      return;
    }

    this.state.set('searching');

    this.searchSubscription = this.frappeApi
      .callMethod<ResolveNavigationResponse>(NAVIGATION_API, {
        query,
        portal_name: portal.portal_name,
        honeypot: '',
      })
      .subscribe({
        next: (response) => {
          if (myId !== this.requestId) return;
          this.handleResponse(response?.message);
        },
        error: (err) => {
          if (myId !== this.requestId) return;
          console.error('[VoiceNavigation] Error resolving navigation:', err);
          this.errorMessage.set('No pudimos procesar tu búsqueda. Intenta de nuevo.');
          this.state.set('error');
        },
      });
  }

  private handleResponse(data?: ResolveNavigationResponse): void {
    if (!data) {
      this.errorMessage.set('Respuesta inesperada del servidor.');
      this.state.set('error');
      return;
    }

    switch (data.mode) {
      case 'navigate': {
        const result = data.results?.[0];
        if (!result) {
          this.state.set('none');
          return;
        }
        this.speak(`Te llevo a ${result.title} en ${result.secretaria}.`);
        this.navigateToResult(result);
        break;
      }
      case 'choose': {
        this.results.set(data.results || []);
        this.clarifyingQuestion.set(data.clarifying_question);
        if (data.clarifying_question) this.speak(data.clarifying_question);
        this.state.set('choose');
        break;
      }
      case 'none':
      default:
        this.state.set('none');
        break;
    }
  }

  /**
   * Deep-link straight into the trámite. Used both for direct "navigate"
   * mode and when the citizen picks a card from the "choose" list.
   * The target ProceduresToolComponent reads the `procedure` queryParam
   * and auto-opens it regardless of whether it's internal or external.
   */
  protected navigateToResult(result: NavigationResult): void {
    const portal = this.stateService.selectedPortal();
    if (!portal) return;

    this.router.navigate(['/portal', portal.portal_name, 'tool', 'procedures', result.tool_name], {
      queryParams: { procedure: result.procedure_name },
    });

    this.resetToIdle();
  }

  /** "Ver todas las secretarías" / cancel — back to the idle prompt (the grid is already the portal home). */
  protected resetToIdle(): void {
    this.requestId++; // invalidate any pending listen/search callback
    this.searchSubscription?.unsubscribe();
    this.ttsService.cancel();
    this.state.set('idle');
    this.interimText.set('');
    this.transcript.set('');
    this.results.set([]);
    this.clarifyingQuestion.set(null);
    this.errorMessage.set(null);
  }

  private speak(text: string): void {
    if (!this.ttsService.isSupported()) return;
    const settings = this.settingsService.settings().voice_assistant;
    void this.ttsService.speak(text, settings.language, settings.gender);
  }

  ngOnDestroy(): void {
    this.requestId++;
    this.searchSubscription?.unsubscribe();
    this.ttsService.cancel();
  }
}
