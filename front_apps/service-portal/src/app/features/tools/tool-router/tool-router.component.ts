/**
 * Tool Router Component
 *
 * Dynamically loads the appropriate tool component based on the :toolType
 * (and optional :toolName) route parameters.
 *
 * IMPORTANT: this subscribes to `route.paramMap` instead of reading
 * `route.snapshot.paramMap` once in ngOnInit. Angular's default RouteReuseStrategy
 * reuses this component instance when only :toolType/:toolName change (e.g. going
 * back to the portal and entering a different tool of the same type). If we only
 * read the snapshot in ngOnInit, ngOnInit never re-runs on that reuse and the
 * previously loaded tool stays mounted showing stale data.
 */

import { Component, OnInit, OnDestroy, inject, Type, ViewContainerRef, ComponentRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

/**
 * Tool types whose component resolves its Service Portal Tool config by
 * docname (via the `toolName` @Input) instead of always taking the first
 * row of that tool_type. Only these get `setInput('toolName', ...)` called,
 * so tool components that don't declare that input are left untouched.
 */
const TOOL_TYPES_WITH_NAME_INPUT = new Set([
  'procedures',
  'create_logbook',
  'pqr',
  'meet_scheduling',
]);

@Component({
  selector: 'app-tool-router',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading) {
      <div style="padding: 20px; text-align: center;">
        <p>Cargando herramienta...</p>
      </div>
    } @else if (error) {
      <div style="padding: 20px; text-align: center;">
        <h2>Herramienta No Encontrada</h2>
        <p>La herramienta "{{ toolType }}" no está disponible.</p>
        <button (click)="goBack()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">
          Volver
        </button>
      </div>
    }
  `
})
export class ToolRouterComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private viewContainerRef = inject(ViewContainerRef);
  private cdr = inject(ChangeDetectorRef);

  toolType: string = '';
  toolName?: string;
  loading = true;
  error = false;

  private componentRef: ComponentRef<any> | null = null;
  private paramsSubscription?: Subscription;
  /** Guards against a stale lazy-loaded chunk resolving after a newer navigation. */
  private loadRequestId = 0;

  ngOnInit() {
    this.paramsSubscription = this.route.paramMap.subscribe((params) => {
      const toolType = params.get('toolType') || '';
      const toolName = params.get('toolName') || undefined;


      this.toolType = toolType;
      this.toolName = toolName;

      void this.loadToolComponent(toolType, toolName);
    });
  }

  private async loadToolComponent(toolType: string, toolName?: string) {
    const requestId = ++this.loadRequestId;

    this.loading = true;
    this.error = false;

    // Clear any existing component immediately so the previous tool doesn't
    // stay visible while the new one's chunk is being fetched, and so we
    // always reinstantiate even when toolType is the same as before.
    this.viewContainerRef.clear();
    this.componentRef = null;
    this.cdr.detectChanges();

    try {
      let ComponentClass: Type<any> | null = null;

      switch (toolType) {
        case 'meet_scheduling':
          const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
          ComponentClass = meetScheduling.MeetSchedulingToolComponent;
          break;

        case 'my_appointments':
          const myAppointments = await import('../my-appointments/my-appointments-tool.component');
          ComponentClass = myAppointments.MyAppointmentsToolComponent;
          break;

        case 'my_cases':
          const myCases = await import('../my-cases/my-cases-tool.component');
          ComponentClass = myCases.MyCasesToolComponent;
          break;

        case 'portal_quick_links':
          const quickLinks = await import('../portal-quick-links/portal-quick-links-tool.component');
          ComponentClass = quickLinks.PortalQuickLinksToolComponent;
          break;

        case 'my_logbook':
          const myLogbook = await import('../my-logbook/my-logbook-tool.component');
          ComponentClass = myLogbook.MyLogbookToolComponent;
          break;

        case 'create_logbook':
          const createLogbook = await import('../create-logbook/create-logbook-tool.component');
          ComponentClass = createLogbook.CreateLogbookToolComponent;
          break;

        case 'procedures':
          const procedures = await import('../procedures/procedures-tool.component');
          ComponentClass = procedures.ProceduresToolComponent;
          break;

        case 'pqr':
          const pqr = await import('../pqr/pqr-tool.component');
          ComponentClass = pqr.PqrToolComponent;
          break;

        case 'my_pqr':
          const myPqr = await import('../my-pqr/my-pqr-tool.component');
          ComponentClass = myPqr.MyPqrToolComponent;
          break;

        default:
          console.warn('[ToolRouter] Unknown tool type:', toolType);
          ComponentClass = null;
      }

      // A newer navigation started while this chunk was loading (e.g. the user
      // navigated again before this import resolved): discard this stale result.
      if (requestId !== this.loadRequestId) {
        return;
      }

      if (ComponentClass) {
        // Clear again in case anything landed in the container while awaiting.
        this.viewContainerRef.clear();
        this.componentRef = this.viewContainerRef.createComponent(ComponentClass);

        if (toolName && TOOL_TYPES_WITH_NAME_INPUT.has(toolType)) {
          this.componentRef.setInput('toolName', toolName);
        }

        this.loading = false;
        this.error = false;
      } else {
        this.error = true;
        this.loading = false;
      }
      this.cdr.detectChanges();
    } catch (err) {
      if (requestId !== this.loadRequestId) {
        return;
      }
      console.error('[ToolRouter] Error loading component:', err);
      this.error = true;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  goBack() {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }

  ngOnDestroy() {
    this.paramsSubscription?.unsubscribe();
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
