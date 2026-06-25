/**
 * Tenant Hub — Group with Portals
 *
 * Shows the portals registered under a given group. Clicking a portal:
 *   - if `requires_auth = 0` → redirects to the destination URL.
 *   - if `requires_auth = 1` → placeholder for Phase 2 SSO flow.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HubService } from '../hub.service';
import { TenantPortal, TenantPortalGroupWithPortals } from '../hub.types';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { StateService } from '../../../core/services/state.service';

@Component({
  selector: 'app-tenant-hub-group',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './tenant-hub-group.component.html',
  styleUrls: ['./tenant-hub-group.component.scss'],
})
export class TenantHubGroupComponent implements OnInit {
  private hubService = inject(HubService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private stateService = inject(StateService);

  protected loading = signal<boolean>(true);
  protected error = signal<string | null>(null);
  protected group = signal<TenantPortalGroupWithPortals | null>(null);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      this.router.navigate(['/hub']);
      return;
    }
    this.loadGroup(slug);
  }

  protected goBack(): void {
    this.router.navigate(['/hub']);
  }

  protected openPortal(portal: TenantPortal): void {
    if (!portal.target_url) {
      this.error.set('Este portal no está disponible en este momento.');
      return;
    }

    // Public portal: straight redirect, no SSO involved.
    // We append ?hub_back=<this hub's URL> so the destination knows
    // it can render a "back to directory" button.
    if (!portal.requires_auth) {
      const hubBack = this.computeHubBackUrl();
      const sep = portal.target_url.includes('?') ? '&' : '?';
      window.location.href = `${portal.target_url}${sep}hub_back=${encodeURIComponent(hubBack)}`;
      return;
    }

    // Auth-gated portal: run SSO. If the hub user is not authenticated
    // yet, bounce to /hub/login keeping the pending portal so the flow
    // resumes after login. Otherwise jump straight to /hub/sso-trigger
    // which mints the nonce and forwards to the destination.
    if (!this.stateService.userContact()) {
      this.router.navigate(['/hub/login'], {
        queryParams: { pending_portal: portal.name },
      });
      return;
    }

    this.router.navigate(['/hub/sso-trigger'], {
      queryParams: { pending_portal: portal.name },
    });
  }

  /** URL of this hub used as the `hub_back` value sent to destinations. */
  private computeHubBackUrl(): string {
    return `${window.location.origin}/service-portal/hub`;
  }

  private loadGroup(slug: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.hubService.getGroupWithPortals(slug).subscribe({
      next: (group) => {
        this.group.set(group);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading hub group:', err);
        const notFound = err?.status === 404 || /not found/i.test(err?.message || '');
        this.error.set(
          notFound
            ? 'La categoría que buscas no existe o ya no está activa.'
            : 'No se pudo cargar la categoría. Inténtalo de nuevo.',
        );
        this.loading.set(false);
      },
    });
  }
}
