/**
 * SSO Consumer (destination side)
 *
 * Lives at /portal/:portalName/sso?identity_nonce=<nonce>.
 *
 * 1. Reads the nonce from the URL.
 * 2. Calls the local endpoint `consume_sso_nonce(nonce)` which:
 *      - signs HMAC with this site's hub_shared_secret,
 *      - calls the hub to verify,
 *      - upserts a local User Contact,
 *      - returns a fresh local auth_token.
 * 3. Stores the new session in StateService.
 * 4. Persists the hub URL as the "back-to-hub" referrer so the portal
 *    can show a return button (consumed by Phase 3).
 * 5. Navigates to /portal/<portalName>.
 *
 * On any failure shows a clear error with a manual back button.
 */

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { StateService } from '../../../core/services/state.service';
import { UserContact } from '../../../core/models/service-portal.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';

interface ConsumeSsoResponse {
  auth_token: string;
  user_contact: UserContact;
}

const HUB_REFERRER_STORAGE_KEY = 'sp_tenant_hub_referrer';

@Component({
  selector: 'app-sso-consumer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="sso-consumer">
      @if (error()) {
        <div class="state error">
          <app-icon name="AlertCircle" [size]="48" [strokeWidth]="1.5"></app-icon>
          <p>{{ error() }}</p>
          <button class="btn-primary" (click)="goToPortalHome()">
            Ir al portal sin SSO
          </button>
        </div>
      } @else {
        <div class="state">
          <span class="spinner"></span>
          <p>Conectándote al portal con tu cuenta del directorio…</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
    .sso-consumer {
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
    .state p { color: #64748b; max-width: 32ch; margin: 0; }
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
export class SsoConsumerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);

  protected error = signal<string | null>(null);
  private portalName = '';

  ngOnInit(): void {
    this.portalName = this.route.snapshot.paramMap.get('portalName') ?? '';
    const nonce = this.route.snapshot.queryParamMap.get('identity_nonce');

    if (!nonce) {
      this.error.set('Falta el código de acceso. Vuelve al directorio e intenta de nuevo.');
      return;
    }

    // The hub also appends `?hub_back=<url>` on every SSO redirect,
    // and PortalLayoutComponent captures it on every navigation. We
    // keep a best-effort referrer fallback here for the rare case
    // where the URL is rewritten by an intermediary that strips
    // query params but leaves Referer intact.
    try {
      if (!localStorage.getItem(HUB_REFERRER_STORAGE_KEY) && document.referrer) {
        const url = new URL(document.referrer);
        localStorage.setItem(
          HUB_REFERRER_STORAGE_KEY,
          `${url.protocol}//${url.host}/service-portal/hub`,
        );
      }
    } catch {
      // ignore referrer parse errors
    }

    this.frappeApi
      .callMethod<ConsumeSsoResponse>(
        'common_configurations.api.auth.consume_sso_nonce',
        { nonce },
        false,
      )
      .subscribe({
        next: (resp) => {
          const payload = resp?.message;
          if (!payload?.auth_token || !payload?.user_contact) {
            this.error.set('No pudimos validar tu acceso. Intenta de nuevo.');
            return;
          }
          this.stateService.setUserContact(payload.user_contact, payload.auth_token);
          this.goToPortalHome();
        },
        error: (err) => {
          console.error('SSO consume failed:', err);
          const msg =
            err?.error?.message ||
            'No pudimos validar tu acceso. Intenta de nuevo desde el directorio.';
          this.error.set(typeof msg === 'string' ? msg : 'No pudimos validar tu acceso.');
        },
      });
  }

  protected goToPortalHome(): void {
    if (this.portalName) {
      this.router.navigate(['/portal', this.portalName]);
    } else {
      this.router.navigate(['/portals']);
    }
  }
}
