/**
 * Authentication Service
 *
 * Handles user authentication with Frappe
 */

import { Injectable, inject } from '@angular/core';
import { Observable, tap, map, of } from 'rxjs';
import { FrappeApiService, ApiResponse } from './frappe-api.service';
import { StateService } from './state.service';
import { User, LoginCredentials, LoginResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);

  // Expose state from StateService
  readonly currentUser = this.stateService.currentUser;
  readonly isAuthenticated = this.stateService.isAuthenticated;
  readonly isLoading = this.stateService.isLoading;

  constructor() {
    // Check auth status on init
    this.checkAuthStatus();
  }

  /**
   * Check if user is authenticated
   */
  checkAuthStatus(): Observable<boolean> {
    this.stateService.setLoading(true);

    return this.frappeApi.getCurrentUser().pipe(
      map(response => {
        if (response.success && response.message) {
          const userEmail = response.message;

          // If user is logged in (not Guest)
          if (userEmail && userEmail !== 'Guest') {
            this.stateService.setCurrentUser({
              name: userEmail,
              email: userEmail
            });
            this.stateService.setLoading(false);
            return true;
          }
        }

        // Not authenticated
        this.stateService.setCurrentUser(null);
        this.stateService.setLoading(false);
        return false;
      })
    );
  }

  /**
   * Login with username and password
   */
  login(credentials: LoginCredentials): Observable<ApiResponse<LoginResponse>> {
    this.stateService.setLoading(true);

    return this.frappeApi.login(credentials.usr, credentials.pwd).pipe(
      tap(response => {
        if (response.success) {
          // After successful login, get user details
          this.checkAuthStatus().subscribe();
        } else {
          this.stateService.setLoading(false);
        }
      })
    );
  }

  /**
   * Logout current user
   */
  logout(): Observable<ApiResponse<any>> {
    this.stateService.setLoading(true);

    return this.frappeApi.logout().pipe(
      tap(() => {
        // Reset entire application state
        this.stateService.resetState();

        // Clear any stored tokens
        this.frappeApi.clearApiToken();
      })
    );
  }

  /**
   * Get current user details
   */
  getUserDetails(): Observable<ApiResponse<User>> {
    const currentUser = this.stateService.currentUser();
    if (!currentUser) {
      return of({ success: false, error: 'Not authenticated' });
    }

    return this.frappeApi.getDoc('User', currentUser.email).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.stateService.setCurrentUser(response.data);
        }
      })
    );
  }

  /**
   * Set API token for authentication (for dev/testing)
   */
  setApiToken(token: string): void {
    this.frappeApi.setApiToken(token);
    // Fetch user details with token
    this.checkAuthStatus().subscribe();
  }
}
