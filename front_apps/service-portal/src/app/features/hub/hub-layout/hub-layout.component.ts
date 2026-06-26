/**
 * Hub Layout
 *
 * Shell with header for all Tenant Hub views (/hub, /hub/:slug,
 * /hub/login, /hub/sso-trigger). Mirrors the look and feel of
 * PortalLayout but with the hub's own branding and a simpler menu:
 *
 *   - Logged out → "Iniciar sesión" button → /hub/login
 *   - Logged in  → user name, avatar initial, logout button
 *
 * Cross-tenant single-logout: when a destination redirects here with
 * `?logout=1`, we close the hub session too so the user ends up fully
 * logged out across both sides. The flag is stripped from the URL so
 * it doesn't replay on reload.
 */

import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterOutlet, RouterLink } from '@angular/router';
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
export class HubLayoutComponent implements OnInit {
  private stateService = inject(StateService);
  private portalService = inject(PortalService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected userContact = this.stateService.userContact;
  protected isLoggedIn = computed(
    () => !!this.userContact() && this.userContact()?.name !== 'anonymous',
  );

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('logout') === '1') {
      this.handleCrossTenantLogout();
    }
  }

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

  /**
   * Cross-tenant logout: a destination redirected the user here after
   * a logout. Close the hub session (if any) and clean the flag from
   * the URL so it doesn't re-trigger on refresh.
   */
  private handleCrossTenantLogout(): void {
    const finish = () => {
      this.stateService.clearUserContact();
      // Strip ?logout=1 without changing the route
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { logout: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    };

    if (this.isLoggedIn()) {
      this.portalService.logoutUserContact().subscribe({
        next: finish,
        error: finish, // siempre limpiar local aunque el server falle
      });
    } else {
      finish();
    }
  }

  private afterLogout(): void {
    this.stateService.clearUserContact();
    this.router.navigate(['/hub']);
  }
}
