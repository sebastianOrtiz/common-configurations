/**
 * Hub SSO Trigger
 *
 * Intermediate component that mints a single-use nonce for a Tenant
 * Portal and redirects the browser to the destination CRM via:
 *
 *     <target_url>/sso?identity_nonce=<nonce>
 *
 * Reached either:
 *   - Directly from the hub list (user already authenticated).
 *   - After /hub/login completes (postAuthRedirect points here when
 *     the original click had ?pending_portal=<id>).
 *
 * If the user is not authenticated, bounces to /hub/login keeping the
 * pending_portal so the flow resumes after login.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HubService } from '../hub.service';
import { StateService } from '../../../core/services/state.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-hub-sso-trigger',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="sso-trigger">
      @if (error()) {
        <div class="state error">
          <app-icon name="AlertCircle" [size]="48" [strokeWidth]="1.5"></app-icon>
          <p>{{ error() }}</p>
          <button class="btn-primary" (click)="goBack()">Volver al directorio</button>
        </div>
      } @else {
        <div class="state">
          <span class="spinner"></span>
          <p>Te estamos llevando al portal seleccionado…</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
    .sso-trigger {
      min-height: 60vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      text-align: center;
    }
    .state.error svg { color: #f59e0b; }
    .state p {
      color: #64748b;
      max-width: 32ch;
      margin: 0;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-primary {
      padding: 0.625rem 1.25rem;
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
      color: #fff;
      border: none;
      border-radius: 0.625rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    `,
  ],
})
export class HubSsoTriggerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private hubService = inject(HubService);
  private stateService = inject(StateService);

  protected error = signal<string | null>(null);

  ngOnInit(): void {
    const tenantPortal = this.route.snapshot.queryParamMap.get('pending_portal');
    if (!tenantPortal) {
      this.error.set('Falta el portal a abrir. Vuelve al directorio e intenta de nuevo.');
      return;
    }

    if (!this.stateService.userContact()) {
      // Not authenticated yet — bounce to login, resume after.
      this.router.navigate(['/hub/login'], {
        queryParams: { pending_portal: tenantPortal },
      });
      return;
    }

    this.hubService.generateSsoNonce(tenantPortal).subscribe({
      next: (res) => {
        if (!res?.target_url || !res?.nonce) {
          this.error.set('No se pudo generar el acceso seguro. Inténtalo de nuevo.');
          return;
        }
        // target_url is something like https://site/service-portal/portal/<x>
        // We append /sso?identity_nonce=...&hub_back=<this hub URL>.
        const base = res.target_url.replace(/\/+$/, '');
        const hubBack = `${window.location.origin}/service-portal/hub`;
        const qs = new URLSearchParams({
          identity_nonce: res.nonce,
          hub_back: hubBack,
        }).toString();
        window.location.href = `${base}/sso?${qs}`;
      },
      error: (err) => {
        console.error('SSO trigger error:', err);
        if (err?.status === 401 || err?.status === 403) {
          this.router.navigate(['/hub/login'], {
            queryParams: { pending_portal: tenantPortal },
          });
          return;
        }
        this.error.set('No se pudo iniciar el acceso al portal. Inténtalo de nuevo.');
      },
    });
  }

  protected goBack(): void {
    this.router.navigate(['/hub']);
  }
}
