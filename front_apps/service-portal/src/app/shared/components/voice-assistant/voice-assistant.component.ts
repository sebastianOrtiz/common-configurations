/**
 * Voice Assistant Component
 *
 * Floating button + dialog panel that drives a guided voice survey over a
 * sequence of prompts. Each prompt asks for one piece of data; the assistant
 * speaks the question, listens, transcribes, lets the user confirm, and
 * moves to the next prompt.
 *
 * MVP — no AI. Just transcribes voice → text into each field.
 * Visibility is controlled by SettingsService.voice_assistant.enabled.
 *
 * Usage from a parent component:
 *
 *   <app-voice-assistant #va></app-voice-assistant>
 *
 *   const result = await va.startSurvey([
 *     { key: 'full_name', question: '¿Cuál es tu nombre completo?' },
 *     { key: 'document',  question: '¿Cuál es tu número de documento?' },
 *   ]);
 *   // result = { full_name: 'Juan Pérez', document: '12345678' }
 */

import {
  Component,
  Input,
  computed,
  inject,
  signal,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TtsService } from '../../../core/services/voice/tts.service';
import { SttService } from '../../../core/services/voice/stt.service';
import { SoundService } from '../../../core/services/voice/sound.service';
import { SettingsService } from '../../../core/services/settings.service';
import { VoicePrompt } from '../../../core/services/voice/voice-prompt.types';
import { IconComponent } from '../icon/icon.component';

// Re-export so existing consumers (e.g. contact-registration) keep working
export type { VoicePrompt };

type AssistantState =
  | 'idle'
  | 'greeting'
  | 'asking'
  | 'listening'
  | 'confirming'
  | 'reviewing'
  | 'summary'
  | 'done'
  | 'error';

@Component({
  selector: 'app-voice-assistant',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './voice-assistant.component.html',
  styleUrls: ['./voice-assistant.component.scss'],
})
export class VoiceAssistantComponent implements OnDestroy {
  private tts = inject(TtsService);
  private stt = inject(SttService);
  private sound = inject(SoundService);
  private settings = inject(SettingsService);

  @Output() surveyComplete = new EventEmitter<Record<string, string>>();
  @Output() surveyCancelled = new EventEmitter<void>();

  /**
   * When true, this component is hosted by the global assistant bubble
   * (`AssistantBubbleComponent`) rather than embedded inline in a page.
   * The component has never rendered its own floating launcher button (it's
   * always been driven externally via `startSurvey()`), so this flag is
   * mostly a documented contract for consistency with `VoiceNavigationComponent`.
   */
  @Input() embedded = false;

  /** Whole-feature visibility (only shown if enabled in settings AND browser supports STT) */
  readonly featureAvailable = computed(() => {
    return (
      this.settings.settings().voice_assistant.enabled &&
      this.tts.isSupported() &&
      this.stt.isSupported()
    );
  });

  /** Visibility of the floating panel */
  protected open = signal<boolean>(false);
  protected state = signal<AssistantState>('idle');
  protected currentIndex = signal<number>(0);
  protected interimText = signal<string>('');
  protected capturedValue = signal<string>('');
  protected errorMessage = signal<string | null>(null);

  private _prompts = signal<VoicePrompt[]>([]);
  protected prompts = this._prompts.asReadonly();
  private answers: Record<string, string> = {};
  /** Set to true when the user cancels; every async step checks this and bails out. */
  private aborted = false;
  private resolveSurvey: ((value: Record<string, string>) => void) | null = null;
  private rejectSurvey: ((reason?: any) => void) | null = null;

  protected language = computed(() => this.settings.settings().voice_assistant.language);
  protected assistantName = computed(() => this.settings.settings().voice_assistant.name);
  protected gender = computed(() => this.settings.settings().voice_assistant.gender);

  /** Helper so every TTS call uses both language AND configured gender */
  private async say(text: string): Promise<void> {
    return this.tts.speak(text, this.language(), this.gender());
  }

  protected currentPrompt = computed(() => {
    const i = this.currentIndex();
    return this._prompts()[i] || null;
  });

  protected progress = computed(() => {
    const total = this._prompts().length;
    const current = this.currentIndex();
    return total ? Math.round((current / total) * 100) : 0;
  });

  /**
   * Run a guided survey. Resolves with the answers when finished,
   * rejects if the user cancels.
   */
  startSurvey(prompts: VoicePrompt[]): Promise<Record<string, string>> {
    if (!this.featureAvailable()) {
      return Promise.reject(new Error('Asistente de voz no disponible'));
    }

    this._prompts.set(prompts);
    this.answers = {};
    this.currentIndex.set(0);
    this.errorMessage.set(null);
    this.aborted = false;
    this.open.set(true);

    return new Promise((resolve, reject) => {
      this.resolveSurvey = resolve;
      this.rejectSurvey = reject;
      void this.runGreeting();
    });
  }

  private async runGreeting(): Promise<void> {
    if (this.aborted) return;
    this.state.set('greeting');
    await this.say(
      `Hola, soy ${this.assistantName()}. Te voy a hacer algunas preguntas para llenar tus datos. ` +
        `Puedes responder con voz y te confirmaré cada respuesta.`
    );
    if (this.aborted) return;
    await this.askCurrent();
  }

  private async askCurrent(): Promise<void> {
    if (this.aborted) return;
    const prompt = this.currentPrompt();
    if (!prompt) {
      await this.finish();
      return;
    }

    this.state.set('asking');
    this.capturedValue.set('');
    this.interimText.set('');
    this.errorMessage.set(null);

    await this.say(prompt.question);
    if (this.aborted) return;

    // Auto-start listening right after the question
    await this.startListening();
  }

  protected async startListening(): Promise<void> {
    if (this.aborted) return;
    this.state.set('listening');
    this.interimText.set('');
    this.sound.beepStart();

    try {
      const text = await this.stt.listenOnce(this.language(), (t) => this.interimText.set(t));
      if (this.aborted) return;
      this.sound.beepEnd();
      const prompt = this.currentPrompt();

      // Control commands take precedence
      const command = this.detectControlCommand(text);
      if (command === 'back') {
        await this.goToPrevious();
        return;
      }
      if (command === 'cancel') {
        this.cancel();
        return;
      }
      if (command === 'repeat') {
        await this.askCurrent();
        return;
      }

      // Skip optional fields when the user says "no tengo", "saltar", etc.
      if (prompt && prompt.optional && this.isSkipPhrase(text)) {
        await this.say('De acuerdo, saltamos esta pregunta.');
        await this.skipCurrent();
        return;
      }

      const sanitized = this.applySanitizer(text);

      if (prompt && sanitized) {
        this.capturedValue.set(sanitized);

        // Binary prompts (yes/no) skip the redundant read-back confirmation.
        if (prompt.skipConfirmation) {
          await this.acceptCurrent();
          return;
        }

        // Valid match → move to confirming with the sanitized value
        this.state.set('confirming');
        const confirmText =
          prompt.confirmTemplate?.(sanitized) ||
          `Entendí: ${sanitized}. ¿Es correcto? Di sí para continuar o no para repetir.`;
        await this.say(confirmText);
        if (this.aborted) return;
        await this.captureConfirmation();
      } else {
        // No valid match → don't enter "confirming" state, ask again
        this.capturedValue.set('');
        let message: string;
        if (this._lastValidationError) {
          message = this._lastValidationError;
          this._lastValidationError = null;
        } else if (text) {
          message = `No reconocí "${text}" como una respuesta válida. Repetimos la pregunta.`;
        } else {
          message = 'No te escuché. Repetimos la pregunta.';
        }
        await this.say(message);
        if (this.aborted) return;
        await this.askCurrent();
      }
    } catch (err: any) {
      if (this.aborted) return;
      this.errorMessage.set(err?.message || 'Error de reconocimiento de voz');
      this.state.set('error');
    }
  }

  private applySanitizer(text: string): string | null {
    const prompt = this.currentPrompt();
    if (!prompt) return null;
    const cleaned = text.trim();
    if (!cleaned) return null;

    const sanitized = prompt.sanitize ? prompt.sanitize(cleaned) : cleaned;
    if (!sanitized) return null;

    // Length validation
    if (prompt.minLength && sanitized.length < prompt.minLength) {
      this._lastValidationError = `Esa respuesta es muy corta. Necesito al menos ${prompt.minLength} caracteres.`;
      return null;
    }
    if (prompt.maxLength && sanitized.length > prompt.maxLength) {
      // Truncate instead of rejecting
      return sanitized.substring(0, prompt.maxLength);
    }
    return sanitized;
  }

  private _lastValidationError: string | null = null;

  /** Normalize text removing diacritics for robust matching. */
  private normalizeText(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /** Wait a few ms to let the browser flush TTS audio before opening the mic. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Listen for yes/no after a confirmation prompt.
   * If the answer is ambiguous or no audio is captured, re-ask only the
   * confirmation (not the whole question), up to 2 retries.
   */
  private async captureConfirmation(retries: number = 0): Promise<void> {
    if (this.aborted) return;
    try {
      // tts.speak already resolves on onend; no additional delay needed
      // (a tiny yield gives the event loop time to release the mic)
      await this.wait(0);
      if (this.aborted) return;

      // Reset interim text so the user gets fresh visual feedback
      this.interimText.set('');
      this.sound.beepStart();
      const raw = await this.stt.listenOnce(this.language(), (t) => this.interimText.set(t));
      if (this.aborted) return;
      this.sound.beepEnd();
      const text = this.normalizeText(raw || '');

      // Control commands also work during confirmation
      const command = this.detectControlCommand(raw || '');
      if (command === 'back') {
        await this.goToPrevious();
        return;
      }
      if (command === 'cancel') {
        this.cancel();
        return;
      }

      // Broader yes/no vocabulary (Spanish + a few English words)
      const yesPattern = /\b(si|sii+|sip|claro|correcto|confirmo|afirmativo|ok|okay|vale|de acuerdo|yes|yep|acepto)\b/;
      const noPattern = /\b(no|nop|negativo|incorrecto|repetir|repite|cancela|cancelar|otra vez|nope)\b/;

      if (yesPattern.test(text)) {
        await this.acceptCurrent();
        return;
      }

      if (noPattern.test(text)) {
        await this.say('De acuerdo, repetimos.');
        await this.askCurrent();
        return;
      }

      // Ambiguous or no audio: re-ask the confirmation only (max 2 retries)
      if (retries < 2) {
        const hint = text
          ? 'No entendí si dijiste sí o no. Por favor responde sí para aceptar o no para repetir.'
          : 'No te escuché. Por favor di sí para aceptar o no para repetir.';
        await this.say(hint);
        await this.captureConfirmation(retries + 1);
      } else {
        // Too many retries → fall back to re-asking the field
        await this.say('Vamos a repetir la pregunta.');
        await this.askCurrent();
      }
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error de reconocimiento de voz');
      this.state.set('error');
    }
  }

  protected async acceptCurrent(): Promise<void> {
    const prompt = this.currentPrompt();
    const value = this.capturedValue();
    if (!prompt || !value) return;

    this.answers[prompt.key] = value;
    this.currentIndex.update((i) => i + 1);

    if (this.currentIndex() >= this._prompts().length) {
      await this.finish();
    } else {
      await this.askCurrent();
    }
  }

  protected async repeatCurrent(): Promise<void> {
    await this.askCurrent();
  }

  /**
   * Skip the current optional prompt without saving an answer.
   */
  protected async skipCurrent(): Promise<void> {
    const prompt = this.currentPrompt();
    if (!prompt) return;

    // Don't save anything; just advance.
    this.currentIndex.update((i) => i + 1);

    if (this.currentIndex() >= this._prompts().length) {
      await this.finish();
    } else {
      await this.askCurrent();
    }
  }

  /**
   * Detect control commands the user can use at any point in the survey.
   * Returns null if not a control command (so the text is treated as an answer).
   *
   * - back: "atrás", "volver", "anterior", "regresa"
   * - cancel: "cancelar", "salir", "terminar"
   * - repeat: "repetir", "repite", "otra vez", "no entendí" (cuando el asistente preguntó)
   */
  private detectControlCommand(text: string): 'back' | 'cancel' | 'repeat' | null {
    const norm = this.normalizeText(text || '');
    if (!norm) return null;

    // Order matters: more specific patterns first
    if (/\b(cancelar|cancela|salir|sal del asistente|terminar|abortar|adios)\b/.test(norm)) {
      return 'cancel';
    }
    if (/\b(atras|volver|anterior|regresa|regresar|previa|pregunta anterior|vuelve)\b/.test(norm)) {
      return 'back';
    }
    if (/^(repetir|repite|repeti|otra vez|de nuevo|no entendi|no escuche)$/.test(norm)) {
      return 'repeat';
    }
    return null;
  }

  /**
   * Go back to the previous prompt. Clears the answer of the previous field
   * so the user can re-record it.
   */
  protected async goToPrevious(): Promise<void> {
    const idx = this.currentIndex();
    if (idx === 0) {
      await this.say('Estás en la primera pregunta. No hay una pregunta anterior.');
      await this.askCurrent();
      return;
    }
    this.currentIndex.update((i) => i - 1);
    const prev = this.currentPrompt();
    if (prev) {
      delete this.answers[prev.key];
    }
    await this.say('De acuerdo, volvemos a la pregunta anterior.');
    await this.askCurrent();
  }

  /**
   * Detect skip phrases (only honored when the current prompt is optional).
   * Examples: "no tengo", "saltar", "siguiente", "no aplica", "ninguno",
   * "paso", "omitir", "no quiero responder", "sin correo".
   */
  private isSkipPhrase(text: string): boolean {
    const norm = this.normalizeText(text || '');
    if (!norm) return false;
    return /\b(no tengo|no aplica|ninguno|ninguna|saltar|salta|siguiente|paso|omitir|omite|no quiero|prefiero no|sin (correo|email|telefono)|no hay|nada)\b/.test(
      norm
    );
  }

  /**
   * Returns the captured answers as an ordered list with their prompt metadata.
   * Used by the review screen to display the summary.
   */
  protected reviewEntries(): Array<{ key: string; label: string; value: string }> {
    return this._prompts()
      .filter((p) => this.answers[p.key])
      .map((p) => {
        // Try to extract a clean label from the question (everything before the first ?)
        const labelMatch = p.question.match(/^¿.*?\b(\w[\w\s]+?)\?/i);
        const fallback = p.question.replace(/\?.*/, '').replace(/^¿/, '').trim();
        return {
          key: p.key,
          label: labelMatch ? labelMatch[1] : fallback,
          value: this.answers[p.key],
        };
      });
  }

  /**
   * Go back to a specific prompt to edit its answer.
   */
  protected async editField(key: string): Promise<void> {
    const idx = this._prompts().findIndex((p) => p.key === key);
    if (idx < 0) return;
    this.currentIndex.set(idx);
    delete this.answers[key];
    await this.say('De acuerdo, repitamos esa pregunta.');
    await this.askCurrent();
  }

  /**
   * Confirm the survey from the review screen and complete it.
   */
  protected async confirmReview(): Promise<void> {
    await this.completeSurvey();
  }

  private async finish(): Promise<void> {
    if (this.aborted) return;
    // Enter review state: show captured answers and allow editing
    this.state.set('reviewing');
    await this.say(
      'Listo, terminamos. Revisa el resumen. Para confirmar di "sí" o "confirmar". Si quieres cambiar algo di "editar" y el nombre del campo, o usa los botones.'
    );
    if (this.aborted) return;
    await this.captureReviewResponse();
  }

  /**
   * Listen for the user's voice response on the review screen.
   * - "sí" / "confirmar" / "acepto" → complete the survey
   * - "no" / "cambiar" → ask which field (or hint to use buttons)
   * - "editar <campo>" → jump to that field for editing
   * - "atrás" → go back to the last prompt
   * - "cancelar" → cancel the survey
   * If nothing valid is captured, hint and wait (the user can still use buttons).
   */
  private async captureReviewResponse(retries: number = 0): Promise<void> {
    if (this.aborted) return;
    if (this.state() !== 'reviewing') return; // safety: user may have already clicked a button

    try {
      this.interimText.set('');
      this.sound.beepStart();
      const raw = await this.stt.listenOnce(this.language(), (t) => this.interimText.set(t));
      if (this.aborted) return;
      this.sound.beepEnd();
      if (this.state() !== 'reviewing') return; // user clicked confirm/edit during listen
      const text = this.normalizeText(raw || '');

      // Universal control commands
      const command = this.detectControlCommand(raw || '');
      if (command === 'cancel') {
        this.cancel();
        return;
      }
      if (command === 'back') {
        // Edit the last captured field
        const entries = this.reviewEntries();
        if (entries.length > 0) {
          await this.editField(entries[entries.length - 1].key);
        }
        return;
      }

      // Yes → confirm
      const yesPattern =
        /\b(si|sii+|sip|claro|correcto|confirmo|confirmar|acepto|afirmativo|ok|okay|vale|de acuerdo|todo bien|esta bien|listo|enviar)\b/;
      if (yesPattern.test(text)) {
        await this.completeSurvey();
        return;
      }

      // Edit a specific field: "editar nombre", "cambiar correo", "modifica telefono"
      const editMatch = text.match(/\b(editar|edita|cambiar|cambia|modificar|modifica|corregir|corrige)\s+(.+)/);
      if (editMatch) {
        const target = editMatch[2].trim();
        const matchedKey = this.findFieldByText(target);
        if (matchedKey) {
          await this.editField(matchedKey);
          return;
        }
        // Couldn't match the field name
        await this.say(
          `No encontré un campo que coincida con "${target}". Por favor di el nombre de uno de los campos del resumen o usa los botones.`
        );
        if (this.aborted) return;
        await this.captureReviewResponse(retries + 1);
        return;
      }

      // Plain "no" / "cambiar" without a target field
      const noPattern = /\b(no|nop|incorrecto|cambiar|cambia|editar|edita|corregir)\b/;
      if (noPattern.test(text)) {
        const entries = this.reviewEntries();
        const list = entries.map((e) => e.label).join(', ');
        await this.say(
          `Los campos disponibles para editar son: ${list}. Di "editar" y el nombre del campo que quieres cambiar.`
        );
        if (this.aborted) return;
        await this.captureReviewResponse(retries + 1);
        return;
      }

      // Nothing matched
      if (retries < 2) {
        const hint = text
          ? 'No entendí. Di "sí" para confirmar, o "editar" y el nombre del campo para cambiarlo.'
          : 'No te escuché. Di "sí" para confirmar o usa los botones.';
        await this.say(hint);
        if (this.aborted) return;
        await this.captureReviewResponse(retries + 1);
      }
      // After max retries we stop listening — user can still use the buttons.
    } catch (err: any) {
      if (this.aborted) return;
      this.errorMessage.set(err?.message || 'Error de reconocimiento de voz');
      this.state.set('error');
    }
  }

  /**
   * Find a prompt key by matching the spoken text against the prompt's label.
   * Uses normalized comparison (lowercase, no diacritics) and partial match.
   */
  private findFieldByText(spoken: string): string | null {
    const target = this.normalizeText(spoken);
    if (!target) return null;
    const entries = this.reviewEntries();

    // Exact label match first
    for (const e of entries) {
      const label = this.normalizeText(e.label);
      if (label === target) return e.key;
    }
    // Partial match (one contains the other)
    for (const e of entries) {
      const label = this.normalizeText(e.label);
      if (label.includes(target) || target.includes(label)) return e.key;
    }
    return null;
  }

  private async completeSurvey(): Promise<void> {
    this.state.set('summary');
    await this.say(
      'Perfecto. Llenamos el formulario con tus datos. Por favor revísalos antes de enviar.'
    );
    this.state.set('done');
    this.surveyComplete.emit({ ...this.answers });
    this.resolveSurvey?.({ ...this.answers });
    this.resolveSurvey = null;
    this.rejectSurvey = null;
    // Auto-close after a short delay
    setTimeout(() => this.open.set(false), 1500);
  }

  /** Public: lets the global assistant bubble know whether the panel is currently showing. */
  readonly isOpen = this.open.asReadonly();

  /**
   * Public entry point for the global assistant bubble: cancels the
   * in-progress survey (if any) and closes the panel. Used e.g. when the
   * user navigates to another route mid-survey so no panel is left dangling.
   */
  cancelSurvey(): void {
    if (this.open()) this.cancel();
  }

  protected cancel(): void {
    // 1. Stop any pending async work in the survey flow
    this.aborted = true;
    // 2. Cancel any speech currently playing
    this.tts.cancel();
    // 3. Close panel and reset visible state
    this.open.set(false);
    this.state.set('idle');
    this.interimText.set('');
    this.capturedValue.set('');
    // 4. Notify caller and clear promise handles
    this.surveyCancelled.emit();
    this.rejectSurvey?.(new Error('Cancelado por el usuario'));
    this.resolveSurvey = null;
    this.rejectSurvey = null;
  }

  ngOnDestroy(): void {
    this.tts.cancel();
  }
}
