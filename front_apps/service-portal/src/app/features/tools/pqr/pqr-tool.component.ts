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
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AssistantContextService, VoiceAction } from '../../../core/services/assistant-context.service';
import { VoicePromptBuilder } from '../../../core/services/voice/voice-prompt-builder.service';
import { PortalQuestionSurveyService } from '../../../core/services/voice/portal-question-survey.service';
import { VoicePrompt } from '../../../core/services/voice/voice-prompt.types';
import { PortalQuestion, AnsweredQuestion } from '../../../core/models/portal-question.model';
import { ServicePortalTool } from '../../../core/models/service-portal.model';
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
  /** Per-type question override (PQR Type's own `question_set`). Preferred over the tool-level `questions` when present. */
  questions?: PortalQuestion[];
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

/**
 * Natural spoken synonyms per PQR type, keyed by a normalized stem found in the
 * type's `label` / `type_code`. Layered on top of the label itself.
 */
const PQR_TYPE_VOICE_SYNONYMS: Array<{ stem: string; phrases: string[] }> = [
  { stem: 'peticion', phrases: ['peticion', 'poner una peticion', 'hacer una peticion', 'solicitud', 'quiero solicitar'] },
  { stem: 'queja', phrases: ['queja', 'poner una queja', 'quiero quejarme', 'quejarme'] },
  { stem: 'reclamo', phrases: ['reclamo', 'reclamacion', 'poner un reclamo', 'poner una reclamacion', 'reclamar', 'quiero reclamar'] },
  { stem: 'sugerencia', phrases: ['sugerencia', 'dar una sugerencia', 'quiero sugerir', 'sugerir'] },
  { stem: 'felicitacion', phrases: ['felicitacion', 'felicitar', 'quiero felicitar', 'dar una felicitacion'] },
  { stem: 'denuncia', phrases: ['denuncia', 'denunciar', 'poner una denuncia', 'quiero denunciar'] },
];

const normalizeVoice = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

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
  private route = inject(ActivatedRoute);
  protected settingsService = inject(SettingsService);
  private promptBuilder = inject(VoicePromptBuilder);
  private questionSurvey = inject(PortalQuestionSurveyService);
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

  /** Tool-level custom questions (this tool's own `question_set`), may be empty. */
  protected toolQuestions = signal<PortalQuestion[]>([]);
  /**
   * Questions actually in effect for the selected type: the type's own
   * `questions` when it has any (per-type override), otherwise the tool's.
   */
  protected effectiveQuestions = computed<PortalQuestion[]>(() => {
    const type = this.selectedType();
    if (type?.questions?.length) return type.questions;
    return this.toolQuestions();
  });
  /**
   * Set by `applyPqrSurveyAnswers` when `effectiveQuestions()` is non-empty:
   * the answers in the structured shape `create_entry_from_portal`'s
   * `answers` param expects. Null when there are no custom questions
   * (falls back to the plain `description` textarea, as before).
   */
  private pendingAnswers: AnsweredQuestion[] | null = null;

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
    // PQR types as page-scoped voice options, only while the list is shown
    // (so "reclamo" picks the type instead of falling into the global search).
    effect(() => {
      const currentView = this.view();
      const available = this.types();
      if (currentView === 'list' && available.length) {
        this.assistantContext.registerActions(
          this.voiceScopeId,
          available.map((t) => this.buildTypeVoiceAction(t))
        );
      } else {
        this.assistantContext.unregister(this.voiceScopeId);
      }
    });

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

  private readonly voiceScopeId = 'pqr-tool-types';

  /** `pqr_type` queryParam waiting to be applied (consumed once types are loaded). */
  private pendingPreselect: string | null = null;
  private queryParamsSub?: Subscription;

  ngOnDestroy(): void {
    this.queryParamsSub?.unsubscribe();
    this.assistantContext.clearFormContext();
    this.assistantContext.unregister(this.voiceScopeId);
  }

  ngOnInit(): void {
    const portal = this.selectedPortal();
    const tool: ServicePortalTool | undefined = this.toolName
      ? portal?.tools.find((t) => String(t.name) === String(this.toolName))
      : portal?.tools.find((t) => t.tool_type === 'pqr');

    if (!tool) {
      this.error.set('La configuración de PQR no se encontró.');
      return;
    }

    this.resolvedToolName = tool.name || '';
    this.toolLabel.set(tool.label || 'PQRs');
    this.toolQuestions.set(tool.questions || []);
    this.queryParamsSub = this.route.queryParamMap.subscribe((params) => {
      const wanted = params.get('pqr_type');
      if (!wanted) return;
      this.pendingPreselect = wanted;
      this.tryPreselectType();
    });
    this.loadTypes();
  }

  /**
   * Applies the `pqr_type` queryParam once: finds the matching type (by
   * name/code/label, accent-insensitive), selects it like a voice pick and
   * starts the guided fill. No match -> the normal type list is left as is.
   * The param is always consumed (removed from the URL) to avoid re-triggering.
   */
  private tryPreselectType(): void {
    const wanted = this.pendingPreselect;
    const available = this.types();
    if (!wanted || !available.length) return; // wait for loadTypes
    this.pendingPreselect = null;

    const w = normalizeVoice(wanted);
    const match =
      available.find((t) =>
        [t.name, t.type_code, t.label].some((v) => normalizeVoice(v || '') === w)
      ) ||
      available.find((t) =>
        [t.type_code, t.label].some((v) => {
          const n = normalizeVoice(v || '');
          return !!n && (n.includes(w) || w.includes(n));
        })
      );

    // Consume the param so later navigations/refreshes don't re-fire it.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pqr_type: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    if (!match || this.createdPQR()) return;
    this.selectType(match);
    this.assistantContext.setFormContext({
      title: 'Nueva PQR',
      prompts: this.buildPqrVoicePrompts(match.label),
      onComplete: (answers) => this.applyPqrSurveyAnswers(answers),
    });
    this.assistantContext.requestFill();
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
        this.tryPreselectType();

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

  /** Voice option for one PQR type: same as tapping its card, then starts the guided fill. */
  private buildTypeVoiceAction(type: PQRType): VoiceAction {
    const labelNorm = normalizeVoice(type.label);
    const codeNorm = normalizeVoice(type.type_code || '');
    const synonyms =
      PQR_TYPE_VOICE_SYNONYMS.find((e) => labelNorm.includes(e.stem) || codeNorm.includes(e.stem))
        ?.phrases || [];
    return {
      id: `pqr.type.${type.name}`,
      description: `Seleccionar el tipo de PQR "${type.label}" y empezar a llenarlo`,
      samplePhrases: [type.label, ...synonyms],
      run: () => {
        this.selectType(type);
        // Set the form context right away (the effect would only do it after the
        // next change-detection pass) so the guided survey can start now.
        this.assistantContext.setFormContext({
          title: 'Nueva PQR',
          prompts: this.buildPqrVoicePrompts(type.label),
          onComplete: (answers) => this.applyPqrSurveyAnswers(answers),
        });
        this.assistantContext.requestFill();
      },
    };
  }

  protected selectType(type: PQRType): void {
    this.selectedType.set(type);
    this.subject.set('');
    this.description.set('');
    this.pendingAnswers = null;
    // Default: if user is anonymous (not logged in), force anonymous submission
    this.sendAsAnonymous.set(this.isAnonymousUser());
    this.view.set('form');
  }

  protected backToList(): void {
    this.view.set('list');
    this.selectedType.set(null);
    this.error.set(null);
    this.pendingAnswers = null;
  }

  protected async submitPQR(): Promise<void> {
    const type = this.selectedType();
    if (!type) return;

    if (!this.canSubmit()) return;

    this.loading.set(true);
    this.error.set(null);

    const isAnonymous = this.isAnonymousUser() ? true : this.sendAsAnonymous();

    // Custom questions (tool- or type-level): send the structured `answers`
    // alongside `description` (kept as a human-readable fallback/summary,
    // auto-filled by `applyPqrSurveyAnswers`) so the backend composes the
    // PQR from the structured Q&A. PQRs without custom questions keep
    // sending only `description`, as before.
    const payload: Record<string, unknown> = {
      pqr_type: type.name,
      subject: this.subject().trim(),
      description: this.description().trim(),
      is_anonymous: isAnonymous ? 1 : 0,
      honeypot: '',
    };
    if (this.pendingAnswers?.length) {
      payload['answers'] = JSON.stringify(this.pendingAnswers);
    }

    try {
      const response = await this.frappeApi.callMethod<CreatedPQR>(
        'pqr_management.api.entries.create_entry_from_portal',
        payload
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.createdPQR.set(data);
        this.view.set('confirm');
        this.assistantContext.announceResult(
          'Listo, tu PQR quedó radicada. ¿Quieres volver al inicio, ver tus PQRs, o hacer otra cosa?'
        );
        this.pendingAnswers = null;
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
    this.pendingAnswers = null;
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
   * `subject` is always asked first (it's a separate required field). Then,
   * when the tool/type has custom `questions` configured, one prompt per
   * question (via `PortalQuestionSurveyService`) replaces the generic
   * `description` prompt. Finally, the anonymous yes/no question is
   * included only when it's actually offered to this citizen (logged-in
   * users where the tool allows anonymous PQRs).
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
    ];

    const customPrompts = this.questionSurvey.buildPrompts(this.effectiveQuestions());
    if (customPrompts) {
      prompts.push(...customPrompts);
    } else {
      prompts.push(
        this.promptBuilder.text({
          key: 'description',
          label: 'descripción',
          question:
            'Cuéntame los detalles del caso. Sé tan específico como quieras: fechas, lugares, personas involucradas y lo que esperas como respuesta.',
          minLength: 10,
        }),
      );
    }

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

  /**
   * `onComplete` for the guided PQR survey. When the tool/type has custom
   * `questions`, keeps the answers structured for `create_entry_from_portal`'s
   * `answers` param (see `submitPQR`); otherwise falls back to the plain
   * `description` answer, as before. Either way `description` ends up
   * showing a human-readable summary so the citizen can review it before
   * enviando.
   */
  private applyPqrSurveyAnswers(answers: Record<string, string>): void {
    if (answers['subject']) this.subject.set(answers['subject']);

    const questions = this.effectiveQuestions();
    if (questions.length) {
      const structured = this.questionSurvey.composeAnswers(questions, answers);
      if (structured.length) {
        this.pendingAnswers = structured;
        this.description.set(this.questionSurvey.composeContextText(structured));
      }
    } else if (answers['description']) {
      this.pendingAnswers = null;
      this.description.set(answers['description']);
    }

    if (this.canAskAnonymous() && answers['is_anonymous'] !== undefined) {
      this.sendAsAnonymous.set(answers['is_anonymous'] === '1');
    }
    // Submit automatically after the guided fill (the citizen asked the
    // assistant to place the PQR, not just fill the fields). submitPQR() guards
    // itself with canSubmit(), so it no-ops if something's missing. On success
    // the view changes and the form context clears, so a later tap won't re-ask.
    setTimeout(() => void this.submitPQR(), 250);
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
