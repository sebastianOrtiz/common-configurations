/**
 * Hub Layout
 *
 * Shell with header for all Tenant Hub views (/hub, /hub/:slug,
 * /hub/login, /hub/sso-trigger). Mirrors the look and feel of
 * PortalLayout but with the hub's own branding and a simpler menu:
 *
 *   - Logged out → "Iniciar sesión" button → /hub/login
 *   - Logged in  → user name, avatar initial, logout button
 */

import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { PortalService } from '../../../core/services/portal.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-hub-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, IconComponent],
  templateUrl: './hub-layout.component.html',
  styleUrls: ['./hub-layout.component.scss'],
})
export class HubLayoutComponent {
  private stateService = inject(StateService);
  private portalService = inject(PortalService);
  private router = inject(Router);

  protected userContact = this.stateService.userContact;
  protected isLoggedIn = computed(
    () => !!this.userContact() && this.userContact()?.name !== 'anonymous',
  );

  getUserDisplayName(): string {
    return this.userContact()?.full_name || 'Usuario';
  }

  getUserInitial(): string {
    const name = this.userContact()?.full_name;
    return name ? name.charAt(0).toUpperCase() : 'U';
  }

  logout(): void {
    this.portalService.logoutUserContact().subscribe({
      next: () => this.afterLogout(),
      error: () => this.afterLogout(), // logout local incluso si el server falla
    });
  }

  private afterLogout(): void {
    this.stateService.clearUserContact();
    this.router.navigate(['/hub']);
  }
}
