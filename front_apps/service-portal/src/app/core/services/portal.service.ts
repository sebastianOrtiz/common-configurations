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
import { ServicePortal, UserContact, ToolType, DocField, UserContactWithOTP } from '../models/service-portal.model';

// API paths for common_configurations domains
const API_CONTACTS = 'common_configurations.api.contacts';
const API_PORTALS = 'common_configurations.api.portals';
const API_AUTH = 'common_configurations.api.auth';

// Re-export UserContactWithOTP as UserContactWithToken for backwards compatibility
export type UserContactWithToken = UserContactWithOTP;

@Injectable({
  providedIn: 'root'
})
export class PortalService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get Service Portal by name (public API)
   */
  getPortal(portalName: string): Observable<ServicePortal> {
    return this.callApiGet<ServicePortal>(`${API_PORTALS}.get_portal`, { portal_name: portalName });
  }

  /**
   * Get list of active Service Portals (public API)
   */
  getActivePortals(): Observable<ServicePortal[]> {
    return this.callApiGet<ServicePortal[]>(`${API_PORTALS}.get_portals`);
  }

  /**
   * Create User Contact (public API with honeypot protection)
   * Returns the created contact. If OTP is enabled, returns requires_otp=true
   * and the caller must complete OTP verification to get the auth token.
   * If OTP is disabled, returns auth_token directly.
   */
  createUserContact(data: Partial<UserContact>): Observable<UserContactWithToken> {
    return this.callApiPost<UserContactWithToken>(`${API_CONTACTS}.create_user_contact`, {
      data: JSON.stringify(data),
      honeypot: ''  // Honeypot field - should always be empty
    }).pipe(
      tap(contact => {
        // Only store auth token if present and OTP is not required
        // When OTP is required, token will be set after verification
        if (contact?.auth_token && !contact?.requires_otp) {
          this.frappeApi.setUserContactToken(contact.auth_token);
        }
      })
    );
  }

  /**
   * Update User Contact (public API with honeypot protection)
   */
  updateUserContact(name: string, data: Partial<UserContact>): Observable<UserContact> {
    return this.callApiPost<UserContact>(`${API_CONTACTS}.update_user_contact`, {
      name,
      data: JSON.stringify(data),
      honeypot: ''  // Honeypot field
    });
  }

  /**
   * Get User Contact by document number (public API)
   * Returns the contact. If OTP is enabled, returns requires_otp=true
   * and the caller must complete OTP verification to get the auth token.
   * If OTP is disabled, returns auth_token directly.
   * Uses GET to avoid CSRF issues for guest users.
   */
  getUserContactByDocument(document: string): Observable<UserContactWithToken | null> {
    return this.callApiGet<UserContactWithToken | null>(`${API_CONTACTS}.get_user_contact_by_document`, {
      document
    }).pipe(
      tap(contact => {
        // Only store auth token if present and OTP is not required
        // When OTP is required, token will be set after verification
        if (contact?.auth_token && !contact?.requires_otp) {
          this.frappeApi.setUserContactToken(contact.auth_token);
        }
      })
    );
  }

  /**
   * Set auth token after OTP verification
   * Called by contact-registration component after successful OTP verification
   */
  setAuthToken(token: string): void {
    this.frappeApi.setUserContactToken(token);
  }

  /**
   * Get the currently authenticated User Contact (validates token)
   * Returns null if not authenticated or token is invalid/expired.
   */
  getAuthenticatedUserContact(): Observable<UserContact | null> {
    return this.callApiGet<UserContact | null>(`${API_AUTH}.get_authenticated_user_contact`);
  }

  /**
   * Logout current User Contact (invalidates token)
   */
  logoutUserContact(): Observable<{ success: boolean }> {
    return this.callApiPost<{ success: boolean }>(`${API_AUTH}.logout_user_contact`, {
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
   * Call API method using GET (for read-only operations)
   * These are public endpoints that don't require authentication
   */
  private callApiGet<T = any>(methodPath: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(methodPath, args, true).pipe(
      map(response => {
        if (!response.success && response.message === undefined) {
          throw new Error(response.error || 'API call failed');
        }
        return response.message as T;
      })
    );
  }

  /**
   * Call API method using POST (for write operations)
   * These are public endpoints with rate limiting and honeypot protection
   */
  private callApiPost<T = any>(methodPath: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(methodPath, args, false).pipe(
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
    return this.callApiGet<DocField[]>(`${API_CONTACTS}.get_user_contact_fields`);
  }
}
