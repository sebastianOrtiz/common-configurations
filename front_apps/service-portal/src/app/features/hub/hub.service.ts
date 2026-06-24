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
}
