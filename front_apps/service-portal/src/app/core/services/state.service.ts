/**
 * State Service
 *
 * Centralized state management for the Service Portal application
 * Uses Angular Signals for reactive state management
 */

import { Injectable, signal, computed } from '@angular/core';
import { User } from '../models/user.model';
import { ServicePortal, UserContact } from '../models/service-portal.model';

// Storage keys
const STORAGE_KEYS = {
  currentUser: 'sp_current_user',
  selectedPortal: 'sp_selected_portal',
  userContact: 'sp_user_contact',
  authToken: 'sp_auth_token'
};

// Header name for auth token
export const AUTH_TOKEN_HEADER = 'X-User-Contact-Token';

export interface AppState {
  // Frappe Authentication (optional, for admin users)
  currentUser: User | null;
  isAuthenticated: boolean;

  // Portal Context
  selectedPortal: ServicePortal | null;

  // User Contact Authentication (for guest users)
  userContact: UserContact | null;
  authToken: string | null;
  isUserContactAuthenticated: boolean;

  // UI State
  isLoading: boolean;
  globalError: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class StateService {
  // Private writable signals
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private selectedPortalSignal = signal<ServicePortal | null>(null);
  private userContactSignal = signal<UserContact | null>(null);
  private authTokenSignal = signal<string | null>(null);
  private isLoadingSignal = signal<boolean>(false);
  private globalErrorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  readonly selectedPortal = this.selectedPortalSignal.asReadonly();
  readonly userContact = this.userContactSignal.asReadonly();
  readonly authToken = this.authTokenSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly globalError = this.globalErrorSignal.asReadonly();

  // Computed signals
  readonly isPortalSelected = computed(() => this.selectedPortalSignal() !== null);
  readonly hasUserContact = computed(() => this.userContactSignal() !== null);
  readonly isUserContactAuthenticated = computed(() =>
    this.userContactSignal() !== null && this.authTokenSignal() !== null
  );
  readonly needsContactRegistration = computed(() => {
    const portal = this.selectedPortalSignal();
    const contact = this.userContactSignal();
    // Contact registration is always required when a portal is selected
    return portal !== null && !contact;
  });

  // Full state computed signal (for debugging/logging)
  readonly state = computed<AppState>(() => ({
    currentUser: this.currentUserSignal(),
    isAuthenticated: this.isAuthenticatedSignal(),
    selectedPortal: this.selectedPortalSignal(),
    userContact: this.userContactSignal(),
    authToken: this.authTokenSignal(),
    isUserContactAuthenticated: this.isUserContactAuthenticated(),
    isLoading: this.isLoadingSignal(),
    globalError: this.globalErrorSignal()
  }));

  constructor() {
    // Load persisted state from localStorage on init
    this.loadPersistedState();
  }

  // ===================
  // Authentication State
  // ===================

  /**
   * Set current user and authentication status
   */
  setCurrentUser(user: User | null): void {
    this.currentUserSignal.set(user);
    this.isAuthenticatedSignal.set(!!user);

    // Persist to localStorage
    if (user) {
      localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.currentUser);
    }
  }

  /**
   * Clear authentication state
   */
  clearAuth(): void {
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    localStorage.removeItem(STORAGE_KEYS.currentUser);
  }

  // ===================
  // Portal State
  // ===================

  /**
   * Set selected portal
   */
  setSelectedPortal(portal: ServicePortal | null): void {
    this.selectedPortalSignal.set(portal);

    // Persist to localStorage
    if (portal) {
      localStorage.setItem(STORAGE_KEYS.selectedPortal, JSON.stringify(portal));
    } else {
      localStorage.removeItem(STORAGE_KEYS.selectedPortal);
    }
  }

  /**
   * Clear portal selection
   */
  clearPortal(): void {
    this.selectedPortalSignal.set(null);
    localStorage.removeItem(STORAGE_KEYS.selectedPortal);
  }

  // ===================
  // User Contact State
  // ===================

  /**
   * Set user contact and optionally auth token
   */
  setUserContact(contact: UserContact | null, authToken?: string): void {
    this.userContactSignal.set(contact);

    // Persist to localStorage
    if (contact) {
      localStorage.setItem(STORAGE_KEYS.userContact, JSON.stringify(contact));
    } else {
      localStorage.removeItem(STORAGE_KEYS.userContact);
    }

    // If auth token is provided, store it
    if (authToken) {
      this.setAuthToken(authToken);
    }
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string | null): void {
    this.authTokenSignal.set(token);

    if (token) {
      localStorage.setItem(STORAGE_KEYS.authToken, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.authToken);
    }
  }

  /**
   * Get current auth token (for use in API calls)
   */
  getAuthToken(): string | null {
    return this.authTokenSignal();
  }

  /**
   * Clear user contact and auth token
   */
  clearUserContact(): void {
    this.userContactSignal.set(null);
    this.authTokenSignal.set(null);
    localStorage.removeItem(STORAGE_KEYS.userContact);
    localStorage.removeItem(STORAGE_KEYS.authToken);
  }

  // ===================
  // UI State
  // ===================

  /**
   * Set global loading state
   */
  setLoading(loading: boolean): void {
    this.isLoadingSignal.set(loading);
  }

  /**
   * Set global error message
   */
  setGlobalError(error: string | null): void {
    this.globalErrorSignal.set(error);
  }

  /**
   * Clear global error
   */
  clearGlobalError(): void {
    this.globalErrorSignal.set(null);
  }

  // ===================
  // State Reset
  // ===================

  /**
   * Reset entire application state (on logout)
   */
  resetState(): void {
    this.clearAuth();
    this.clearPortal();
    this.clearUserContact();
    this.clearGlobalError();
    this.setLoading(false);
  }

  // ===================
  // Persistence
  // ===================

  /**
   * Load persisted state from localStorage
   */
  private loadPersistedState(): void {
    try {
      // Load user
      const userJson = localStorage.getItem(STORAGE_KEYS.currentUser);
      if (userJson) {
        const user = JSON.parse(userJson) as User;
        this.currentUserSignal.set(user);
        this.isAuthenticatedSignal.set(true);
      }

      // Load portal
      const portalJson = localStorage.getItem(STORAGE_KEYS.selectedPortal);
      if (portalJson) {
        const portal = JSON.parse(portalJson) as ServicePortal;
        this.selectedPortalSignal.set(portal);
      }

      // Load user contact
      const contactJson = localStorage.getItem(STORAGE_KEYS.userContact);
      if (contactJson) {
        const contact = JSON.parse(contactJson) as UserContact;
        this.userContactSignal.set(contact);
      }

      // Load auth token
      const authToken = localStorage.getItem(STORAGE_KEYS.authToken);
      if (authToken) {
        this.authTokenSignal.set(authToken);
      }
    } catch (error) {
      console.error('Error loading persisted state:', error);
      // Clear corrupted data
      this.clearPersistedState();
    }
  }

  /**
   * Clear all persisted state
   */
  clearPersistedState(): void {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    localStorage.removeItem(STORAGE_KEYS.selectedPortal);
    localStorage.removeItem(STORAGE_KEYS.userContact);
    localStorage.removeItem(STORAGE_KEYS.authToken);
  }
}
