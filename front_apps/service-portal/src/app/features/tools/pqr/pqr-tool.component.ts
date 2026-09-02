/**
 * PQR Tool Component
 *
 * Allows citizens to submit a PQR (Petition, Complaint, Claim, etc.):
 * 1. Shows a list of allowed PQR types (configured per Service Portal Tool)
 * 2. On select: shows a form (subject + description + anonymous toggle)
 * 3. On submit: creates a PQR Entry. Can be authenticated or anonymous.
 *
 * Anonymous submissions are allowed if the tool's config has `pqr_allow_anonymous=1`,
 * OR if the user is not logged in (always treated as anonymous).
 */

import { Component, OnInit, OnDestroy, Input, effect, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AssistantContextService } from '../../../core/services/assistant-context.service';
import { VoicePromptBuilder } from '../../../core/services/voice/voice-prompt-builder.service';
import { VoicePrompt } from '../../../core/services/voice/voice-prompt.types';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';

interface PQRType {
  name: string;
  type_code: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

interface ToolTypesResponse {
  allow_anonymous: boolean;
  types: PQRType[];
}

interface CreatedPQR {
  name: string;
  pqr_type: string;
  subject: string;
  status: string;
  received_at: string;
  is_anonymous: boolean;
}

type ViewState = 'list' | 'form' | 'confirm';

@Component({
  selector: 'app-pqr-tool',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, VoiceInputComponent],
  templateUrl: './pqr-tool.component.html',
  styleUrls: ['./pqr-tool.component.scss']
})
export class PqrToolComponent implements OnInit, OnDestroy {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);
  protected settingsService = inject(SettingsService);
  private promptBuilder = inject(VoicePromptBuilder);
  private assistantContext = inject(AssistantContextService);

  /**
   * Service Portal Tool docname. Set by ToolRouterComponent from the :toolName
   * route param. Disambiguates portals with several "pqr" tools.
   */
  @Input() toolName?: string;

  // Portal state
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI state
  protected view = signal<ViewState>('list');
  protected loading = signal<boolean>(false);
  protected loadingTypes = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // Types list
  protected types = signal<PQRType[]>([]);
  protected allowAnonymous = signal<boolean>(true);
  protected selectedType = signal<PQRType | null>(null);

  // Form state
  protected subject = signal<string>('');
  protected description = signal<string>('');
  /** Label of THIS tool instance (the secretaría), so the header shows where you are. */
  protected toolLabel = signal<string>('PQRs');
  protected sendAsAnonymous = signal<boolean>(false);

  // Result state
  protected createdPQR = signal<CreatedPQR | null>(null);

  // Config: docname of the resolved Service Portal Tool row (used for API calls).
  // Not to be confused with the `toolName` @Input, which is the route param used
  // to pick WHICH row to resolve when the portal has several "pqr" tools.
  private resolvedToolName = '';

  protected canSubmit = computed(() => {
    return (
      !!this.subject().trim() &&
      !!this.description().trim() &&
      !this.loading()
    );
  });

  constructor() {
    // Keep the global assistant bubble's `fill_form` action in sync with the
    // active view: only offered while filling out subject/description for
    // the selected PQR type. The "search" action is global, so citizens can
    // still search another trámite by voice at any time.
    effect(() => {
      const currentView = this.view();
      const type = this.selectedType();
      if (currentView === 'form' && type) {
        this.assistantContext.setFormContext({
          title: 'Nueva PQR',
          prompts: this.buildPqrVoicePrompts(type.label),
          onComplete: (answers) => this.applyPqrSurveyAnswers(answers),
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
    const portal = this.selectedPortal();
    const tool = this.toolName
      ? portal?.tools.find((t: any) => String(t.name) === String(this.toolName))
      : portal?.tools.find((t: any) => t.tool_type === 'pqr');

    if (!tool) {
      this.error.set('La configuración de PQR no se encontró.');
      return;
    }

    this.resolvedToolName = (tool as any).name;
    this.toolLabel.set((tool as any).label || 'PQRs');
    this.loadTypes();
  }

  private async loadTypes(): Promise<void> {
    this.loadingTypes.set(true);
    this.error.set(null);

    try {
      const response = await this.frappeApi.callMethod<ToolTypesResponse>(
        'pqr_management.api.types.get_tool_types',
        { tool_name: this.resolvedToolName },
        true
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.types.set(data.types || []);
        this.allowAnonymous.set(data.allow_anonymous);

        // If user is not logged in and anonymous is not allowed, show error
        if (this.isAnonymousUser() && !data.allow_anonymous) {
          this.error.set('Esta herramienta requiere iniciar sesión.');
        }
      }
    } catch (err: any) {
      console.error('Error loading PQR types:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al cargar los tipos de PQR.'));
    } finally {
      this.loadingTypes.set(false);
    }
  }

  protected selectType(type: PQRType): void {
    this.selectedType.set(type);
    this.subject.set('');
    this.description.set('');
    // Default: if user is anonymous (not logged in), force anonymous submission
    this.sendAsAnonymous.set(this.isAnonymousUser());
    this.view.set('form');
  }

  protected backToList(): void {
    this.view.set('list');
    this.selectedType.set(null);
    this.error.set(null);
  }

  protected async submitPQR(): Promise<void> {
    const type = this.selectedType();
    if (!type) return;

    if (!this.canSubmit()) return;

    this.loading.set(true);
    this.error.set(null);

    const isAnonymous = this.isAnonymousUser() ? true : this.sendAsAnonymous();

    try {
      const response = await this.frappeApi.callMethod<CreatedPQR>(
        'pqr_management.api.entries.create_entry_from_portal',
        {
          pqr_type: type.name,
          subject: this.subject().trim(),
          description: this.description().trim(),
          is_anonymous: isAnonymous ? 1 : 0,
          honeypot: '',
        }
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.createdPQR.set(data);
        this.view.set('confirm');
      }
    } catch (err: any) {
      console.error('Error submitting PQR:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al enviar la PQR.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected closeConfirmAndReturn(): void {
    this.createdPQR.set(null);
    this.view.set('list');
    this.selectedType.set(null);
    this.subject.set('');
    this.description.set('');
    this.goBack();
  }

  protected goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  protected goToRegistration(): void {
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
   * Prompts for the guided PQR survey, run by the global assistant bubble.
   * Includes the anonymous yes/no question only when it's actually offered
   * to this citizen (logged-in users where the tool allows anonymous PQRs).
   */
  private buildPqrVoicePrompts(typeLabelRaw: string): VoicePrompt[] {
    const typeLabel = typeLabelRaw?.toLowerCase() || 'PQR';
    const prompts: VoicePrompt[] = [
      this.promptBuilder.text({
        key: 'subject',
        label: 'asunto',
        question: `¿Cuál es el asunto de tu ${typeLabel}? Resúmelo en una frase corta.`,
        minLength: 3,
        maxLength: 200,
      }),
      this.promptBuilder.text({
        key: 'description',
        label: 'descripción',
        question:
          'Cuéntame los detalles del caso. Sé tan específico como quieras: fechas, lugares, personas involucradas y lo que esperas como respuesta.',
        minLength: 10,
      }),
    ];

    if (this.canAskAnonymous()) {
      prompts.push(
        this.promptBuilder.yesNo({
          key: 'is_anonymous',
          question:
            '¿Quieres enviar esta PQR de forma anónima? Si dices que sí, tu identidad no quedará asociada y no podrás consultar el estado después.',
        }),
      );
    }

    return prompts;
  }

  private canAskAnonymous(): boolean {
    return !this.isAnonymousUser() && this.allowAnonymous();
  }

  /** `onComplete` for the guided PQR survey. */
  private applyPqrSurveyAnswers(answers: Record<string, string>): void {
    if (answers['subject']) this.subject.set(answers['subject']);
    if (answers['description']) this.description.set(answers['description']);
    if (this.canAskAnonymous() && answers['is_anonymous'] !== undefined) {
      this.sendAsAnonymous.set(answers['is_anonymous'] === '1');
    }
  }

  private extractErrorMessage(err: any, fallback: string): string {
    const message = err?.error?.message || err?.error?._server_messages;
    if (message) {
      try {
        const parsed = JSON.parse(message);
        return typeof parsed === 'string'
          ? parsed
          : parsed[0]?.message || fallback;
      } catch {
        return typeof message === 'string' ? message : fallback;
      }
    }
    return err?.message || fallback;
  }
}
