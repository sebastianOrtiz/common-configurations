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
  protected showConfirmModal = signal<boolean>(false);
  protected createdEntry = signal<CreatedEntry | null>(null);

  // Attachments (evidence uploaded before submitting)
  protected attachments = signal<UploadedAttachment[]>([]);
  protected attachmentsUploading = signal<boolean>(false);

  // Config
  private logbookAvailability = '';

  constructor() {
    // This tool is a single always-visible form (no list/detail views), so the
    // global assistant bubble just needs the `fill_form` action registered
    // whenever there's actually a form to fill (authenticated citizen,
    // config resolved OK).
    effect(() => {
      if (!this.isAnonymousUser() && !this.error()) {
        this.assistantContext.setFormContext({
          title: 'Describir solicitud',
          prompts: this.promptBuilder.guidedRequestSurvey(),
          onComplete: (answers) => this.applyGuidedSurveyAnswers(answers),
        });
      } else {
        this.assistantContext.clearFormContext();
      }
    });
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

    this.frappeApi.callMethod<CreatedEntry>(
      'logbook.api.entries.create_entry_from_portal',
      {
        user_contact: contact.name,
        user_context: context.trim(),
        logbook_availability: this.logbookAvailability,
        documents: JSON.stringify(documents),
      }
    ).subscribe({
      next: (response) => {
        if (response?.message) {
          this.createdEntry.set(response.message);
          this.showConfirmModal.set(true);
          this.userContext.set('');
          this.attachments.set([]);
          this.attachmentUploader?.reset();
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
   * `onComplete` for the guided survey (qué/cómo/para qué/contexto/cuándo),
   * run by the global assistant bubble. Joins the answers into the
   * `user_context` textarea so the citizen can review everything before
   * submitting.
   */
  private applyGuidedSurveyAnswers(answers: Record<string, string>): void {
    const context = this.promptBuilder.buildGuidedRequestContext(answers);
    if (context) {
      this.userContext.set(context);
    }
  }
}
