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
const API_BASE = '/api/method/common_configurations.api';

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
    return this.frappeApi.createDoc('User Contact', data).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to create user contact');
        }
        return response.data as UserContact;
      })
    );
  }

  /**
   * Update User Contact
   */
  updateUserContact(name: string, data: Partial<UserContact>): Observable<UserContact> {
    return this.frappeApi.updateDoc('User Contact', name, data).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to update user contact');
        }
        return response.data as UserContact;
      })
    );
  }

  /**
   * Get User Contact by email
   */
  getUserContactByEmail(email: string): Observable<UserContact | null> {
    return this.frappeApi.getList(
      'User Contact',
      [['email', '=', email]],
      ['*'],
      0,
      1
    ).pipe(
      map(response => {
        if (!response.success || !response.data || response.data.length === 0) {
          return null;
        }
        return response.data[0] as UserContact;
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
   * Call custom portal API methods (if any exist in common_configurations/api)
   *
   * Example usage if you create custom methods:
   * - common_configurations.api.portal_api.validate_access
   * - common_configurations.api.portal_api.log_portal_visit
   */
  callPortalMethod<T = any>(methodName: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(`${API_BASE}.portal_api.${methodName}`, args).pipe(
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
    return this.frappeApi.getDocTypeMeta('User Contact').pipe(
      map(response => {
        if (!response.success || !response.message || !response.message.docs) {
          throw new Error('Failed to load User Contact metadata');
        }

        const doctype = response.message.docs[0];
        const fields: DocField[] = doctype.fields || [];

        // Filter fields that should appear in the form
        return fields.filter((field: DocField) => {
          // Exclude hidden fields
          if (field.hidden) return false;

          // Exclude read-only fields
          if (field.read_only) return false;

          // Include only data entry field types
          const includedTypes = [
            'Data', 'Select', 'Int', 'Float', 'Currency',
            'Date', 'Datetime', 'Time', 'Check', 'Text',
            'Small Text', 'Long Text', 'Link', 'Dynamic Link',
            'Phone', 'Email'
          ];

          if (!includedTypes.includes(field.fieldtype)) return false;

          // Exclude section breaks, column breaks, etc.
          return true;
        }).sort((a, b) => {
          // Sort by field order if available
          const orderA = doctype.field_order?.indexOf(a.fieldname) ?? 999;
          const orderB = doctype.field_order?.indexOf(b.fieldname) ?? 999;
          return orderA - orderB;
        });
      })
    );
  }
}
