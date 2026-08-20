/**
 * Assistant Context Service
 *
 * Registry of voice capabilities for the transversal Voice Command Layer.
 * The global assistant bubble (`AssistantBubbleComponent`) reads
 * `availableActions()` to know what a free-form spoken order can trigger
 * anywhere in the app: navigate to a tool, go back/home, search, fill the
 * active page's form, or ask for help.
 *
 * Two kinds of actions feed `availableActions()`:
 *
 * 1. GLOBAL actions (computed from `StateService`): always available while a
 *    portal is selected — going back/home, searching, logging in, one
 *    `tool.<docname>` action per enabled tool of the current portal, plus
 *    `fill_form` whenever a page has registered a `formContext`.
 * 2. SCOPED actions: registered by an individual page/tool via
 *    `registerActions(scopeId, actions)` for capabilities that only make
 *    sense there (e.g. "nueva cita" inside `my-appointments`). Pages MUST
 *    call `unregister(scopeId)` in `ngOnDestroy` so a stale action doesn't
 *    leak into another page — same discipline as `formContext`.
 *
 * Pattern for a tool that wants its own voice action (Fase 2 seed — see
 * `MyAppointmentsToolComponent` for a full worked example):
 *
 *   constructor() {
 *     this.assistantContext.registerActions('my-scope-id', [
 *       {
 *         id: 'my_tool.some_action',
 *         description: 'Qué hace, en lenguaje natural (para la IA)',
 *         samplePhrases: ['frase 1', 'frase 2'],
 *         run: () => { ... }, // autonomous execution, sync or async
 *       },
 *     ]);
 *   }
 *
 *   ngOnDestroy(): void {
 *     this.assistantContext.unregister('my-scope-id');
 *   }
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from './state.service';
import { ServicePortal, ServicePortalTool } from '../models/service-portal.model';
import { VoicePrompt } from './voice/voice-prompt.types';

export interface VoiceAction {
  /** Stable id: 'nav.back', 'nav.home', 'tool.<docname>', 'search', 'fill_form', 'help', or a tool-owned id like 'appointments.new'. */
  id: string;
  /** Natural-language description — shown in the help menu and sent to the AI fallback. */
  description: string;
  /** Phrases a citizen might say to trigger this action — used by the local rule matcher and as hints for the AI. */
  samplePhrases: string[];
  /** Autonomous execution. Ignored when `builtin` is set (the bubble drives those itself). */
  run?: (args?: { query?: string }) => void | Promise<void>;
  /** When set, the assistant bubble executes this action with its own hosted engine instead of calling `run`. */
  builtin?: 'search' | 'fill_form';
}

export interface AssistantFormContext {
  title: string;
  prompts: VoicePrompt[];
  onComplete: (answers: Record<string, string>) => void;
}

/**
 * Extra spoken synonyms per `tool_type`, layered on top of each tool's own
 * `label` so both the local rule matcher and the AI fallback recognize more
 * natural phrasing ("agendar cita" as well as whatever the admin labeled the
 * button, e.g. "Citas").
 */
const TOOL_TYPE_SYNONYMS: Record<string, string[]> = {
  meet_scheduling: ['agendar cita', 'programar cita', 'pedir una cita', 'sacar cita'],
  my_appointments: ['mis citas', 'ver mis citas', 'citas agendadas'],
  my_cases: ['mis casos', 'mis radicados', 'mis procesos'],
  procedures: ['tramites', 'solicitar un tramite', 'radicar un tramite'],
  pqr: ['pqr', 'peticion', 'queja', 'reclamo', 'sugerencia', 'radicar pqr'],
  my_pqr: ['mis pqr', 'ver mis pqr', 'mis peticiones'],
  my_logbook: ['mi bitacora', 'mis solicitudes', 'ver mis solicitudes'],
  create_logbook: ['nueva solicitud', 'crear solicitud', 'radicar solicitud'],
  portal_quick_links: ['enlaces', 'accesos directos'],
};

@Injectable({ providedIn: 'root' })
export class AssistantContextService {
  private location = inject(Location);
  private router = inject(Router);
  private stateService = inject(StateService);

  // ============================================================
  // Form context — drives the `fill_form` builtin action.
  // ============================================================

  private _formContext = signal<AssistantFormContext | null>(null);
  readonly formContext = this._formContext.asReadonly();

  /** Register (or replace) the active page's fillable form. Call from `ngOnInit`/`effect()`. */
  setFormContext(ctx: AssistantFormContext): void {
    this._formContext.set(ctx);
  }

  /** Clear the active form context (call from `ngOnDestroy` and whenever the page has no form to offer). */
  clearFormContext(): void {
    this._formContext.set(null);
  }

  // ============================================================
  // Per-scope action registry (Fase 2 extensibility).
  // ============================================================

  private scopedActions = new Map<string, VoiceAction[]>();
  /** Bumped on every register/unregister so `availableActions` recomputes (a plain Map isn't itself a signal). */
  private scopedActionsVersion = signal(0);

  /** Register (or replace) the voice actions owned by one page/tool instance. */
  registerActions(scopeId: string, actions: VoiceAction[]): void {
    this.scopedActions.set(scopeId, actions);
    this.scopedActionsVersion.update((v) => v + 1);
  }

  /** Remove a scope's actions. MUST be called from `ngOnDestroy` alongside `registerActions`. */
  unregister(scopeId: string): void {
    if (this.scopedActions.delete(scopeId)) {
      this.scopedActionsVersion.update((v) => v + 1);
    }
  }

  // ============================================================
  // Global actions — computed from portal/auth state.
  // ============================================================

  private readonly globalActions = computed<VoiceAction[]>(() => {
    const portal = this.stateService.selectedPortal();
    const actions: VoiceAction[] = [
      {
        id: 'nav.back',
        description: 'Volver a la página anterior',
        samplePhrases: ['atras', 'volver', 'regresa', 'regresar', 'anterior'],
        run: () => this.location.back(),
      },
      {
        id: 'help',
        description: 'Mostrar la ayuda del asistente',
        samplePhrases: ['ayuda', 'opciones', 'que puedes hacer', 'que puedo decir'],
      },
    ];

    if (!portal) return actions;

    actions.push({
      id: 'nav.home',
      description: `Ir al inicio del portal ${portal.title || portal.portal_name}`,
      samplePhrases: ['inicio', 'portada', 'menu principal', 'pagina principal'],
      run: () => void this.router.navigate(['/portal', portal.portal_name]),
    });

    actions.push({
      id: 'search',
      description: 'Buscar un trámite o servicio por voz',
      samplePhrases: ['buscar', 'busca', 'necesito', 'encontrar', 'donde encuentro'],
      builtin: 'search',
    });

    if (!this.stateService.isUserContactAuthenticated()) {
      actions.push({
        id: 'login',
        description: 'Iniciar sesión o registrarme',
        samplePhrases: ['iniciar sesion', 'registrarme', 'ingresar', 'iniciar sesion o registrarme'],
        run: () => void this.router.navigate(['/portal', portal.portal_name, 'register']),
      });
    }

    for (const tool of portal.tools || []) {
      if (!tool.is_enabled) continue;
      actions.push(this.buildToolAction(portal, tool));
    }

    return actions;
  });

  private buildToolAction(portal: ServicePortal, tool: ServicePortalTool): VoiceAction {
    const label = this.toolLabel(tool);
    const synonyms = TOOL_TYPE_SYNONYMS[tool.tool_type] || [];
    return {
      id: `tool.${tool.name || tool.tool_type}`,
      description: label,
      samplePhrases: [label, ...synonyms],
      run: () => this.navigateToTool(portal, tool),
    };
  }

  /** Same label precedence used by the portal grid (`PortalViewComponent.getToolLabel`). */
  private toolLabel(tool: ServicePortalTool): string {
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.label) {
      return tool.quick_link_external_data.label;
    }
    return tool.label;
  }

  /** Mirrors `PortalViewComponent.selectTool` so a spoken command behaves exactly like tapping the card. */
  private navigateToTool(portal: ServicePortal, tool: ServicePortalTool): void {
    if (tool.tool_type === 'portal_redirect' && tool.target_portal) {
      this.stateService.setReferrerPortal(portal.portal_name);
      void this.router.navigate(['/portal', tool.target_portal]);
      return;
    }

    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.url) {
      const link = tool.quick_link_external_data;
      if ((link.target || '_blank') === '_self') {
        window.location.href = link.url;
      } else {
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (tool.name) {
      void this.router.navigate(['/portal', portal.portal_name, 'tool', tool.tool_type, tool.name]);
    } else {
      // 2-segment fallback (see app.routes.ts) for tool types whose config doesn't depend on the row.
      void this.router.navigate(['/portal', portal.portal_name, 'tool', tool.tool_type]);
    }
  }

  // ============================================================
  // Combined, read-only action list for the bubble + command router.
  // ============================================================

  readonly availableActions = computed<VoiceAction[]>(() => {
    // Read the version signal purely to make this computed() recompute on register/unregister.
    this.scopedActionsVersion();

    const result: VoiceAction[] = [...this.globalActions()];

    const formCtx = this._formContext();
    if (formCtx) {
      result.push({
        id: 'fill_form',
        description: `Llenar el formulario: ${formCtx.title}`,
        samplePhrases: [
          'llename el formulario',
          'llename',
          'lename el formulario',
          'completar formulario',
          'ayudame con el formulario',
          'ayudame con este formulario',
        ],
        builtin: 'fill_form',
      });
    }

    for (const actions of this.scopedActions.values()) {
      result.push(...actions);
    }

    return result;
  });
}
