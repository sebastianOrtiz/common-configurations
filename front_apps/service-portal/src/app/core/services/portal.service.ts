/**
 * Portal Service
 *
 * Handles Service Portal operations via public APIs.
 * All endpoints are accessible without authentication.
 * User Contact authentication is handled via tokens.
 */

import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';
import { ServicePortal, UserContact, ToolType, DocField } from '../models/service-portal.model';

// Base API paths for common_configurations
const API_BASE = 'common_configurations.api';

// Extended UserContact interface that includes auth token from API response
export interface UserContactWithToken extends UserContact {
  auth_token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PortalService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get Service Portal by name (public API)
   */
  getPortal(portalName: string): Observable<ServicePortal> {
    return this.callPortalMethodGet<ServicePortal>('get_portal', { portal_name: portalName });
  }

  /**
   * Get list of active Service Portals (public API)
   */
  getActivePortals(): Observable<ServicePortal[]> {
    return this.callPortalMethodGet<ServicePortal[]>('get_portals');
  }

  /**
   * Create User Contact (public API with honeypot protection)
   * Returns the created contact with an auth token for subsequent authenticated requests.
   */
  createUserContact(data: Partial<UserContact>): Observable<UserContactWithToken> {
    return this.callPortalMethod<UserContactWithToken>('create_user_contact', {
      data: JSON.stringify(data),
      honeypot: ''  // Honeypot field - should always be empty
    }).pipe(
      tap(contact => {
        // Store auth token for future requests if present
        if (contact?.auth_token) {
          this.frappeApi.setUserContactToken(contact.auth_token);
        }
      })
    );
  }

  /**
   * Update User Contact (public API with honeypot protection)
   */
  updateUserContact(name: string, data: Partial<UserContact>): Observable<UserContact> {
    return this.callPortalMethod<UserContact>('update_user_contact', {
      name,
      data: JSON.stringify(data),
      honeypot: ''  // Honeypot field
    });
  }

  /**
   * Get User Contact by document number (public API with honeypot protection)
   * Returns the contact with an auth token for subsequent authenticated requests.
   * This acts as a "login" for returning users.
   */
  getUserContactByDocument(document: string): Observable<UserContactWithToken | null> {
    return this.callPortalMethod<UserContactWithToken | null>('get_user_contact_by_document', {
      document,
      honeypot: ''  // Honeypot field
    }).pipe(
      tap(contact => {
        // Store auth token for future requests if present
        if (contact?.auth_token) {
          this.frappeApi.setUserContactToken(contact.auth_token);
        }
      })
    );
  }

  /**
   * Get the currently authenticated User Contact (validates token)
   * Returns null if not authenticated or token is invalid/expired.
   */
  getAuthenticatedUserContact(): Observable<UserContact | null> {
    return this.callPortalMethodGet<UserContact | null>('get_authenticated_user_contact');
  }

  /**
   * Logout current User Contact (invalidates token)
   */
  logoutUserContact(): Observable<{ success: boolean }> {
    return this.callPortalMethod<{ success: boolean }>('logout_user_contact', {
      honeypot: ''
    }).pipe(
      tap(() => {
        // Clear local token
        this.frappeApi.clearUserContactToken();
      })
    );
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
   * These are public endpoints that don't require authentication
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
   * These are public endpoints with rate limiting and honeypot protection
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
   * Get User Contact DocType fields metadata (public API)
   * Returns only the visible, editable fields that should appear in the registration form
   */
  getUserContactFields(): Observable<DocField[]> {
    return this.callPortalMethodGet<DocField[]>('get_user_contact_fields');
  }
}
