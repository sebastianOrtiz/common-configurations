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
import { AnnouncementZoneComponent } from '../../../shared/components/announcement-zone/announcement-zone.component';

@Component({
  selector: 'app-portal-view',
  standalone: true,
  imports: [CommonModule, IconComponent, AnnouncementZoneComponent],
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
    // Subscribe to route param changes so the component reloads
    // when navigating between portals (Angular reuses the same instance)
    this.route.paramMap.subscribe(params => {
      const portalName = params.get('portalName');
      if (portalName) {
        this.loadPortal(portalName);
      } else {
        this.router.navigate(['/portals']);
      }
    });
  }

  /**
   * Check if contact registration is required and redirect if needed
   * Contact registration is always mandatory before accessing portal tools
   */
  private checkContactRegistration(portal: ServicePortal): void {
    if (portal.require_auth && (!this.stateService.userContact() || this.stateService.isAnonymousUser())) {
      // Clear anonymous contact before redirecting to registration
      if (this.stateService.isAnonymousUser()) {
        this.stateService.clearUserContact();
      }
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

    // Quick link: open external URL directly without entering a tool view
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.url) {
      const link = tool.quick_link_external_data;
      const target = link.target || '_blank';
      if (target === '_self') {
        window.location.href = link.url;
      } else {
        window.open(link.url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    // Navigate to tool route (will be lazy loaded).
    // tool.name (docname) disambiguates portals with several tools of the same
    // tool_type (e.g. "procedures" per secretaría) so the router reinstantiates
    // the right one instead of always resolving the first row of that type.
    this.router.navigate(['/portal', portal.portal_name, 'tool', tool.tool_type, tool.name]);
  }

  /**
   * Get tool icon or fallback.
   * For quick_link tools, prefer the External Link's icon.
   */
  getToolIcon(tool: ServicePortalTool): string {
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.icon) {
      return tool.quick_link_external_data.icon;
    }
    return tool.icon || 'default';
  }

  /**
   * Get tool button color or use portal's primary color.
   * For quick_link tools, prefer the External Link's color.
   */
  getToolColor(tool: ServicePortalTool): string {
    const portal = this.portal();
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.color) {
      return tool.quick_link_external_data.color;
    }
    return tool.button_color || portal?.primary_color || '#667eea';
  }

  /**
   * Get the label displayed on the card.
   * For quick_link tools, prefer the External Link's label.
   */
  getToolLabel(tool: ServicePortalTool): string {
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.label) {
      return tool.quick_link_external_data.label;
    }
    return tool.label;
  }

  /**
   * Get the image displayed on the card (preferred over icon when present).
   * For quick_link tools, prefer the External Link's image.
   */
  getToolImage(tool: ServicePortalTool): string | undefined {
    if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.image) {
      return tool.quick_link_external_data.image;
    }
    return tool.tool_image;
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
