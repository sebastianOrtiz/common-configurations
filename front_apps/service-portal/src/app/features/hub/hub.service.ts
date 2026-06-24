/**
 * Tenant Hub Service
 *
 * Thin wrapper over the public hub endpoints exposed by
 * common_configurations.api.hub.
 */

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService } from '../../core/services/frappe-api.service';
import {
  SsoNonceResponse,
  TenantPortalGroup,
  TenantPortalGroupWithPortals,
} from './hub.types';

@Injectable({ providedIn: 'root' })
export class HubService {
  private frappeApi = inject(FrappeApiService);

  getGroups(): Observable<TenantPortalGroup[]> {
    return this.frappeApi
      .callMethod<TenantPortalGroup[]>(
        'common_configurations.api.hub.get_groups',
        {},
        true,
      )
      .pipe(map((res) => (res?.message ?? []) as TenantPortalGroup[]));
  }

  getGroupWithPortals(slug: string): Observable<TenantPortalGroupWithPortals> {
    return this.frappeApi
      .callMethod<TenantPortalGroupWithPortals>(
        'common_configurations.api.hub.get_group_with_portals',
        { slug },
        true,
      )
      .pipe(map((res) => res?.message as TenantPortalGroupWithPortals));
  }

  /**
   * Mint a single-use SSO nonce for the given Tenant Portal. Requires the
   * hub user to be authenticated; the X-User-Contact-Token header is
   * attached by FrappeApiService when StateService has a user contact.
   */
  generateSsoNonce(tenantPortal: string): Observable<SsoNonceResponse> {
    return this.frappeApi
      .callMethod<SsoNonceResponse>(
        'common_configurations.api.hub.generate_sso_nonce',
        { tenant_portal: tenantPortal },
        false,
      )
      .pipe(map((res) => res?.message as SsoNonceResponse));
  }
}
