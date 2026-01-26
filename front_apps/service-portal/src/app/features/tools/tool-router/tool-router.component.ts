/**
 * Tool Router Component
 *
 * Dynamically loads the appropriate tool component based on the :toolType route parameter
 */

import { Component, OnInit, OnDestroy, inject, Type, ViewContainerRef, ComponentRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

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
  loading = true;
  error = false;
  private componentRef: ComponentRef<any> | null = null;

  async ngOnInit() {
    console.log('[ToolRouter] Component initialized');

    // Get toolType from parent route parameter
    this.toolType = this.route.snapshot.paramMap.get('toolType') || '';
    console.log('[ToolRouter] Tool type:', this.toolType);

    // Load the appropriate component based on toolType
    await this.loadToolComponent(this.toolType);
  }

  private async loadToolComponent(toolType: string) {
    console.log('[ToolRouter] Loading component for:', toolType);
    this.loading = true;
    this.error = false;

    try {
      let ComponentClass: Type<any> | null = null;

      switch (toolType) {
        case 'meet_scheduling':
          const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
          ComponentClass = meetScheduling.MeetSchedulingToolComponent;
          console.log('[ToolRouter] Loaded meet_scheduling component:', ComponentClass);
          break;

        case 'case_management':
          const caseManagement = await import('../case-management/case-management-tool.component');
          ComponentClass = caseManagement.CaseManagementToolComponent;
          console.log('[ToolRouter] Loaded case_management component:', ComponentClass);
          break;

        // Add more tool types here as needed
        // case 'document_viewer':
        //   const docViewer = await import('../document-viewer/document-viewer-tool.component');
        //   ComponentClass = docViewer.DocumentViewerToolComponent;
        //   break;

        default:
          console.warn('[ToolRouter] Unknown tool type:', toolType);
          this.error = true;
          this.loading = false;
          this.cdr.detectChanges();
          return;
      }

      if (ComponentClass) {
        // Clear any existing component
        this.viewContainerRef.clear();

        // Create the component dynamically
        this.componentRef = this.viewContainerRef.createComponent(ComponentClass);
        console.log('[ToolRouter] Component created successfully');
        this.loading = false;
        this.cdr.detectChanges();
      } else {
        this.error = true;
        this.loading = false;
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('[ToolRouter] Error loading component:', error);
      this.error = true;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  goBack() {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }

  ngOnDestroy() {
    // Clean up component reference
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
