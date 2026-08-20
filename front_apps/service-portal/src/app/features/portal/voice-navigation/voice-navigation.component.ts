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

import { Component, HostBinding, Input, OnDestroy, computed, inject, signal } from '@angular/core';
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

  /**
   * When true, this component is hosted by the global assistant bubble
   * (`AssistantBubbleComponent`) instead of being embedded inline in a page:
   * it no longer renders its own idle "¿Qué necesitas?" launcher card, only
   * the floating status/results panel once `startVoiceSearch()` is triggered
   * externally. Also switches the host to `position: fixed` (see SCSS).
   */
  @Input() embedded = false;

  @HostBinding('class.embedded')
  get isEmbeddedHost(): boolean {
    return this.embedded;
  }

  // UI state
  protected state = signal<NavState>('idle');
  protected interimText = signal<string>('');
  protected transcript = signal<string>('');
  protected results = signal<NavigationResult[]>([]);
  protected clarifyingQuestion = signal<string | null>(null);
  protected errorMessage = signal<string | null>(null);
  /** True while listening for the user's spoken pick among the "choose" options. */
  protected choiceListening = signal<boolean>(false);

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

  /** Public: lets the global assistant bubble know whether a panel is currently showing. */
  readonly isActive = computed(() => this.state() !== 'idle');

  /**
   * Public entry point for the global assistant bubble: closes any open
   * panel (listening/searching/choose/none/error) and returns to idle.
   * Used e.g. when the user navigates to another route mid-search so no
   * panel is left dangling.
   */
  closePanel(): void {
    this.resetToIdle();
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
          this.handleResponse(response?.message, myId);
        },
        error: (err) => {
          if (myId !== this.requestId) return;
          console.error('[VoiceNavigation] Error resolving navigation:', err);
          this.errorMessage.set('No pudimos procesar tu búsqueda. Intenta de nuevo.');
          this.state.set('error');
        },
      });
  }

  private handleResponse(data: ResolveNavigationResponse | undefined, myId: number): void {
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
        const results = data.results || [];
        this.results.set(results);
        this.clarifyingQuestion.set(data.clarifying_question);
        this.state.set('choose');
        // Read the options aloud AND then listen for a spoken pick, so a
        // citizen who can't read the screen can still choose by voice.
        void this.presentChoices(results, data.clarifying_question, myId);
        break;
      }
      case 'none':
      default:
        this.state.set('none');
        break;
    }
  }

  /**
   * Speak the clarifying question + an enumerated read-out of the options,
   * then open the mic to capture the user's spoken choice.
   */
  private async presentChoices(
    results: NavigationResult[],
    question: string | null,
    myId: number
  ): Promise<void> {
    if (!results.length) return;
    const intro = question || 'Encontré varias opciones.';
    const list = results
      .map((r, i) => `Opción ${i + 1}: ${r.title}${r.secretaria ? `, en ${r.secretaria}` : ''}.`)
      .join(' ');
    await this.speakAsync(`${intro} ${list} Dime el número de la opción, o toca una en la pantalla.`);
    if (myId !== this.requestId) return; // user tapped a card / cancelled while speaking
    await this.listenForChoice(results, myId);
  }

  /**
   * Listen for the user's spoken choice among the "choose" options and act on
   * it. Matches a number ("dos", "la segunda", "2") or the trámite/secretaría
   * name. One retry with a hint; after that the user can just tap a card.
   */
  private async listenForChoice(
    results: NavigationResult[],
    myId: number,
    retries = 0
  ): Promise<void> {
    if (myId !== this.requestId) return;
    this.choiceListening.set(true);
    this.interimText.set('');

    try {
      const raw = await this.sttService.listenOnce(this.language(), (t) => {
        if (myId === this.requestId) this.interimText.set(t);
      });
      if (myId !== this.requestId) return;
      this.choiceListening.set(false);

      const norm = this.normalizeText(raw || '');
      if (!norm) {
        if (retries < 1) {
          await this.speakAsync('No te escuché. Dime el número de la opción.');
          if (myId !== this.requestId) return;
          await this.listenForChoice(results, myId, retries + 1);
        }
        return;
      }

      // Control words
      if (/\b(cancelar|cancela|salir|nada|ninguna|ninguno)\b/.test(norm)) {
        this.resetToIdle();
        return;
      }
      if (/\b(otra vez|de nuevo|buscar de nuevo|repetir|nueva busqueda)\b/.test(norm)) {
        void this.startVoiceSearch();
        return;
      }

      const idx = this.matchChoice(norm, results);
      if (idx >= 0) {
        await this.speakAsync(`Te llevo a ${results[idx].title}.`);
        if (myId !== this.requestId) return;
        this.navigateToResult(results[idx]);
        return;
      }

      // No match → one hint + retry, then let the user tap.
      if (retries < 1) {
        await this.speakAsync('No entendí cuál. Dime el número de la opción, o toca una en la pantalla.');
        if (myId !== this.requestId) return;
        await this.listenForChoice(results, myId, retries + 1);
      }
    } catch {
      if (myId !== this.requestId) return;
      this.choiceListening.set(false);
      // Stay on the choose screen; the user can tap a card.
    }
  }

  /**
   * Resolve a spoken choice to an option index (0-based), or -1 if none.
   * Understands digits, number words and ordinals (1..MAX_CHOOSE), and falls
   * back to matching the trámite/secretaría name.
   */
  private matchChoice(norm: string, results: NavigationResult[]): number {
    const wordToNum: Record<string, number> = {
      uno: 1, primero: 1, primera: 1, primer: 1,
      dos: 2, segundo: 2, segunda: 2,
      tres: 3, tercero: 3, tercera: 3, tercer: 3,
      cuatro: 4, cuarto: 4, cuarta: 4,
      cinco: 5, quinto: 5, quinta: 5,
    };

    // Digit anywhere in the phrase ("la 2", "opcion 3").
    const digit = norm.match(/\b([1-9])\b/);
    if (digit) {
      const n = parseInt(digit[1], 10);
      if (n >= 1 && n <= results.length) return n - 1;
    }

    // Number/ordinal words.
    for (const [word, n] of Object.entries(wordToNum)) {
      if (n <= results.length && new RegExp(`\\b${word}\\b`).test(norm)) {
        return n - 1;
      }
    }

    // Name / secretaría overlap: pick the option sharing the most query tokens.
    const tokens = norm.split(/\s+/).filter((t) => t.length >= 4);
    let bestIdx = -1;
    let bestScore = 0;
    results.forEach((r, i) => {
      const hay = this.normalizeText(`${r.title} ${r.secretaria}`);
      let score = 0;
      tokens.forEach((t) => {
        if (hay.includes(t)) score++;
      });
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    return bestScore > 0 ? bestIdx : -1;
  }

  /** lowercase + strip accents, for robust spoken-choice matching. */
  private normalizeText(s: string): string {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  /** Awaitable speak so we can sequence "read options → listen for pick". */
  private speakAsync(text: string): Promise<void> {
    if (!text || !this.ttsService.isSupported()) return Promise.resolve();
    const settings = this.settingsService.settings().voice_assistant;
    return this.ttsService.speak(text, settings.language, settings.gender).catch(() => {});
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
    this.choiceListening.set(false);
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
