/**
 * Create Logbook Tool Component
 *
 * Allows users to create a Logbook Entry directly from the Service Portal
 * without needing to create an Appointment first.
 */

import { Component, OnInit, OnDestroy, Input, effect, signal, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AssistantContextService } from '../../../core/services/assistant-context.service';
import { VoicePromptBuilder } from '../../../core/services/voice/voice-prompt-builder.service';
import { VoicePrompt } from '../../../core/services/voice/voice-prompt.types';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import {
  AttachmentUploaderComponent,
  UploadedAttachment,
} from '../../../shared/components/attachment-uploader/attachment-uploader.component';

interface CreatedEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  start_date: string;
}

/**
 * Same shape as `ProceduresToolComponent`'s per-trámite `questions` (backend
 * contract from `get_procedures`). No `Service Portal Tool` custom field
 * ships this for `create_logbook` yet (today it only has
 * `logbook_availability` — see the app's CLAUDE.md), so `resolveToolQuestions()`
 * below always returns null in production; wired defensively so this
 * activates automatically the day a backend equivalent config + `answers`
 * param on `create_entry_from_portal` ships for this tool type, mirroring
 * `create_procedure_entry`.
 */
interface ToolQuestion {
  answer_key: string;
  question: string;
  fieldtype: string;
  options: string[];
  reqd: number;
  sort_order: number;
}

/** One answered custom question, in the shape `create_entry_from_portal`'s (future) `answers` param would expect. */
interface AnsweredQuestion {
  answer_key: string;
  question: string;
  answer: string;
}

@Component({
  selector: 'app-create-logbook-tool',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    VoiceInputComponent,
    IconComponent,
    AttachmentUploaderComponent,
  ],
  templateUrl: './create-logbook-tool.component.html',
  styleUrls: ['./create-logbook-tool.component.scss']
})
export class CreateLogbookToolComponent implements OnInit, OnDestroy {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);
  protected settingsService = inject(SettingsService);
  private promptBuilder = inject(VoicePromptBuilder);
  private assistantContext = inject(AssistantContextService);

  @ViewChild(AttachmentUploaderComponent) attachmentUploader?: AttachmentUploaderComponent;

  /**
   * Service Portal Tool docname. Set by ToolRouterComponent from the :toolName
   * route param. Disambiguates portals with several "create_logbook" tools.
   */
  @Input() toolName?: string;

  // State
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI State
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected userContext = signal<string>('');
  /** Label of THIS tool instance (the secretaría), so the header shows where you are. */
  protected toolLabel = signal<string>('Crear Bitácora');
  protected showConfirmModal = signal<boolean>(false);
  protected createdEntry = signal<CreatedEntry | null>(null);

  // Attachments (evidence uploaded before submitting)
  protected attachments = signal<UploadedAttachment[]>([]);
  protected attachmentsUploading = signal<boolean>(false);

  // Config
  private logbookAvailability = '';

  /**
   * Set by `applyGuidedSurveyAnswers` when this tool instance has custom
   * `questions` (see `ToolQuestion`): the answers in the structured shape a
   * future `answers` param would expect. Null (today, always) falls back to
   * the plain `user_context` string, as before.
   */
  private pendingAnswers: AnsweredQuestion[] | null = null;

  constructor() {
    // This tool is a single always-visible form (no list/detail views), so the
    // global assistant bubble just needs the `fill_form` action registered
    // whenever there's actually a form to fill (authenticated citizen,
    // config resolved OK).
    effect(() => {
      if (!this.isAnonymousUser() && !this.error()) {
        this.assistantContext.setFormContext({
          title: 'Describir solicitud',
          prompts: this.buildSurveyPrompts(),
          onComplete: (answers) => this.applyGuidedSurveyAnswers(answers),
        });
      } else {
        this.assistantContext.clearFormContext();
      }
    });
  }

  /**
   * Prompts come from THIS tool instance's own `questions` config (mirrors
   * `ProceduresToolComponent`'s per-trámite `questions`) when configured;
   * otherwise falls back to the fixed 5-question guided survey
   * (qué/cómo/para qué/contexto/cuándo).
   */
  private buildSurveyPrompts(): VoicePrompt[] {
    const questions = this.resolveToolQuestions();
    if (!questions?.length) {
      return this.promptBuilder.guidedRequestSurvey();
    }
    const orderedFields = questions
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q) => ({
        fieldname: q.answer_key,
        label: q.question,
        fieldtype: q.fieldtype,
        options: (q.options || []).join('\n'),
        reqd: q.reqd,
      }));
    return this.promptBuilder.surveyFromFields(orderedFields);
  }

  /** Reads the resolved Service Portal Tool row's `questions` custom field, if any (see `ToolQuestion`). */
  private resolveToolQuestions(): ToolQuestion[] | null {
    const portal = this.selectedPortal();
    const tool = this.toolName
      ? portal?.tools.find((t) => String(t.name) === String(this.toolName))
      : portal?.tools.find((t) => t.tool_type === 'create_logbook');
    const questions = (tool as any)?.questions;
    return Array.isArray(questions) && questions.length ? questions : null;
  }

  ngOnDestroy(): void {
    this.assistantContext.clearFormContext();
  }

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;

    const portal = this.selectedPortal();
    const tool = this.toolName
      ? portal?.tools.find(t => String(t.name) === String(this.toolName))
      : portal?.tools.find(t => t.tool_type === 'create_logbook');

    if (tool) {
      this.toolLabel.set((tool as any).label || 'Crear Bitácora');
    }

    if (tool && (tool as any).logbook_availability) {
      this.logbookAvailability = (tool as any).logbook_availability;
    } else {
      this.error.set('Configuración de disponibilidad no encontrada');
    }
  }

  submitEntry(): void {
    const contact = this.userContact();
    const context = this.userContext();

    if (!contact || !contact.name) {
      this.error.set('No se encontró información de contacto');
      return;
    }

    if (!context || !context.trim()) {
      this.error.set('Por favor describe tu caso o necesidad');
      return;
    }

    if (!this.logbookAvailability) {
      this.error.set('Configuración de disponibilidad no encontrada');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const documents = this.attachments().map((a) => ({ file_url: a.file_url, title: a.file_name }));

    // Mirrors ProceduresToolComponent: when this tool instance has custom
    // questions, send the structured `answers` alongside `user_context`.
    // Today `pendingAnswers` is always null (see `resolveToolQuestions`), so
    // this stays a no-op until `create_entry_from_portal` grows an `answers`
    // param — never sends a kwarg the current backend doesn't accept.
    const payload: Record<string, unknown> = {
      user_contact: contact.name,
      user_context: context.trim(),
      logbook_availability: this.logbookAvailability,
      documents: JSON.stringify(documents),
    };
    if (this.pendingAnswers?.length) {
      payload['answers'] = JSON.stringify(this.pendingAnswers);
    }

    this.frappeApi.callMethod<CreatedEntry>(
      'logbook.api.entries.create_entry_from_portal',
      payload
    ).subscribe({
      next: (response) => {
        if (response?.message) {
          this.createdEntry.set(response.message);
          this.showConfirmModal.set(true);
          this.userContext.set('');
          this.attachments.set([]);
          this.attachmentUploader?.reset();
          this.pendingAnswers = null;
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error creating logbook entry:', err);
        const message = err?.error?.message || err?.error?._server_messages;
        if (message) {
          try {
            const parsed = JSON.parse(message);
            this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Error al crear la entrada');
          } catch {
            this.error.set(typeof message === 'string' ? message : 'Error al crear la entrada');
          }
        } else {
          this.error.set('Error al crear la entrada. Por favor intenta de nuevo.');
        }
        this.loading.set(false);
      }
    });
  }

  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
    this.createdEntry.set(null);
    this.goBack();
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }

  // ============================================================
  // Attachments
  // ============================================================

  protected onAttachmentsChange(attachments: UploadedAttachment[]): void {
    this.attachments.set(attachments);
  }

  protected onAttachmentsUploadingChange(uploading: boolean): void {
    this.attachmentsUploading.set(uploading);
  }

  // ============================================================
  // Voice Assistant integration
  // ============================================================

  get isVoiceAssistantAvailable(): boolean {
    return this.settingsService.isVoiceAssistantEnabled();
  }

  /**
   * `onComplete` for the guided survey, run by the global assistant bubble.
   * When this tool instance has custom `questions` (see
   * `resolveToolQuestions`), keeps the answers structured for a future
   * `answers` param (mirrors `ProceduresToolComponent`); otherwise falls
   * back to the fixed guided survey (qué/cómo/para qué/contexto/cuándo)
   * joined into `user_context`, as before. Either way it fills the
   * `user_context` textarea with a human-readable summary so the citizen can
   * review it before submitting.
   */
  private applyGuidedSurveyAnswers(answers: Record<string, string>): void {
    const questions = this.resolveToolQuestions();
    if (questions?.length) {
      const structured: AnsweredQuestion[] = questions
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((q) => !!answers[q.answer_key])
        .map((q) => ({ answer_key: q.answer_key, question: q.question, answer: answers[q.answer_key] }));

      if (!structured.length) return;

      this.pendingAnswers = structured;
      this.userContext.set(structured.map((a) => `${a.question} ${a.answer}`).join('\n'));
    } else {
      const context = this.promptBuilder.buildGuidedRequestContext(answers);
      if (!context) return;

      this.pendingAnswers = null;
      this.userContext.set(context);
    }

    // Radicar automatically after the guided fill (the citizen asked the
    // assistant to place the solicitud, not just fill the field). On success
    // the view changes and the form context is cleared, so a later tap won't
    // re-ask the same questions.
    setTimeout(() => this.submitEntry(), 250);
  }
}
