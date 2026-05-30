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
import { SettingsService } from '../../../core/services/settings.service';
import { IconComponent } from '../icon/icon.component';

export interface VoicePrompt {
  /** Field key, used in the returned map */
  key: string;
  /** Question text — spoken aloud and shown on screen */
  question: string;
  /** Optional confirmation phrase after capturing the value */
  confirmTemplate?: (value: string) => string;
  /** Optional client-side sanitizer/validator. Return null/false to mark invalid. */
  sanitize?: (value: string) => string | null;
  /**
   * If true, the user can skip this question by saying things like
   * "no tengo", "saltar", "siguiente", "no aplica", "ninguno".
   * The skip pattern is checked BEFORE the sanitizer runs.
   */
  optional?: boolean;
}

type AssistantState =
  | 'idle'
  | 'greeting'
  | 'asking'
  | 'listening'
  | 'confirming'
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
  private settings = inject(SettingsService);

  @Output() surveyComplete = new EventEmitter<Record<string, string>>();
  @Output() surveyCancelled = new EventEmitter<void>();

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
  private resolveSurvey: ((value: Record<string, string>) => void) | null = null;
  private rejectSurvey: ((reason?: any) => void) | null = null;

  protected language = computed(() => this.settings.settings().voice_assistant.language);
  protected assistantName = computed(() => this.settings.settings().voice_assistant.name);

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
    this.open.set(true);

    return new Promise((resolve, reject) => {
      this.resolveSurvey = resolve;
      this.rejectSurvey = reject;
      void this.runGreeting();
    });
  }

  private async runGreeting(): Promise<void> {
    this.state.set('greeting');
    await this.tts.speak(
      `Hola, soy ${this.assistantName()}. Te voy a hacer algunas preguntas para llenar tus datos. ` +
        `Puedes responder con voz y te confirmaré cada respuesta.`,
      this.language()
    );
    await this.askCurrent();
  }

  private async askCurrent(): Promise<void> {
    const prompt = this.currentPrompt();
    if (!prompt) {
      await this.finish();
      return;
    }

    this.state.set('asking');
    this.capturedValue.set('');
    this.interimText.set('');
    this.errorMessage.set(null);

    await this.tts.speak(prompt.question, this.language());

    // Auto-start listening right after the question
    await this.startListening();
  }

  protected async startListening(): Promise<void> {
    this.state.set('listening');
    this.interimText.set('');

    try {
      const text = await this.stt.listenOnce(this.language(), (t) => this.interimText.set(t));
      const prompt = this.currentPrompt();

      // Skip optional fields when the user says "no tengo", "saltar", etc.
      if (prompt && prompt.optional && this.isSkipPhrase(text)) {
        await this.tts.speak('De acuerdo, saltamos esta pregunta.', this.language());
        await this.skipCurrent();
        return;
      }

      const sanitized = this.applySanitizer(text);

      if (prompt && sanitized) {
        // Valid match → move to confirming with the sanitized value
        this.capturedValue.set(sanitized);
        this.state.set('confirming');
        const confirmText =
          prompt.confirmTemplate?.(sanitized) ||
          `Entendí: ${sanitized}. ¿Es correcto? Di sí para continuar o no para repetir.`;
        await this.tts.speak(confirmText, this.language());
        await this.captureConfirmation();
      } else {
        // No valid match → don't enter "confirming" state, ask again
        this.capturedValue.set('');
        const message = text
          ? `No reconocí "${text}" como una respuesta válida. Repetimos la pregunta.`
          : 'No te escuché. Repetimos la pregunta.';
        await this.tts.speak(message, this.language());
        await this.askCurrent();
      }
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error de reconocimiento de voz');
      this.state.set('error');
    }
  }

  private applySanitizer(text: string): string | null {
    const prompt = this.currentPrompt();
    if (!prompt) return null;
    const cleaned = text.trim();
    if (!cleaned) return null;
    if (prompt.sanitize) return prompt.sanitize(cleaned);
    return cleaned;
  }

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
    try {
      // tts.speak already resolves on onend; no additional delay needed
      // (a tiny yield gives the event loop time to release the mic)
      await this.wait(0);

      // Reset interim text so the user gets fresh visual feedback
      this.interimText.set('');
      const raw = await this.stt.listenOnce(this.language(), (t) => this.interimText.set(t));
      const text = this.normalizeText(raw || '');

      // Broader yes/no vocabulary (Spanish + a few English words)
      const yesPattern = /\b(si|sii+|sip|claro|correcto|confirmo|afirmativo|ok|okay|vale|de acuerdo|yes|yep|acepto)\b/;
      const noPattern = /\b(no|nop|negativo|incorrecto|repetir|repite|cancela|cancelar|otra vez|nope)\b/;

      if (yesPattern.test(text)) {
        await this.acceptCurrent();
        return;
      }

      if (noPattern.test(text)) {
        await this.tts.speak('De acuerdo, repetimos.', this.language());
        await this.askCurrent();
        return;
      }

      // Ambiguous or no audio: re-ask the confirmation only (max 2 retries)
      if (retries < 2) {
        const hint = text
          ? 'No entendí si dijiste sí o no. Por favor responde sí para aceptar o no para repetir.'
          : 'No te escuché. Por favor di sí para aceptar o no para repetir.';
        await this.tts.speak(hint, this.language());
        await this.captureConfirmation(retries + 1);
      } else {
        // Too many retries → fall back to re-asking the field
        await this.tts.speak('Vamos a repetir la pregunta.', this.language());
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

  private async finish(): Promise<void> {
    this.state.set('summary');
    await this.tts.speak(
      'Listo, terminamos. Voy a llenar el formulario con tus datos. Por favor revísalos antes de enviar.',
      this.language()
    );
    this.state.set('done');
    this.surveyComplete.emit({ ...this.answers });
    this.resolveSurvey?.({ ...this.answers });
    this.resolveSurvey = null;
    this.rejectSurvey = null;
    // Auto-close after a short delay
    setTimeout(() => this.open.set(false), 1500);
  }

  protected cancel(): void {
    this.tts.cancel();
    this.open.set(false);
    this.state.set('idle');
    this.surveyCancelled.emit();
    this.rejectSurvey?.(new Error('Cancelado por el usuario'));
    this.resolveSurvey = null;
    this.rejectSurvey = null;
  }

  ngOnDestroy(): void {
    this.tts.cancel();
  }
}
