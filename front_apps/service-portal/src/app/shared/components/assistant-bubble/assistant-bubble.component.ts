/**
 * Assistant Bubble Component
 *
 * The single, always-present floating voice-assistant entry point for the
 * whole Service Portal. Mounted once in `AppComponent`.
 *
 * Tapping it starts a free-form COMMAND flow: the bubble asks what the
 * citizen needs, listens once, and hands the transcript to
 * `CommandRouterService.interpret()` together with every currently
 * `VoiceAction` registered in `AssistantContextService.availableActions()`
 * (global navigation actions + the active page's form, if any + whatever a
 * tool registered for itself). Depending on the resolved action:
 *
 * - `builtin: 'search'`    → hosts `VoiceNavigationComponent` and runs `startVoiceSearch()`.
 * - `builtin: 'fill_form'` → hosts `VoiceAssistantComponent` and runs `startSurvey()`.
 * - `id === 'help'`        → opens the generic help menu (read aloud).
 * - any other action       → speaks the confirmation and calls `action.run()`.
 * - no action resolved     → apologizes and falls back to the help menu.
 *
 * Both engines are rendered `embedded`, so neither shows its own launcher —
 * this bubble is the only microphone button on screen at any time.
 */

import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationStart } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { AssistantContextService, VoiceAction } from '../../../core/services/assistant-context.service';
import { CommandRouterService } from '../../../core/services/command-router.service';
import { SettingsService } from '../../../core/services/settings.service';
import { StateService } from '../../../core/services/state.service';
import { SttService } from '../../../core/services/voice/stt.service';
import { TtsService } from '../../../core/services/voice/tts.service';
import { IconComponent } from '../icon/icon.component';
import { VoiceAssistantComponent } from '../voice-assistant/voice-assistant.component';
import { VoiceNavigationComponent } from '../../../features/portal/voice-navigation/voice-navigation.component';

@Component({
  selector: 'app-assistant-bubble',
  standalone: true,
  imports: [CommonModule, IconComponent, VoiceAssistantComponent, VoiceNavigationComponent],
  templateUrl: './assistant-bubble.component.html',
  styleUrls: ['./assistant-bubble.component.scss'],
})
export class AssistantBubbleComponent {
  private settingsService = inject(SettingsService);
  private sttService = inject(SttService);
  private ttsService = inject(TtsService);
  private stateService = inject(StateService);
  private assistantContext = inject(AssistantContextService);
  private commandRouter = inject(CommandRouterService);
  private router = inject(Router);

  @ViewChild(VoiceAssistantComponent) private voiceAssistant?: VoiceAssistantComponent;
  @ViewChild(VoiceNavigationComponent) private voiceNavigation?: VoiceNavigationComponent;

  /** Gated purely by settings + browser STT support — never by route. */
  protected readonly available = computed(
    () => this.settingsService.isVoiceAssistantEnabled() && this.sttService.isSupported()
  );

  /** Every action the active page/tool + global navigation currently offer. */
  protected readonly availableActions = this.assistantContext.availableActions;

  /** Generic help menu — opened on "ayuda", on a failed match, or by tapping while idle after a re-tap. */
  protected menuOpen = false;

  /**
   * True while the bubble itself is speaking (TTS). Drives the animated
   * sound wave so the interaction is legible to people who can't read the
   * screen — audio out — and to people who can't hear — a visual wave that
   * moves with the speech.
   */
  protected readonly speaking = signal<boolean>(false);

  /** True while listening for the citizen's free-form command (distinct from the search/form engines' own listening). */
  protected readonly listening = signal<boolean>(false);

  constructor() {
    // Never leave a panel (or the generic menu) dangling after a route change.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.closeEverything());
  }

  /** True while either engine's panel is actively showing something to the user. */
  protected readonly isAnyPanelOpen = computed(
    () => !!this.voiceAssistant?.isOpen() || !!this.voiceNavigation?.isActive()
  );

  /** Show the animated sound wave while speaking, listening for a command, OR while a voice panel is active. */
  protected readonly showWave = computed(
    () => this.speaking() || this.listening() || this.isAnyPanelOpen()
  );

  /** Monotonic token so a superseded utterance/command flow never clears a newer one's state. */
  private speakSeq = 0;
  private commandSeq = 0;

  /** Speak `text` aloud, toggling the `speaking` wave around it. Best-effort. */
  private async say(text: string): Promise<void> {
    if (!text || !this.ttsService.isSupported()) return;
    const voice = this.settingsService.settings().voice_assistant;
    const mySeq = ++this.speakSeq;
    this.speaking.set(true);
    try {
      await this.ttsService.speak(text, voice.language, voice.gender);
    } catch {
      /* TTS best-effort — never block the UI */
    } finally {
      if (mySeq === this.speakSeq) this.speaking.set(false);
    }
  }

  /** Stop any ongoing speech and hide the wave. */
  private stopSpeaking(): void {
    this.speakSeq++;
    this.ttsService.cancel();
    this.speaking.set(false);
  }

  /** Spoken greeting for the generic menu, listing the actions actually available right now. */
  private buildGreeting(): string {
    const actions = this.availableActions().filter((a) => a.id !== 'help');
    if (!actions.length) {
      return 'Hola, soy tu asistente de voz. Por ahora no hay acciones disponibles en esta página. Dime en qué te ayudo.';
    }
    const list = actions.slice(0, 6).map((a) => a.description).join(', ');
    return `Hola, soy tu asistente de voz. Puedo ayudarte a: ${list}. Toca una opción o dime en qué te ayudo.`;
  }

  protected onBubbleClick(): void {
    // Tapping again while something is open/showing = close it (handles
    // double-clicks and gives the user an obvious way to dismiss).
    if (this.voiceAssistant?.isOpen()) {
      this.stopSpeaking();
      this.voiceAssistant.cancelSurvey();
      return;
    }
    if (this.voiceNavigation?.isActive()) {
      this.stopSpeaking();
      this.voiceNavigation.closePanel();
      return;
    }
    if (this.menuOpen) {
      this.stopSpeaking();
      this.menuOpen = false;
      return;
    }
    if (this.listening()) {
      return; // already listening for a command — ignore the extra tap
    }

    void this.runCommandFlow();
  }

  /** Ask what the citizen needs, listen once, and route the transcript to an action. */
  private async runCommandFlow(): Promise<void> {
    const mySeq = ++this.commandSeq;

    await this.say('Dime qué quieres hacer.');
    if (mySeq !== this.commandSeq) return;

    this.listening.set(true);
    let transcript = '';
    try {
      transcript = await this.sttService.listenOnce(
        this.settingsService.settings().voice_assistant.language,
        () => {}
      );
    } catch {
      /* best-effort — treated as silence below */
    } finally {
      if (mySeq === this.commandSeq) this.listening.set(false);
    }
    if (mySeq !== this.commandSeq) return;

    const clean = transcript.trim();
    if (!clean) {
      await this.say('No te escuché. ¿Puedes repetirlo?');
      return;
    }

    const result = await this.commandRouter.interpret(clean, this.availableActions());
    if (mySeq !== this.commandSeq) return;

    if (result.action) {
      await this.executeAction(result.action, result.args, result.spokenReply);
    } else {
      await this.say('No te entendí. ¿Puedes repetirlo?');
      if (mySeq !== this.commandSeq) return;
      this.openHelpMenu();
    }
  }

  /** Run a resolved action, dispatching to the right engine for builtins. */
  private async executeAction(
    action: VoiceAction,
    args: { query?: string },
    spokenReply?: string | null
  ): Promise<void> {
    if (action.builtin === 'search') {
      await this.voiceNavigation?.startVoiceSearch();
      return;
    }

    if (action.builtin === 'fill_form') {
      const formCtx = this.assistantContext.formContext();
      if (!formCtx) return;
      try {
        const answers = await this.voiceAssistant?.startSurvey(formCtx.prompts);
        if (answers) formCtx.onComplete(answers);
      } catch {
        /* user cancelled the survey — nothing to do */
      }
      return;
    }

    if (action.id === 'help') {
      this.openHelpMenu();
      return;
    }

    await this.say(spokenReply || 'Listo, un momento.');
    await action.run?.(args);
  }

  /** Tap handler for a menu item — same execution path as a spoken command. */
  protected runMenuAction(action: VoiceAction): void {
    this.menuOpen = false;
    this.stopSpeaking();
    void this.executeAction(action, {});
  }

  private openHelpMenu(): void {
    this.menuOpen = true;
    void this.say(this.buildGreeting());
  }

  /**
   * Icon shown next to a menu item, based on the action's id/builtin.
   * Restricted to names already whitelisted in `IconComponent`'s `ICON_MAP`
   * (unknown names silently fall back to a plain circle).
   */
  protected menuActionIcon(action: VoiceAction): string {
    if (action.builtin === 'search') return 'Search';
    if (action.builtin === 'fill_form') return 'ClipboardCheck';
    if (action.id === 'nav.back') return 'ChevronLeft';
    if (action.id === 'nav.home') return 'Home';
    if (action.id === 'login') return 'UserPlus';
    if (action.id === 'help') return 'MessageSquare';
    return 'ChevronRight';
  }

  protected closeMenu(): void {
    this.stopSpeaking();
    this.menuOpen = false;
  }

  private closeEverything(): void {
    this.commandSeq++;
    this.stopSpeaking();
    this.listening.set(false);
    this.menuOpen = false;
    if (this.voiceAssistant?.isOpen()) this.voiceAssistant.cancelSurvey();
    if (this.voiceNavigation?.isActive()) this.voiceNavigation.closePanel();
  }
}
