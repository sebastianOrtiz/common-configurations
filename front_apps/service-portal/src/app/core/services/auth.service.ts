/**
 * Authentication Service
 *
 * Handles user authentication with Frappe
 */

import { Injectable, signal } from '@angular/core';
import { Observable, tap, map, of } from 'rxjs';
import { FrappeApiService, ApiResponse } from './frappe-api.service';
import { User, LoginCredentials, LoginResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Reactive state
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private isLoadingSignal = signal<boolean>(false);

  // Public read-only signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();

  constructor(private frappeApi: FrappeApiService) {
    // Check auth status on init
    this.checkAuthStatus();
  }

  /**
   * Check if user is authenticated
   */
  checkAuthStatus(): Observable<boolean> {
    this.isLoadingSignal.set(true);

    return this.frappeApi.getCurrentUser().pipe(
      map(response => {
        if (response.success && response.message) {
          const userEmail = response.message;

          // If user is logged in (not Guest)
          if (userEmail && userEmail !== 'Guest') {
            this.currentUserSignal.set({
              name: userEmail,
              email: userEmail
            });
            this.isAuthenticatedSignal.set(true);
            this.isLoadingSignal.set(false);
            return true;
          }
        }

        // Not authenticated
        this.currentUserSignal.set(null);
        this.isAuthenticatedSignal.set(false);
        this.isLoadingSignal.set(false);
        return false;
      })
    );
  }

  /**
   * Login with username and password
   */
  login(credentials: LoginCredentials): Observable<ApiResponse<LoginResponse>> {
    this.isLoadingSignal.set(true);

    return this.frappeApi.login(credentials.usr, credentials.pwd).pipe(
      tap(response => {
        if (response.success) {
          // After successful login, get user details
          this.checkAuthStatus().subscribe();
        } else {
          this.isLoadingSignal.set(false);
        }
      })
    );
  }

  /**
   * Logout current user
   */
  logout(): Observable<ApiResponse<any>> {
    this.isLoadingSignal.set(true);

    return this.frappeApi.logout().pipe(
      tap(() => {
        this.currentUserSignal.set(null);
        this.isAuthenticatedSignal.set(false);
        this.isLoadingSignal.set(false);

        // Clear any stored tokens
        this.frappeApi.clearApiToken();
      })
    );
  }

  /**
   * Get current user details
   */
  getUserDetails(): Observable<ApiResponse<User>> {
    const currentUser = this.currentUserSignal();
    if (!currentUser) {
      return of({ success: false, error: 'Not authenticated' });
    }

    return this.frappeApi.getDoc('User', currentUser.email).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
        }
      })
    );
  }

  /**
   * Set API token for authentication (for dev/testing)
   */
  setApiToken(token: string): void {
    this.frappeApi.setApiToken(token);
    this.isAuthenticatedSignal.set(true);
    // Optionally fetch user details with token
  }
}
