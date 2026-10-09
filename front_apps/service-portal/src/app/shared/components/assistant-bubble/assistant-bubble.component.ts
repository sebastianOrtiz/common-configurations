/**
 * Assistant Bubble Component
 *
 * The single, always-present floating voice-assistant entry point for the
 * whole Service Portal. Mounted once in `AppComponent`.
 *
 * Tapping it on a page that exposes a form (`AssistantContextService.formContext()`)
 * jumps straight into a guided, low-friction voice fill: field by field,
 * minimal confirmation, no big dialog — just the FAB (with its sound wave)
 * plus a small compact card drawn by THIS component from `VoiceAssistantComponent`'s
 * public UI signals (`currentQuestion`, `progressLabel`, `isListening`,
 * `interim`). The engine itself is hosted `headless`, so it renders nothing.
 *
 * On a page without a form, tapping starts a free-form COMMAND flow instead:
 * the bubble asks what the citizen needs, listens once, and hands the
 * transcript to `CommandRouterService.interpret()` together with every
 * currently `VoiceAction` registered in `AssistantContextService.availableActions()`
 * (global navigation actions + whatever a tool registered for itself).
 * Depending on the resolved action:
 *
 * - `builtin: 'search'`    → hosts `VoiceNavigationComponent` and runs `startVoiceSearch()`.
 * - `builtin: 'fill_form'` → runs `startFormFill()` (same guided-fill path as the direct tap).
 * - `id === 'help'`        → opens the generic help menu (read aloud).
 * - any other action       → speaks the confirmation and calls `action.run()`.
 * - no action resolved     → apologizes and falls back to the help menu.
 *
 * Both engines are rendered `embedded`, so neither shows its own launcher —
 * this bubble is the only microphone button on screen at any time.
 */

import { AfterViewInit, Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationStart, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { AssistantContextService, VoiceAction } from '../../../core/services/assistant-context.service';
import { CommandRouterService } from '../../../core/services/command-router.service';
import { SettingsService } from '../../../core/services/settings.service';
import { StateService } from '../../../core/services/state.service';
import { SttService } from '../../../core/services/voice/stt.service';
import { TtsService } from '../../../core/services/voice/tts.service';
import { VoiceDiagnosticsService } from '../../../core/services/voice/diagnostics.service';
import { VoiceSessionService } from '../../../core/services/voice/voice-session.service';
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
export class AssistantBubbleComponent implements AfterViewInit {
  private settingsService = inject(SettingsService);
  private sttService = inject(SttService);
  private ttsService = inject(TtsService);
  private stateService = inject(StateService);
  private assistantContext = inject(AssistantContextService);
  private commandRouter = inject(CommandRouterService);
  private router = inject(Router);
  private diagnostics = inject(VoiceDiagnosticsService);
  private voiceSession = inject(VoiceSessionService);

  // `protected` (not `private`): the compact form-fill card in the template
  // reads `voiceAssistant`'s public UI signals directly (currentQuestion,
  // progressLabel, isListening, interim, isOpen, cancelSurvey).
  @ViewChild(VoiceAssistantComponent) protected voiceAssistant?: VoiceAssistantComponent;
  @ViewChild(VoiceNavigationComponent) private voiceNavigation?: VoiceNavigationComponent;

  /** Gated purely by settings + browser STT support — never by route. */
  protected readonly available = computed(
    () => this.settingsService.isVoiceAssistantEnabled() && this.sttService.isSupported()
  );

  /** Every action the active page/tool + global navigation currently offer. */
  protected readonly availableActions = this.assistantContext.availableActions;

  /** True when the browser speech engine looks wedged (no audio) — show a "follow the text" hint. */
  protected readonly ttsDegraded = this.ttsService.degraded;

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

  /** Live transcript while listening for a command, so the feedback is uniform with the search/survey engines. */
  protected readonly interimCommand = signal<string>('');

  /** True after a full reload while guided mode was on: the mic is blocked until one tap ("toca para continuar"). */
  protected readonly needsResume = computed(
    () => this.voiceSession.needsResume() && this.available()
  );

  /** Pending auto-start (debounced so the new view can register its form/actions first). */
  private autoStartTimer: ReturnType<typeof setTimeout> | null = null;
  /** Retry counter so a pending post-radicación closing keeps trying until the assistant is free. */
  private postActionRetries = 0;

  /** Last `fillRequest` value acted on, so the effect only fires on new requests. */
  private lastFillRequest = 0;

  constructor() {
    // Never leave a panel (or the generic menu) dangling after a route change.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        // A closing announcement is only meaningful on the page that set it.
        this.assistantContext.clearPostActionPrompt();
        this.closeEverything();
      });

    // Continuous guided voice mode: once the user activated it with a tap,
    // every view they navigate to restarts the assistant by itself.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.scheduleAutoStart());

    // A tool announced a closing message (trámite/PQR radicado). No route
    // change happens in that case, so in continuous guided mode we trigger the
    // auto-start ourselves; otherwise the message waits for the next tap.
    effect(() => {
      if (this.assistantContext.postActionPrompt() !== null) {
        untracked(() => this.scheduleAutoStart());
      }
    });

    // A page can ask us to start filling the current form (e.g. after the
    // login page's guided branch routes to login/register and sets that form).
    effect(() => {
      const req = this.assistantContext.fillRequest();
      if (req > 0 && req !== this.lastFillRequest) {
        this.lastFillRequest = req;
        void this.startFormFill();
      }
    });
  }

  /**
   * `VoiceAssistantComponent.surveyExit` is a plain `@Output` (not bound in
   * the template — this component drives the survey imperatively via
   * `startSurvey()`), so we subscribe to it directly once the ViewChild
   * resolves, same lifecycle timing needed for any `@ViewChild` output.
   */
  ngAfterViewInit(): void {
    this.voiceAssistant?.surveyExit.subscribe(({ intent, transcript }) => {
      void this.handleSurveyExit(intent, transcript);
    });
  }

  /**
   * The citizen asked, mid form-fill, to leave for somewhere else ("volver
   * al inicio", "buscar otra cosa") instead of just cancelling. Delegate to
   * `executeAction` with the matching global action — same execution path a
   * spoken command or menu tap would use — so behavior stays one code path.
   */
  private async handleSurveyExit(intent: 'home' | 'search', _transcript: string): Promise<void> {
    if (intent === 'home') {
      const homeAction = this.availableActions().find((a) => a.id === 'nav.home');
      if (homeAction) await this.executeAction(homeAction, {});
      return;
    }

    // 'search': the transcript is the control phrase itself ("buscar otra
    // cosa"), not a usable query, so open the search engine's mic instead of
    // searching for the literal command text.
    const searchAction = this.availableActions().find((a) => a.builtin === 'search');
    if (searchAction) await this.executeAction(searchAction, {});
  }

  /** True while either engine's panel is actively showing something to the user. */
  protected readonly isAnyPanelOpen = computed(
    () => !!this.voiceAssistant?.isOpen() || !!this.voiceNavigation?.isActive()
  );

  /**
   * Only the voice-navigation (search) panel replaces the FAB with its own
   * full UI. The guided form-fill survey now lives INSIDE the bubble (FAB +
   * compact card), so it must never hide the FAB — the wave and the compact
   * card are the only feedback the user gets while it runs.
   */
  protected readonly hideFab = computed(() => !!this.voiceNavigation?.isActive());

  /**
   * Show the animated sound wave while ANY voice activity is happening:
   * the bubble speaking/listening, a hosted engine panel, OR a page-driven
   * flow (login guided branch) reporting through `externalVoice`.
   */
  protected readonly showWave = computed(() => {
    const ext = this.assistantContext.externalVoice();
    return this.speaking() || this.listening() || this.isAnyPanelOpen() || ext.speaking || ext.listening;
  });

  /** Whether to show the "Escuchando…" panel (bubble command flow OR a page-driven flow). */
  protected readonly showListening = computed(
    () => this.listening() || this.assistantContext.externalVoice().listening
  );

  /** Live transcript to display — from the command flow or a page-driven flow. */
  protected readonly currentInterim = computed(
    () => this.interimCommand() || this.assistantContext.externalVoice().interim
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
    } catch (err) {
      this.diagnostics.recordError('assistant_bubble.say', err);
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
    // Closing on purpose also switches the continuous guided mode off.
    if (this.voiceAssistant?.isOpen()) {
      this.stopGuidedMode('bubble_closed_survey');
      this.stopSpeaking();
      this.voiceAssistant.cancelSurvey();
      return;
    }
    if (this.voiceNavigation?.isActive()) {
      this.stopGuidedMode('bubble_closed_search');
      this.stopSpeaking();
      this.voiceNavigation.closePanel();
      return;
    }
    if (this.menuOpen) {
      this.stopGuidedMode('bubble_closed_menu');
      this.stopSpeaking();
      this.menuOpen = false;
      return;
    }
    if (this.listening()) {
      return; // already listening for a command — ignore the extra tap
    }
    if (this.speaking()) {
      // Tapping while the assistant talks = "stop".
      this.stopGuidedMode('bubble_closed_speaking');
      this.commandSeq++;
      this.stopSpeaking();
      return;
    }

    // A tap is the user gesture that unlocks audio/mic: (re)activate the
    // continuous guided mode. After a page reload this single tap resumes it.
    const resumedAfterReload = this.voiceSession.needsResume();
    this.voiceSession.activate();
    this.diagnostics.record({
      event_type: 'other',
      details: { step: 'guided_mode_activated_by_tap', resumed_after_reload: resumedAfterReload },
    });
    this.startInteraction();
  }

  private stopGuidedMode(reason: string): void {
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }
    if (this.voiceSession.guidedActive()) {
      this.voiceSession.stop();
      this.diagnostics.record({ event_type: 'other', details: { step: 'guided_mode_stopped', reason } });
    }
  }

  /** Debounced auto-start for the view just navigated to (only in continuous guided mode). */
  private scheduleAutoStart(): void {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.autoStartTimer = null;
    this.postActionRetries = 0;
    // After a reload `canAutoStart` is false (no gesture yet): the mic would be blocked.
    if (!this.available() || !this.voiceSession.canAutoStart()) return;
    this.autoStartTimer = setTimeout(() => {
      this.autoStartTimer = null;
      this.autoStart();
    }, 900);
  }

  private autoStart(): void {
    if (!this.available() || !this.voiceSession.canAutoStart()) return;
    const ext = this.assistantContext.externalVoice();
    const busy =
      this.listening() ||
      this.speaking() ||
      this.menuOpen ||
      ext.listening ||
      ext.speaking ||
      !!this.voiceAssistant?.isOpen() ||
      !!this.voiceNavigation?.isActive();
    if (busy) {
      this.diagnostics.record({ event_type: 'other', details: { step: 'auto_start_skipped_busy' } });
      // A post-radicación closing message is waiting but the assistant is still
      // busy (the survey / its TTS is finishing closing right after submit).
      // Keep retrying for a few seconds until it's free, so the closing is
      // actually spoken instead of staying stuck pending.
      if (this.assistantContext.postActionPrompt() && this.postActionRetries < 12) {
        this.postActionRetries++;
        this.autoStartTimer = setTimeout(() => {
          this.autoStartTimer = null;
          this.autoStart();
        }, 600);
      }
      return;
    }
    this.postActionRetries = 0;
    this.diagnostics.record({ event_type: 'other', details: { step: 'auto_start' } });
    this.startInteraction();
  }

  /** Cancel button of the compact form-fill card: closing on purpose stops guided mode. */
  protected cancelFormFill(): void {
    this.stopGuidedMode('formfill_cancel_button');
    this.voiceAssistant?.cancelSurvey();
  }

  protected exportDiagnostics(): void {
    this.diagnostics.exportJson();
  }

  /** Default behavior of a tap / an auto-start: primary action, form fill, or the free-form command flow. */
  private startInteraction(): void {

    // A page can designate a PRIMARY action for the tap (e.g. the login page:
    // "¿ya tienes cuenta o necesitas registrarte?"). It wins over the default.
    const primary = this.assistantContext.primaryAction();
    if (primary) {
      void primary.run?.();
      return;
    }

    // A pending closing announcement ("radicada, ¿qué sigue?") goes straight
    // to the command flow, which speaks it and then routes the answer.
    if (this.assistantContext.postActionPrompt() !== null) {
      void this.runCommandFlow();
      return;
    }

    // Pages that expose a form go straight into guided voice fill — no
    // "¿qué quieres?" detour. Tapping the bubble on a form page IS filling
    // the form, field by field, right inside the bubble.
    if (this.assistantContext.formContext()) {
      void this.startFormFill();
      return;
    }

    // Pages without a form fall back to the free-form command flow (rules +
    // AI): navigate, search, go back, etc.
    void this.runCommandFlow();
  }

  /** Ask what the citizen needs, listen once, and route the transcript to an action. */
  private async runCommandFlow(emptyRetries = 0): Promise<void> {
    const mySeq = ++this.commandSeq;

    // Greet only on the first attempt; on an empty-capture retry we re-listen
    // without repeating the whole greeting.
    if (emptyRetries === 0) {
      await this.say(this.commandGreeting());
      if (mySeq !== this.commandSeq) return;
    }

    this.interimCommand.set('');
    this.listening.set(true);
    let transcript = '';
    try {
      transcript = await this.sttService.listenOnce(
        this.settingsService.settings().voice_assistant.language,
        (t) => {
          if (mySeq === this.commandSeq) this.interimCommand.set(t);
        }
      );
    } catch (err) {
      this.diagnostics.recordError('assistant_bubble.listen', err);
      /* best-effort — treated as silence below */
    } finally {
      if (mySeq === this.commandSeq) {
        this.listening.set(false);
        this.interimCommand.set('');
      }
    }
    if (mySeq !== this.commandSeq) return;

    const clean = transcript.trim();
    if (!clean) {
      // Empty capture (common right after a long spoken message): re-listen a
      // couple of times instead of giving up and forcing the user to tap.
      if (emptyRetries < 2) {
        await this.say('No te escuché. ¿Puedes repetirlo?');
        if (mySeq === this.commandSeq) await this.runCommandFlow(emptyRetries + 1);
      } else {
        await this.say('No te escuché. Toca el micrófono cuando quieras seguir.');
      }
      return;
    }

    // "parar" / "detente": switch the continuous guided mode off.
    if (this.voiceSession.isStopPhrase(this.normalizeForStop(clean))) {
      this.stopGuidedMode('voice_stop_command');
      await this.say('Listo, me detengo. Toca el micrófono cuando me necesites.');
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

  private normalizeForStop(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  /** Run a resolved action, dispatching to the right engine for builtins. */
  private async executeAction(
    action: VoiceAction,
    args: { query?: string },
    spokenReply?: string | null
  ): Promise<void> {
    this.diagnostics.record({
      event_type: 'action_dispatched',
      interpreted_action: action.id,
      outcome: 'dispatched',
      details: {
        args,
        builtin: action.builtin ?? null,
        has_run: !!action.run,
        spoken_reply: spokenReply ?? null,
      },
    });

    if (action.builtin === 'search') {
      // If the command already carried what to look for ("busca licencia"),
      // search that directly — don't reopen the mic and make them say it again.
      const query = (args.query || '').trim();
      if (query) {
        this.voiceNavigation?.runQuery(query);
      } else {
        await this.voiceNavigation?.startVoiceSearch();
      }
      return;
    }

    if (action.builtin === 'fill_form') {
      await this.startFormFill();
      return;
    }

    if (action.id === 'help') {
      this.openHelpMenu();
      return;
    }

    await this.say(spokenReply || 'Listo, un momento.');
    await this.runWithNavigationTracking(action, args);
  }

  /**
   * Runs `action.run()` and, for navigation-like actions, logs the INTENT
   * before and the REAL outcome after (router URL changed or not), so the
   * "says it will redirect but goes nowhere" case shows up in the log.
   */
  private async runWithNavigationTracking(
    action: VoiceAction,
    args: { query?: string }
  ): Promise<void> {
    const isNav =
      action.id === 'nav.back' ||
      action.id === 'nav.home' ||
      action.id === 'login' ||
      action.id.startsWith('tool.');

    if (!action.run) {
      this.diagnostics.record({
        event_type: isNav ? 'navigation' : 'error',
        interpreted_action: action.id,
        outcome: 'error',
        details: { reason: 'action_has_no_run_handler' },
      });
      return;
    }

    const before = this.router.url;
    if (isNav) {
      this.diagnostics.record({
        event_type: 'navigation',
        interpreted_action: action.id,
        outcome: 'redirect_intended',
        details: { from: before },
      });
    }

    let returned: unknown;
    try {
      returned = await action.run(args);
    } catch (err) {
      this.diagnostics.recordError('assistant_bubble.run', err, { action: action.id });
      return;
    }
    if (!isNav) return;

    if (returned === 'external') {
      this.diagnostics.record({
        event_type: 'navigation',
        interpreted_action: action.id,
        outcome: 'redirect_done',
        details: { external: true },
      });
      return;
    }

    // `location.back()` returns nothing: give the router a moment to react.
    if (returned === undefined && this.router.url === before) {
      await new Promise((r) => setTimeout(r, 1200));
    }
    const after = this.router.url;
    const changed = after !== before;
    const cancelled = returned === false;
    this.diagnostics.record({
      event_type: 'navigation',
      interpreted_action: action.id,
      outcome: changed ? 'navigated' : 'error',
      details: {
        from: before,
        to: after,
        router_result: returned ?? null,
        ...(changed
          ? {}
          : {
              reason: cancelled ? 'navigation_cancelled_or_rejected' : 'router_url_unchanged',
              same_url: returned === true,
            }),
      },
    });
  }

  /** Context-aware opening line: mentions filling the form when there is one to fill. */
  private commandGreeting(): string {
    const closing = this.assistantContext.consumePostActionPrompt();
    if (closing) {
      this.diagnostics.record({
        event_type: 'other',
        details: { step: 'post_action_prompt_spoken', message: closing },
      });
      return closing;
    }
    if (this.assistantContext.formContext()) {
      return '¿Qué quieres? Puedo llenar este formulario, o llevarte a otra parte.';
    }
    return '¿Qué quieres hacer? Puedo buscar un trámite, navegar, o ayudarte.';
  }

  /** Run the active page's form-fill survey (the single "assistant = form filler" flow on form pages). */
  private async startFormFill(): Promise<void> {
    const formCtx = this.assistantContext.formContext();
    if (!formCtx) return;
    try {
      const answers = await this.voiceAssistant?.startSurvey(formCtx.prompts);
      if (answers) formCtx.onComplete(answers);
    } catch {
      /* user cancelled the survey — nothing to do */
    }
  }

  /** Tap handler for a menu item — same execution path as a spoken command. */
  protected runMenuAction(action: VoiceAction): void {
    this.menuOpen = false;
    this.stopSpeaking();
    this.voiceSession.activate();
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
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }
    this.commandSeq++;
    this.stopSpeaking();
    this.listening.set(false);
    this.menuOpen = false;
    if (this.voiceAssistant?.isOpen()) this.voiceAssistant.cancelSurvey();
    if (this.voiceNavigation?.isActive()) this.voiceNavigation.closePanel();
  }
}
