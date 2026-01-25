/**
 * Portal View Component
 *
 * Displays the selected Service Portal with its tool grid
 */

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { AuthService } from '../../../core/services/auth.service';
import { ServicePortal, ServicePortalTool } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-portal-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './portal-view.component.html',
  styleUrls: ['./portal-view.component.scss']
})
export class PortalViewComponent implements OnInit {
  // Component state
  protected portal = signal<ServicePortal | null>(null);
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // Computed tools (sorted and enabled only)
  protected enabledTools = signal<ServicePortalTool[]>([]);

  // User info from state
  protected currentUser = this.stateService.currentUser;
  protected userContact = this.stateService.userContact;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private portalService: PortalService,
    private stateService: StateService,
    private authService: AuthService
  ) {}

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
   * Load portal by name
   */
  private loadPortal(portalName: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.portalService.getPortal(portalName).subscribe({
      next: (portal) => {
        this.portal.set(portal);
        this.stateService.setSelectedPortal(portal);

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

    // Navigate to tool route (will be lazy loaded)
    this.router.navigate(['/portal', portal.name, 'tool', tool.tool_type]);
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
   * Navigate back to portal selector
   */
  backToPortals(): void {
    this.stateService.clearPortal();
    this.router.navigate(['/portals']);
  }

  /**
   * Logout and return to login
   */
  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout error:', err);
        // Force navigation even if logout fails
        this.stateService.resetState();
        this.router.navigate(['/login']);
      }
    });
  }

  /**
   * Get portal logo URL or fallback
   */
  getPortalLogo(portal: ServicePortal): string {
    return portal.logo || 'assets/default-portal-logo.svg';
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
