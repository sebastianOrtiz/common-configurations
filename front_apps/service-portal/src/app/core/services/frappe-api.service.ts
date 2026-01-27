/**
 * Frappe API Service
 *
 * Base service for all Frappe API calls with:
 * - Authentication (api-token or csrf-token)
 * - Request deduplication
 * - Error handling
 * - Type safety
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

// Header name for User Contact authentication
export const USER_CONTACT_AUTH_HEADER = 'X-User-Contact-Token';

// Global configuration (can be overridden via environment)
interface FrappeConfig {
  authorizationMode: 'api-token' | 'csrf-token';
  token?: string;
  userContactToken?: string;  // Token for User Contact authentication
}

// Default config (csrf-token mode for web login)
const DEFAULT_CONFIG: FrappeConfig = {
  authorizationMode: 'csrf-token'
};

// Global request deduplication cache
// Stores pending observables to prevent duplicate simultaneous requests
const pendingRequests = new Map<string, Observable<any>>();

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  count?: number;
  message?: T; // Frappe returns data in 'message' field
  _server_messages?: string;
  exc?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FrappeApiService {
  private config: FrappeConfig = DEFAULT_CONFIG;

  constructor(private http: HttpClient) {
    // Try to load config from environment or localStorage
    this.loadConfig();
  }

  /**
   * Load configuration from environment or localStorage
   */
  private loadConfig(): void {
    // Check if API token is stored (for testing/dev)
    const storedToken = localStorage.getItem('frappe_api_token');
    if (storedToken) {
      this.config.authorizationMode = 'api-token';
      this.config.token = storedToken;
    }

    // Load User Contact auth token if available
    const userContactToken = localStorage.getItem('sp_auth_token');
    if (userContactToken) {
      this.config.userContactToken = userContactToken;
      console.log('[Auth Debug] Loaded token from localStorage:', userContactToken.substring(0, 20) + '...');
    } else {
      console.log('[Auth Debug] No token found in localStorage');
    }
  }

  /**
   * Get authentication headers based on mode
   */
  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    if (this.config.authorizationMode === 'api-token' && this.config.token) {
      headers = headers.set('Authorization', `Basic ${this.config.token}`);
    } else {
      // csrf-token mode
      let csrfToken = this.getCsrfToken();
      if (csrfToken) {
        headers = headers.set('X-Frappe-CSRF-Token', csrfToken);
      }
    }

    // Add User Contact auth token if available
    if (this.config.userContactToken) {
      headers = headers.set(USER_CONTACT_AUTH_HEADER, this.config.userContactToken);
      console.log('[Auth Debug] Sending User Contact token:', this.config.userContactToken.substring(0, 20) + '...');
    } else {
      console.log('[Auth Debug] No User Contact token in config');
    }

    return headers;
  }

  /**
   * Get CSRF token from window or cookies
   */
  private getCsrfToken(): string {
    // Try from frappe global (most common in Frappe)
    const frappe = (window as any).frappe;
    if (frappe && frappe.csrf_token) {
      return frappe.csrf_token;
    }

    // Try from window.csrf_token (legacy)
    const windowCsrf = (window as any).csrf_token;
    if (windowCsrf) return windowCsrf;

    // Try from cookies
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrf_token') {
        return decodeURIComponent(value);
      }
    }

    return '';
  }

  /**
   * Fetch CSRF token from Frappe server
   * This is needed when the token is not injected in the page (e.g., website routes)
   * Call this method on app initialization before making POST requests
   */
  fetchCsrfToken(): Observable<string> {
    return from(
      fetch('/api/method/common_configurations.api.auth.get_csrf_token', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data && data.message) {
          const token = data.message;
          // Store token in window for future use
          if (!(window as any).frappe) {
            (window as any).frappe = {};
          }
          (window as any).frappe.csrf_token = token;
          return token;
        }
        return '';
      })
      .catch(() => '')
    );
  }

  /**
   * Generate cache key for deduplication
   */
  private getCacheKey(method: string, url: string, body?: any): string {
    const bodyStr = body ? JSON.stringify(body) : '';
    return `${method}:${url}:${bodyStr}`;
  }

  /**
   * Extract detailed error message from Frappe's _server_messages
   */
  private extractServerMessage(result: any): string | undefined {
    if (!result._server_messages) return undefined;

    try {
      const serverMessages = JSON.parse(result._server_messages);
      if (Array.isArray(serverMessages) && serverMessages.length > 0) {
        const firstMessage = JSON.parse(serverMessages[0]);
        return firstMessage.message;
      }
    } catch {
      // Failed to parse, return undefined
    }
    return undefined;
  }

  /**
   * GET request to Frappe API
   *
   * @param url Relative or absolute URL
   * @param params Query parameters
   * @param skipCache Skip request deduplication
   */
  get<T = any>(url: string, params?: Record<string, any>, skipCache = false): Observable<ApiResponse<T>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, String(params[key]));
        }
      });
    }

    const fullUrl = this.buildUrl(url);
    const urlWithParams = httpParams.toString() ? `${fullUrl}?${httpParams.toString()}` : fullUrl;
    const cacheKey = this.getCacheKey('GET', urlWithParams);

    // Check cache
    if (!skipCache && pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey)!;
    }

    // Create new request
    const request$ = this.http.get<any>(fullUrl, {
      headers: this.getAuthHeaders(),
      params: httpParams
    }).pipe(
      map(response => this.normalizeResponse<T>(response)),
      catchError(err => this.handleError(err)),
      shareReplay(1) // Share among subscribers
    );

    // Store in cache
    if (!skipCache) {
      pendingRequests.set(cacheKey, request$);

      // Clean up after completion
      request$.subscribe({
        complete: () => pendingRequests.delete(cacheKey),
        error: () => pendingRequests.delete(cacheKey)
      });
    }

    return request$;
  }

  /**
   * POST request to Frappe API
   *
   * @param url Relative or absolute URL
   * @param data Request body
   * @param skipCache Skip request deduplication
   */
  post<T = any>(url: string, data?: any, skipCache = false): Observable<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url);
    const cacheKey = this.getCacheKey('POST', fullUrl, data);

    // Check cache (optional for POST, usually skipped)
    if (!skipCache && pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey)!;
    }

    // Create new request
    const request$ = this.http.post<any>(fullUrl, data, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => this.normalizeResponse<T>(response)),
      catchError(err => this.handleError(err)),
      shareReplay(1)
    );

    // Store in cache
    if (!skipCache) {
      pendingRequests.set(cacheKey, request$);

      request$.subscribe({
        complete: () => pendingRequests.delete(cacheKey),
        error: () => pendingRequests.delete(cacheKey)
      });
    }

    return request$;
  }

  /**
   * PUT request to Frappe API
   */
  put<T = any>(url: string, data: any): Observable<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url);

    return this.http.put<any>(fullUrl, data, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => this.normalizeResponse<T>(response)),
      catchError(err => this.handleError(err))
    );
  }

  /**
   * DELETE request to Frappe API
   */
  delete<T = any>(url: string): Observable<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url);

    return this.http.delete<any>(fullUrl, {
      headers: this.getAuthHeaders()
    }).pipe(
      map(response => this.normalizeResponse<T>(response)),
      catchError(err => this.handleError(err))
    );
  }

  /**
   * Call Frappe method (RPC style)
   *
   * @param methodPath Full method path (e.g., 'meet_scheduling.api.appointment_api.get_available_slots')
   * @param args Method arguments
   * @param useGet Use GET request instead of POST (for read-only operations, avoids CSRF issues)
   */
  callMethod<T = any>(methodPath: string, args?: any, useGet: boolean = false): Observable<ApiResponse<T>> {
    const url = `/api/method/${methodPath}`;

    if (useGet) {
      // Use GET for read-only operations (avoids CSRF token issues)
      return this.get<T>(url, args, true); // Skip cache
    } else {
      // Use POST for write operations
      return this.post<T>(url, args, true); // Skip cache for method calls
    }
  }

  /**
   * Get DocType document
   */
  getDoc(doctype: string, name: string): Observable<ApiResponse<any>> {
    return this.get(`/api/resource/${doctype}/${name}`);
  }

  /**
   * Get DocType list
   */
  getList(doctype: string, filters?: any, fields?: string[], limitStart = 0, limitPageLength = 20): Observable<ApiResponse<any[]>> {
    const params: any = {};

    if (filters) {
      params.filters = JSON.stringify(filters);
    }
    if (fields && fields.length) {
      params.fields = JSON.stringify(fields);
    }
    params.limit_start = limitStart;
    params.limit_page_length = limitPageLength;

    return this.get(`/api/resource/${doctype}`, params);
  }

  /**
   * Create DocType document
   */
  createDoc(doctype: string, data: any): Observable<ApiResponse<any>> {
    return this.post(`/api/resource/${doctype}`, data, true);
  }

  /**
   * Update DocType document
   */
  updateDoc(doctype: string, name: string, data: any): Observable<ApiResponse<any>> {
    return this.put(`/api/resource/${doctype}/${name}`, data);
  }

  /**
   * Delete DocType document
   */
  deleteDoc(doctype: string, name: string): Observable<ApiResponse<any>> {
    return this.delete(`/api/resource/${doctype}/${name}`);
  }

  /**
   * Login to Frappe
   */
  login(username: string, password: string): Observable<ApiResponse<any>> {
    return this.post('/api/method/login', {
      usr: username,
      pwd: password
    }, true);
  }

  /**
   * Logout from Frappe
   */
  logout(): Observable<ApiResponse<any>> {
    return this.post('/api/method/logout', {}, true);
  }

  /**
   * Get current logged in user
   */
  getCurrentUser(): Observable<ApiResponse<any>> {
    return this.get('/api/method/frappe.auth.get_logged_user');
  }

  /**
   * Build full URL from relative path
   */
  private buildUrl(url: string): string {
    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // If starts with /, use as-is (relative to domain)
    if (url.startsWith('/')) {
      return url;
    }

    // Otherwise, prepend /
    return `/${url}`;
  }

  /**
   * Normalize Frappe response to consistent format
   */
  private normalizeResponse<T>(response: any): ApiResponse<T> {
    // Frappe returns data in 'message' field
    const normalized: ApiResponse<T> = {
      success: !response.exc && !response.error,
      message: response.message,
      data: response.message || response.data
    };

    // Extract detailed error message if available
    if (!normalized.success && response._server_messages) {
      const detailedMessage = this.extractServerMessage(response);
      if (detailedMessage) {
        normalized.error = detailedMessage;
      }
    }

    // Include original error info
    if (response.exc) {
      normalized.error = response.exc;
      normalized.exc = response.exc;
    }

    if (response.error_code) {
      normalized.error_code = response.error_code;
    }

    return normalized;
  }

  /**
   * Handle HTTP errors
   * Extracts Frappe error messages and throws them properly
   */
  private handleError(error: any): Observable<never> {
    console.error('[Frappe API Error]', error);

    let errorMessage = 'Error desconocido';

    // Extract Frappe error details from response body
    if (error.error) {
      // Try to extract from _server_messages (Frappe's standard error format)
      if (error.error._server_messages) {
        const detailedMessage = this.extractServerMessage(error.error);
        if (detailedMessage) {
          errorMessage = detailedMessage;
        }
      }
      // Fallback to exc_type or message
      else if (error.error.message) {
        errorMessage = error.error.message;
      }
      else if (typeof error.error === 'string') {
        errorMessage = error.error;
      }
    }
    // Fallback to HTTP error message
    else if (error.message) {
      errorMessage = error.message;
    }

    // Throw the error so it reaches the error callback in subscribers
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Set API token for authentication (for testing/dev)
   */
  setApiToken(token: string): void {
    this.config.authorizationMode = 'api-token';
    this.config.token = token;
    localStorage.setItem('frappe_api_token', token);
  }

  /**
   * Clear API token
   */
  clearApiToken(): void {
    this.config.authorizationMode = 'csrf-token';
    this.config.token = undefined;
    localStorage.removeItem('frappe_api_token');
  }

  /**
   * Set User Contact authentication token
   * This token is used for guest user authentication via X-User-Contact-Token header
   */
  setUserContactToken(token: string): void {
    console.log('[Auth Debug] setUserContactToken called with:', token.substring(0, 20) + '...');
    this.config.userContactToken = token;
    localStorage.setItem('sp_auth_token', token);
    // Verify it was saved
    const saved = localStorage.getItem('sp_auth_token');
    console.log('[Auth Debug] Token saved to localStorage:', saved ? saved.substring(0, 20) + '...' : 'null');
  }

  /**
   * Clear User Contact authentication token
   */
  clearUserContactToken(): void {
    this.config.userContactToken = undefined;
    localStorage.removeItem('sp_auth_token');
  }

  /**
   * Get current User Contact token
   */
  getUserContactToken(): string | undefined {
    return this.config.userContactToken;
  }

  /**
   * Get DocType metadata (fields configuration)
   * Uses GET request to avoid CSRF issues
   * Returns raw response without normalization
   */
  getDocTypeMeta(doctype: string): Observable<any> {
    const url = `/api/method/frappe.desk.form.load.getdoctype`;

    const params = new HttpParams()
      .set('doctype', doctype)
      .set('with_parent', '1');

    return this.http.get<any>(this.buildUrl(url), {
      headers: this.getAuthHeaders(),
      params: params
    }).pipe(
      // Return raw response - it already has the correct structure
      catchError(err => this.handleError(err))
    );
  }
}
