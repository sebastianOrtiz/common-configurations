/**
 * Hub Login — Tenant Hub
 *
 * Thin wrapper around ContactRegistrationComponent. The hub doesn't
 * have a real Service Portal context, so we inject an in-memory pseudo
 * portal (StateService.setSelectedPortalEphemeral) so the existing
 * registration/login + OTP flow works unchanged.
 *
 * Query params:
 *   - pending_portal: id of a Tenant Portal the user clicked but couldn't
 *     access due to lacking session. After auth, we redirect to
 *     /hub/sso-trigger?pending_portal=<id> which mints the nonce and
 *     forwards the user to the destination CRM.
 *   - next: bare fallback redirect for non-SSO flows.
 */

import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ContactRegistrationComponent } from '../../portal/contact-registration/contact-registration.component';
import { StateService } from '../../../core/services/state.service';
import { ServicePortal } from '../../../core/models/service-portal.model';

const HUB_PSEUDO_PORTAL: ServicePortal = {
  name: 'hub',
  portal_name: 'hub',
  title: 'Directorio Nexora',
  description: 'Ingresa para acceder a tus portales',
  is_active: true,
  registration_title: 'Crea tu cuenta del directorio',
  registration_description:
    'Una sola cuenta para entrar a todos los portales del directorio.',
  require_auth: true,
  enable_mfa_otp: true,
  primary_color: '#2563eb',
  tools: [],
};

@Component({
  selector: 'app-hub-login',
  standalone: true,
  imports: [CommonModule, ContactRegistrationComponent],
  template: `
    <app-contact-registration
      [postAuthRedirect]="redirectUrl()"
    ></app-contact-registration>
  `,
})
export class HubLoginComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private stateService = inject(StateService);

  /** Snapshot of the real selected portal so we can restore on teardown. */
  private previousPortal: ServicePortal | null = null;

  protected pendingPortal = signal<string | null>(null);
  protected nextUrl = signal<string | null>(null);

  protected redirectUrl = computed(() => {
    const pp = this.pendingPortal();
    if (pp) {
      return `/hub/sso-trigger?pending_portal=${encodeURIComponent(pp)}`;
    }
    return this.nextUrl() || '/hub';
  });

  ngOnInit(): void {
    // If the hub user is already authenticated, skip the form entirely
    if (this.stateService.userContact()) {
      this.router.navigateByUrl(this.redirectUrl());
      return;
    }

    const params = this.route.snapshot.queryParamMap;
    this.pendingPortal.set(params.get('pending_portal'));
    this.nextUrl.set(params.get('next'));

    // Inject the synthetic hub portal so ContactRegistration has context
    this.previousPortal = this.stateService.selectedPortal();
    this.stateService.setSelectedPortalEphemeral(HUB_PSEUDO_PORTAL);
  }

  ngOnDestroy(): void {
    // Restore whatever real portal (if any) was selected before we mounted
    this.stateService.setSelectedPortalEphemeral(this.previousPortal);
  }
}
