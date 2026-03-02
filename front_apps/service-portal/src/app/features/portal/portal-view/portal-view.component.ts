/**
 * Portal View Component
 *
 * Displays the selected Service Portal with its tool grid
 */

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { ServicePortal, ServicePortalTool } from '../../../core/models/service-portal.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-portal-view',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './portal-view.component.html',
  styleUrls: ['./portal-view.component.scss']
})
export class PortalViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private portalService = inject(PortalService);
  private stateService = inject(StateService);

  // Component state
  protected portal = signal<ServicePortal | null>(null);
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // Computed tools (sorted and enabled only)
  protected enabledTools = signal<ServicePortalTool[]>([]);

  ngOnInit(): void {
    // Get portal name from route
    const portalName = this.route.snapshot.paramMap.get('portalName');

    if (portalName) {
      this.loadPortal(portalName);
    } else {
      // No portal specified, redirect to selector
      this.router.navigate(['/portals']);
    }
  }

  /**
   * Check if contact registration is required and redirect if needed
   * Contact registration is always mandatory before accessing portal tools
   */
  private checkContactRegistration(portal: ServicePortal): void {
    if (portal.require_auth && !this.stateService.userContact()) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }

  /**
   * Load portal by name
   */
  private loadPortal(portalName: string): void {
    this.loading.set(true);
    this.error.set(null);

    // If the portal being loaded IS the referrer, clear it (user navigated back manually)
    const currentReferrer = this.stateService.referrerPortal();
    if (currentReferrer && currentReferrer === portalName) {
      this.stateService.clearReferrerPortal();
    }

    this.portalService.getPortal(portalName).subscribe({
      next: (portal) => {
        this.portal.set(portal);
        this.stateService.setSelectedPortal(portal);

        // Fallback para recarga de página (F5): si el portal no requiere auth y no hay
        // contacto en estado, establecer el usuario anónimo (no persiste en localStorage)
        if (!portal.require_auth && !this.stateService.userContact()) {
          this.stateService.setAnonymousContact();
        }

        // Check if contact registration is required
        this.checkContactRegistration(portal);

        // Filter and sort tools
        const enabledSorted = portal.tools
          .filter(tool => tool.is_enabled)
          .sort((a, b) => a.display_order - b.display_order);

        this.enabledTools.set(enabledSorted);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading portal:', err);
        this.error.set('Error al cargar el portal. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Navigate to a tool
   */
  selectTool(tool: ServicePortalTool): void {
    const portal = this.portal();
    if (!portal) return;

    // Portal redirect: save current portal as referrer, then navigate to target
    if (tool.tool_type === 'portal_redirect' && tool.target_portal) {
      this.stateService.setReferrerPortal(portal.portal_name);
      this.router.navigate(['/portal', tool.target_portal]);
      return;
    }

    // Navigate to tool route (will be lazy loaded)
    this.router.navigate(['/portal', portal.portal_name, 'tool', tool.tool_type]);
  }

  /**
   * Get tool icon or fallback
   */
  getToolIcon(tool: ServicePortalTool): string {
    return tool.icon || 'default';
  }

  /**
   * Get tool button color or use portal's primary color
   */
  getToolColor(tool: ServicePortalTool): string {
    const portal = this.portal();
    return tool.button_color || portal?.primary_color || '#667eea';
  }

  /**
   * Retry loading portal
   */
  retry(): void {
    const portalName = this.route.snapshot.paramMap.get('portalName');
    if (portalName) {
      this.loadPortal(portalName);
    }
  }
}
