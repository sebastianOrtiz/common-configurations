/**
 * Tool Router Component
 *
 * Dynamically loads the appropriate tool component based on the :toolType route parameter
 */

import { Component, OnInit, inject, Type } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tool-router',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      @if (toolComponent) {
        <ng-container *ngComponentOutlet="toolComponent" />
      } @else if (loading) {
        <div style="padding: 20px; text-align: center;">
          <p>Cargando herramienta...</p>
        </div>
      } @else {
        <div style="padding: 20px; text-align: center;">
          <h2>Herramienta No Encontrada</h2>
          <p>La herramienta "{{ toolType }}" no está disponible.</p>
          <button (click)="goBack()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">
            Volver
          </button>
        </div>
      }
    </div>
  `
})
export class ToolRouterComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  toolType: string = '';
  toolComponent: Type<any> | null = null;
  loading = true;

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

    try {
      switch (toolType) {
        case 'meet_scheduling':
          const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
          this.toolComponent = meetScheduling.MeetSchedulingToolComponent;
          console.log('[ToolRouter] Loaded meet_scheduling component:', this.toolComponent);
          break;

        // Add more tool types here as needed
        // case 'document_viewer':
        //   const docViewer = await import('../document-viewer/document-viewer-tool.component');
        //   this.toolComponent = docViewer.DocumentViewerToolComponent;
        //   break;

        default:
          console.warn('[ToolRouter] Unknown tool type:', toolType);
          this.toolComponent = null;
      }
    } catch (error) {
      console.error('[ToolRouter] Error loading component:', error);
      this.toolComponent = null;
    } finally {
      this.loading = false;
    }
  }

  goBack() {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }
}
