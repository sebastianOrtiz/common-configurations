/**
 * Procedures Tool Component
 *
 * Shows a list of configured procedures (trámites) for the portal.
 * - Internal procedures: open a form to describe the case, then create a Logbook Entry
 * - External procedures: show an info modal and register a Procedure Request automatically
 */

import { Component, OnInit, OnDestroy, Input, effect, signal, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
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
    IconComponent,
    AttachmentUploaderComponent,
  ],
  templateUrl: './procedures-tool.component.html',
  styleUrls: ['./procedures-tool.component.scss']
})
export class ProceduresToolComponent implements OnInit, OnDestroy {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected settingsService = inject(SettingsService);
  private promptBuilder = inject(VoicePromptBuilder);
  private assistantContext = inject(AssistantContextService);

  @ViewChild(AttachmentUploaderComponent) attachmentUploader?: AttachmentUploaderComponent;

  /**
   * Service Portal Tool docname. Set by ToolRouterComponent from the :toolName
   * route param. Disambiguates portals with several "procedures" tools (one per
   * secretaría) — without it we'd always resolve the first row of that type.
   */
  @Input() toolName?: string;

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

  // Config: docname of the resolved Service Portal Tool row (used for API calls).
  // Not to be confused with the `toolName` @Input, which is the route param used
  // to pick WHICH row to resolve when the portal has several "procedures" tools.
  private resolvedToolName = '';

  // ============================================================
  // Deep-link auto-open (?procedure=<name> query param, e.g. from voice navigation)
  // ============================================================

  /** Latest value of the `procedure` queryParam, applied once the list is loaded. */
  private pendingDeepLinkProcedure: string | null = null;
  /** Avoids re-opening the same procedure on every emission/route reuse. */
  private lastAutoOpenedProcedure: string | null = null;
  private queryParamsSubscription?: Subscription;

  constructor() {
    // Keep the global assistant bubble's `fill_form` action in sync with the
    // active view: only offered while filling out the internal-procedure
    // description (guided survey). The "search" action is global, so
    // citizens can still search another trámite by voice at any time.
    effect(() => {
      const currentView = this.view();
      if (currentView === 'form') {
        this.assistantContext.setFormContext({
          title: 'Describir trámite',
          prompts: this.promptBuilder.guidedRequestSurvey(),
          onComplete: (answers) => this.applyGuidedSurveyAnswers(answers),
        });
      } else {
        this.assistantContext.clearFormContext();
      }
    });
  }

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;

    const portal = this.selectedPortal();
    const tool = this.toolName
      ? portal?.tools.find(t => String(t.name) === String(this.toolName))
      : portal?.tools.find(t => t.tool_type === 'procedures');

    if (!tool) {
      this.error.set('Configuración de trámites no encontrada');
      return;
    }

    this.resolvedToolName = tool.name || '';

    if (!(tool as any).logbook_procedures_config) {
      this.error.set('Esta herramienta no tiene una configuración de trámites asignada');
      return;
    }

    this.loadProcedures();

    // Deep-link support (e.g. voice navigation): subscribe rather than reading
    // the snapshot once, because Angular reuses this component instance when
    // only the `procedure` queryParam changes (the :toolName path param stays
    // the same), so a later voice search landing on the same tool wouldn't
    // otherwise trigger a fresh auto-open.
    this.queryParamsSubscription = this.route.queryParamMap.subscribe((params) => {
      this.pendingDeepLinkProcedure = params.get('procedure');
      this.tryAutoOpenDeepLinkProcedure();
    });
  }

  ngOnDestroy(): void {
    this.queryParamsSubscription?.unsubscribe();
    this.assistantContext.clearFormContext();
  }

  /**
   * Auto-opens the procedure named by the `?procedure=` queryParam, as if the
   * citizen had clicked its card. Called both when the queryParam changes and
   * after the procedures list finishes loading (whichever happens last).
   * Silently ignores an unknown/missing procedure name.
   */
  private tryAutoOpenDeepLinkProcedure(): void {
    const procedureName = this.pendingDeepLinkProcedure;
    if (!procedureName) return;
    if (this.loadingProcedures()) return; // wait for the list to be ready
    if (this.view() !== 'list') return; // don't interrupt an in-progress view
    if (this.lastAutoOpenedProcedure === procedureName) return; // already handled

    const match = this.procedures().find((p) => p.name === procedureName);
    if (!match) return; // unknown procedure: ignore without breaking the view

    this.lastAutoOpenedProcedure = procedureName;
    this.selectProcedure(match);
  }

  private loadProcedures(): void {
    this.loadingProcedures.set(true);
    this.error.set(null);

    this.frappeApi.callMethod<Procedure[]>(
      'logbook.api.procedures.get_procedures',
      { tool_name: this.resolvedToolName },
      true
    ).subscribe({
      next: (response) => {
        this.procedures.set(response?.message || []);
        this.loadingProcedures.set(false);
        this.tryAutoOpenDeepLinkProcedure();
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
  // Voice Assistant integration
  // ============================================================

  get isVoiceAssistantAvailable(): boolean {
    return this.settingsService.isVoiceAssistantEnabled();
  }

  /**
   * `onComplete` for the guided survey (qué/cómo/para qué/contexto/cuándo),
   * run by the global assistant bubble. Joins the answers into the
   * `user_context` textarea so the citizen can review everything before
   * radicando el trámite.
   */
  private applyGuidedSurveyAnswers(answers: Record<string, string>): void {
    const context = this.promptBuilder.buildGuidedRequestContext(answers);
    if (context) {
      this.userContext.set(context);
    }
  }
}
