/**
 * State Service
 *
 * Centralized state management for the Service Portal application
 * Uses Angular Signals for reactive state management
 */

import { Injectable, signal, computed } from '@angular/core';
import { User } from '../models/user.model';
import { ServicePortal, UserContact } from '../models/service-portal.model';

export interface AppState {
  // Authentication
  currentUser: User | null;
  isAuthenticated: boolean;

  // Portal Context
  selectedPortal: ServicePortal | null;
  userContact: UserContact | null;

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
  private isLoadingSignal = signal<boolean>(false);
  private globalErrorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  readonly selectedPortal = this.selectedPortalSignal.asReadonly();
  readonly userContact = this.userContactSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly globalError = this.globalErrorSignal.asReadonly();

  // Computed signals
  readonly isPortalSelected = computed(() => this.selectedPortalSignal() !== null);
  readonly hasUserContact = computed(() => this.userContactSignal() !== null);
  readonly needsContactRegistration = computed(() => {
    const portal = this.selectedPortalSignal();
    const contact = this.userContactSignal();
    return portal?.request_contact_user_data && !contact;
  });

  // Full state computed signal (for debugging/logging)
  readonly state = computed<AppState>(() => ({
    currentUser: this.currentUserSignal(),
    isAuthenticated: this.isAuthenticatedSignal(),
    selectedPortal: this.selectedPortalSignal(),
    userContact: this.userContactSignal(),
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
      localStorage.setItem('sp_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sp_current_user');
    }
  }

  /**
   * Clear authentication state
   */
  clearAuth(): void {
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    localStorage.removeItem('sp_current_user');
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
      localStorage.setItem('sp_selected_portal', JSON.stringify(portal));
    } else {
      localStorage.removeItem('sp_selected_portal');
    }
  }

  /**
   * Clear portal selection
   */
  clearPortal(): void {
    this.selectedPortalSignal.set(null);
    localStorage.removeItem('sp_selected_portal');
  }

  // ===================
  // User Contact State
  // ===================

  /**
   * Set user contact
   */
  setUserContact(contact: UserContact | null): void {
    this.userContactSignal.set(contact);

    // Persist to localStorage
    if (contact) {
      localStorage.setItem('sp_user_contact', JSON.stringify(contact));
    } else {
      localStorage.removeItem('sp_user_contact');
    }
  }

  /**
   * Clear user contact
   */
  clearUserContact(): void {
    this.userContactSignal.set(null);
    localStorage.removeItem('sp_user_contact');
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
      const userJson = localStorage.getItem('sp_current_user');
      if (userJson) {
        const user = JSON.parse(userJson) as User;
        this.currentUserSignal.set(user);
        this.isAuthenticatedSignal.set(true);
      }

      // Load portal
      const portalJson = localStorage.getItem('sp_selected_portal');
      if (portalJson) {
        const portal = JSON.parse(portalJson) as ServicePortal;
        this.selectedPortalSignal.set(portal);
      }

      // Load user contact
      const contactJson = localStorage.getItem('sp_user_contact');
      if (contactJson) {
        const contact = JSON.parse(contactJson) as UserContact;
        this.userContactSignal.set(contact);
      }
    } catch (error) {
      console.error('Error loading persisted state:', error);
      // Clear corrupted data
      localStorage.removeItem('sp_current_user');
      localStorage.removeItem('sp_selected_portal');
      localStorage.removeItem('sp_user_contact');
    }
  }

  /**
   * Clear all persisted state
   */
  clearPersistedState(): void {
    localStorage.removeItem('sp_current_user');
    localStorage.removeItem('sp_selected_portal');
    localStorage.removeItem('sp_user_contact');
  }
}
