/**
 * Procedures Tool Component
 *
 * Shows a list of configured procedures (trámites) for the portal.
 * - Internal procedures: open a form to describe the case, then create a Logbook Entry
 * - External procedures: show an info modal and register a Procedure Request automatically
 */

import { Component, OnInit, signal, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { VoicePromptBuilder } from '../../../core/services/voice/voice-prompt-builder.service';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';
import { VoiceAssistantComponent } from '../../../shared/components/voice-assistant/voice-assistant.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import {
  AttachmentUploaderComponent,
  UploadedAttachment,
} from '../../../shared/components/attachment-uploader/attachment-uploader.component';

interface Procedure {
  name: string;
  title: string;
  description: string;
  icon: string;
  procedure_type: 'internal' | 'external';
  external_info?: string;
  external_url?: string;
}

interface CreatedEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  assigned_area: string;
  start_date: string;
}

type ViewState = 'list' | 'form' | 'confirm' | 'external';

@Component({
  selector: 'app-procedures-tool',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    VoiceInputComponent,
    VoiceAssistantComponent,
    IconComponent,
    AttachmentUploaderComponent,
  ],
  templateUrl: './procedures-tool.component.html',
  styleUrls: ['./procedures-tool.component.scss']
})
export class ProceduresToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);
  protected settingsService = inject(SettingsService);
  private promptBuilder = inject(VoicePromptBuilder);

  @ViewChild(VoiceAssistantComponent) voiceAssistant?: VoiceAssistantComponent;
  @ViewChild(AttachmentUploaderComponent) attachmentUploader?: AttachmentUploaderComponent;

  // Portal state
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI state
  protected view = signal<ViewState>('list');
  protected loading = signal<boolean>(false);
  protected loadingProcedures = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // Procedures list
  protected procedures = signal<Procedure[]>([]);
  protected selectedProcedure = signal<Procedure | null>(null);
  protected expandedDescriptions = signal<Set<string>>(new Set());

  /** Heuristic to decide whether the "Ver más" toggle should appear at all. */
  protected readonly DESCRIPTION_CLAMP_THRESHOLD = 200;

  protected isExpanded(name: string): boolean {
    return this.expandedDescriptions().has(name);
  }

  protected isLong(description?: string): boolean {
    return !!description && description.length > this.DESCRIPTION_CLAMP_THRESHOLD;
  }

  protected toggleDescription(name: string, event: Event): void {
    event.stopPropagation();
    this.expandedDescriptions.update((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Form state (internal procedure)
  protected userContext = signal<string>('');

  // Attachments (evidence uploaded before submitting)
  protected attachments = signal<UploadedAttachment[]>([]);
  protected attachmentsUploading = signal<boolean>(false);

  // Result state
  protected createdEntry = signal<CreatedEntry | null>(null);

  // Config
  private toolName = '';

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;

    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'procedures');

    if (!tool) {
      this.error.set('Configuración de trámites no encontrada');
      return;
    }

    this.toolName = tool.name || '';

    if (!(tool as any).logbook_procedures_config) {
      this.error.set('Esta herramienta no tiene una configuración de trámites asignada');
      return;
    }

    this.loadProcedures();
  }

  private loadProcedures(): void {
    this.loadingProcedures.set(true);
    this.error.set(null);

    this.frappeApi.callMethod<Procedure[]>(
      'logbook.api.procedures.get_procedures',
      { tool_name: this.toolName },
      true
    ).subscribe({
      next: (response) => {
        this.procedures.set(response?.message || []);
        this.loadingProcedures.set(false);
      },
      error: (err) => {
        console.error('Error loading procedures:', err);
        this.error.set('Error al cargar los trámites disponibles');
        this.loadingProcedures.set(false);
      }
    });
  }

  selectProcedure(procedure: Procedure): void {
    this.selectedProcedure.set(procedure);
    this.error.set(null);

    if (procedure.procedure_type === 'internal') {
      this.userContext.set('');
      this.attachments.set([]);
      this.view.set('form');
    } else {
      this.view.set('external');
      this.registerExternalRequest(procedure.name);
    }
  }

  private registerExternalRequest(procedureName: string): void {
    this.frappeApi.callMethod(
      'logbook.api.procedures.register_external_request',
      { procedure_name: procedureName }
    ).subscribe({
      error: (err) => {
        console.error('Error registering external request:', err);
      }
    });
  }

  submitEntry(): void {
    const contact = this.userContact();
    const context = this.userContext();
    const procedure = this.selectedProcedure();

    if (!contact || !contact.name) {
      this.error.set('No se encontró información de contacto');
      return;
    }

    if (!context || !context.trim()) {
      this.error.set('Por favor describe tu caso o necesidad');
      return;
    }

    if (!procedure) {
      this.error.set('No se ha seleccionado un trámite');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const documents = this.attachments().map((a) => ({ file_url: a.file_url, title: a.file_name }));

    this.frappeApi.callMethod<CreatedEntry>(
      'logbook.api.procedures.create_procedure_entry',
      {
        procedure_name: procedure.name,
        user_context: context.trim(),
        documents: JSON.stringify(documents),
      }
    ).subscribe({
      next: (response) => {
        if (response?.message) {
          this.createdEntry.set(response.message);
          this.view.set('confirm');
          this.userContext.set('');
          this.attachments.set([]);
          this.attachmentUploader?.reset();
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error creating procedure entry:', err);
        const message = err?.error?.message || err?.error?._server_messages;
        if (message) {
          try {
            const parsed = JSON.parse(message);
            this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Error al registrar el trámite');
          } catch {
            this.error.set(typeof message === 'string' ? message : 'Error al registrar el trámite');
          }
        } else {
          this.error.set('Error al registrar el trámite. Por favor intenta de nuevo.');
        }
        this.loading.set(false);
      }
    });
  }

  backToList(): void {
    this.view.set('list');
    this.selectedProcedure.set(null);
    this.userContext.set('');
    this.attachments.set([]);
    this.error.set(null);
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

  closeAndGoHome(): void {
    this.view.set('list');
    this.createdEntry.set(null);
    this.selectedProcedure.set(null);
    this.goBack();
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }

  // ============================================================
  // Voice Assistant integration
  // ============================================================

  get isVoiceAssistantAvailable(): boolean {
    return this.settingsService.isVoiceAssistantEnabled();
  }

  /**
   * Guides the citizen through 5 fixed questions (qué/cómo/para qué/contexto/
   * cuándo) and joins the answers into the `user_context` textarea so they
   * can review everything before radicando el trámite.
   */
  async startVoiceAssistant(): Promise<void> {
    if (!this.voiceAssistant) return;

    try {
      const answers = await this.voiceAssistant.startSurvey(this.promptBuilder.guidedRequestSurvey());
      const context = this.promptBuilder.buildGuidedRequestContext(answers);
      if (context) {
        this.userContext.set(context);
      }
    } catch {
      // Cancelado por el usuario
    }
  }
}
