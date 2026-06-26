/**
 * Portal Layout Component
 *
 * Wrapper component that provides the header and layout for all portal views
 */

import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd, ActivatedRoute } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { SettingsService, TENANT_HUB_REFERRER_KEY } from '../../../core/services/settings.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, IconComponent],
  templateUrl: './portal-layout.component.html',
  styleUrls: ['./portal-layout.component.scss']
})
export class PortalLayoutComponent {
  private stateService = inject(StateService);
  private settingsService = inject(SettingsService);
  private router = inject(Router);

  protected portal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected referrerPortal = this.stateService.referrerPortal;

  // Signal to track current URL (needed for reactive computed)
  private currentUrl = signal(this.router.url);

  // Track if we should show header (hide on registration page)
  protected showHeader = computed(() => !this.currentUrl().includes('/register'));

  // Show back button when portal was opened from another portal
  protected showBackButton = computed(() => this.referrerPortal() !== null);

  /**
   * URL of the Tenant Hub to render the "Back to directory" button.
   * Comes from the public settings (admin-configured) OR — as a soft
   * fallback — from the referrer captured by SsoConsumerComponent when
   * the user arrived via SSO from a hub.
   */
  protected tenantHubUrl = computed(() => this.settingsService.tenantHubUrl());

  constructor() {
    // Capture ?hub_back=... on first load and on every navigation. The
    // hub appends it to every redirect so a destination can render a
    // "back to directory" button without needing any admin configuration.
    this.captureHubBackFromUrl();

    // Update currentUrl signal when route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.currentUrl.set((event as NavigationEnd).urlAfterRedirects);
      this.captureHubBackFromUrl();
    });
  }

  private captureHubBackFromUrl(): void {
    try {
      const url = new URL(window.location.href);
      const hubBack = url.searchParams.get('hub_back');
      if (!hubBack) return;
      // Basic sanity: must be http(s)://. Anything else is ignored.
      if (!/^https?:\/\//i.test(hubBack)) return;
      localStorage.setItem(TENANT_HUB_REFERRER_KEY, hubBack);
    } catch {
      // ignore — best-effort capture
    }
  }

  getUserDisplayName(): string {
    const contact = this.userContact();
    return contact?.full_name || 'Usuario';
  }

  getUserInitial(): string {
    const contact = this.userContact();
    if (!contact?.full_name) return 'U';
    return contact.full_name.charAt(0).toUpperCase();
  }

  goBack(): void {
    const referrer = this.referrerPortal();
    if (!referrer) return;
    this.stateService.clearReferrerPortal();
    this.router.navigate(['/portal', referrer]);
  }

  goToTenantHub(): void {
    const url = this.tenantHubUrl();
    if (!url) return;
    window.location.href = url;
  }

  exitPortal(): void {
    const currentPortal = this.portal();
    if (!currentPortal) return;

    const referrer = this.referrerPortal();

    // If the user arrived from the Tenant Hub (via SSO or public click),
    // closing the session here should also close it on the hub so they
    // don't stay silently logged in on the directory. We bounce to
    // <hub>/service-portal/hub?logout=1 and the HubLayout handles the
    // hub-side logout on arrival. Clear the local referrer so a future
    // visit without coming from the hub doesn't keep redirecting there.
    const hubUrl = this.settingsService.tenantHubUrl();
    this.stateService.clearUserContact();

    if (hubUrl) {
      try {
        localStorage.removeItem(TENANT_HUB_REFERRER_KEY);
      } catch {
        // ignore
      }
      const sep = hubUrl.includes('?') ? '&' : '?';
      window.location.href = `${hubUrl}${sep}logout=1`;
      return;
    }

    if (referrer) {
      // Redirect to the source portal instead of login cycle
      this.stateService.clearReferrerPortal();
      this.router.navigate(['/portal', referrer]);
    } else {
      // Default: navigate away and back to force component reload
      this.router.navigate(['/portals']).then(() => {
        this.router.navigate(['/portal', currentPortal.portal_name]);
      });
    }
  }
}

