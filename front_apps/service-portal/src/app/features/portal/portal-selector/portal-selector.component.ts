/**
 * Portal Selector Component
 *
 * Displays a list of available Service Portals for the user to choose from
 */

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { ServicePortal } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-portal-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './portal-selector.component.html',
  styleUrls: ['./portal-selector.component.scss']
})
export class PortalSelectorComponent implements OnInit {
  // Component state
  protected portals = signal<ServicePortal[]>([]);
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // User info from state
  protected currentUser = this.stateService.currentUser;

  constructor(
    private portalService: PortalService,
    private stateService: StateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPortals();
  }

  /**
   * Load available portals
   */
  private loadPortals(): void {
    this.loading.set(true);
    this.error.set(null);

    this.portalService.getActivePortals().subscribe({
      next: (portals) => {
        this.portals.set(portals);
        this.loading.set(false);

        // If only one portal exists, auto-select it
        if (portals.length === 1) {
          this.selectPortal(portals[0]);
        }
      },
      error: (err) => {
        console.error('Error loading portals:', err);
        this.error.set('Error al cargar los portales disponibles. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Select a portal and navigate to it
   */
  selectPortal(portal: ServicePortal): void {
    // Save selected portal to state
    this.stateService.setSelectedPortal(portal);

    // Check if portal requires contact registration
    if (portal.request_contact_user_data && !this.stateService.userContact()) {
      // Navigate to contact registration
      this.router.navigate(['/portal', portal.name, 'register']);
    } else {
      // Navigate directly to portal view
      this.router.navigate(['/portal', portal.name]);
    }
  }

  /**
   * Get portal logo URL or fallback
   */
  getPortalLogo(portal: ServicePortal): string {
    return portal.logo || 'assets/default-portal-logo.svg';
  }

  /**
   * Get portal primary color or default
   */
  getPortalColor(portal: ServicePortal): string {
    return portal.primary_color || '#667eea';
  }

  /**
   * Retry loading portals
   */
  retry(): void {
    this.loadPortals();
  }
}
