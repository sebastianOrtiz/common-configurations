/**
 * Portal Layout Component
 *
 * Wrapper component that provides the header and layout for all portal views
 */

import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
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

  constructor() {
    // Update currentUrl signal when route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      this.currentUrl.set((event as NavigationEnd).urlAfterRedirects);
    });
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

  exitPortal(): void {
    const currentPortal = this.portal();
    if (!currentPortal) return;

    const referrer = this.referrerPortal();
    this.stateService.clearUserContact();

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

