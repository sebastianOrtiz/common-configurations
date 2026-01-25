/**
 * Portal Service
 *
 * Handles Service Portal operations via common_configurations API
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService, ApiResponse } from './frappe-api.service';
import { ServicePortal, UserContact, ToolType, DocField } from '../models/service-portal.model';

// Base API paths for common_configurations
const API_BASE = 'common_configurations.api';

@Injectable({
  providedIn: 'root'
})
export class PortalService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get Service Portal by name
   */
  getPortal(portalName: string): Observable<ServicePortal> {
    return this.frappeApi.getDoc('Service Portal', portalName).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load portal');
        }
        return response.data as ServicePortal;
      })
    );
  }

  /**
   * Get list of active Service Portals
   */
  getActivePortals(): Observable<ServicePortal[]> {
    return this.frappeApi.getList(
      'Service Portal',
      [['is_active', '=', 1]],
      ['name', 'portal_name', 'title', 'description', 'logo', 'primary_color'],
      0,
      50
    ).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load portals');
        }
        return response.data as ServicePortal[];
      })
    );
  }

  /**
   * Create User Contact
   */
  createUserContact(data: Partial<UserContact>): Observable<UserContact> {
    return this.callPortalMethod<UserContact>('create_user_contact', { data: JSON.stringify(data) });
  }

  /**
   * Update User Contact
   */
  updateUserContact(name: string, data: Partial<UserContact>): Observable<UserContact> {
    return this.callPortalMethod<UserContact>('update_user_contact', {
      name,
      data: JSON.stringify(data)
    });
  }

  /**
   * Get User Contact by email
   */
  getUserContactByEmail(email: string): Observable<UserContact | null> {
    return this.callPortalMethodGet<UserContact | null>('get_user_contact_by_email', { email });
  }

  /**
   * Get User Contact by document number
   */
  getUserContactByDocument(document: string): Observable<UserContact | null> {
    return this.callPortalMethodGet<UserContact | null>('get_user_contact_by_document', { document });
  }

  /**
   * Get available Tool Types
   */
  getToolTypes(): Observable<ToolType[]> {
    return this.frappeApi.getList(
      'Tool Type',
      [['is_active', '=', 1]],
      ['*'],
      0,
      100
    ).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load tool types');
        }
        return response.data as ToolType[];
      })
    );
  }

  /**
   * Call custom portal API methods using GET (for read-only operations)
   */
  callPortalMethodGet<T = any>(methodName: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(`${API_BASE}.portal_api.${methodName}`, args, true).pipe(
      map(response => {
        if (!response.success && response.message === undefined) {
          throw new Error(response.error || 'API call failed');
        }
        return response.message as T;
      })
    );
  }

  /**
   * Call custom portal API methods using POST (for write operations)
   */
  callPortalMethod<T = any>(methodName: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(`${API_BASE}.portal_api.${methodName}`, args, false).pipe(
      map(response => {
        if (!response.success && response.message === undefined) {
          throw new Error(response.error || 'API call failed');
        }
        return response.message as T;
      })
    );
  }

  /**
   * Get User Contact DocType fields metadata
   * Returns only the visible, editable fields that should appear in the registration form
   */
  getUserContactFields(): Observable<DocField[]> {
    return this.callPortalMethodGet<DocField[]>('get_user_contact_fields');
  }
}
