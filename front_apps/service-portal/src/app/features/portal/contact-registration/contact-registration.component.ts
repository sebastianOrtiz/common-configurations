/**
 * Contact Registration Component
 *
 * Allows users to register their contact information for portal access
 */

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { UserContact } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-contact-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact-registration.component.html',
  styleUrls: ['./contact-registration.component.scss']
})
export class ContactRegistrationComponent implements OnInit {
  // Form fields
  protected firstName = signal('');
  protected lastName = signal('');
  protected phone = signal('');
  protected company = signal('');

  // UI state
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  // State
  protected currentUser = this.stateService.currentUser;
  protected selectedPortal = this.stateService.selectedPortal;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private portalService: PortalService,
    private stateService: StateService
  ) {}

  ngOnInit(): void {
    // Check if user already has a contact
    if (this.stateService.userContact()) {
      // Already registered, redirect to portal
      const portalName = this.route.snapshot.paramMap.get('portalName');
      if (portalName) {
        this.router.navigate(['/portal', portalName]);
      }
    }

    // Pre-fill email if available
    const user = this.currentUser();
    if (user && user.full_name) {
      const nameParts = user.full_name.split(' ');
      if (nameParts.length >= 2) {
        this.firstName.set(nameParts[0]);
        this.lastName.set(nameParts.slice(1).join(' '));
      } else {
        this.firstName.set(user.full_name);
      }
    }
  }

  /**
   * Submit contact registration
   */
  onSubmit(): void {
    this.error.set(null);

    // Validation
    const first = this.firstName().trim();
    const last = this.lastName().trim();

    if (!first || !last) {
      this.error.set('Por favor completa tu nombre y apellido');
      return;
    }

    const user = this.currentUser();
    const portal = this.selectedPortal();

    if (!user || !portal) {
      this.error.set('Error de sesión. Por favor intenta de nuevo.');
      return;
    }

    // Create user contact
    this.loading.set(true);

    const contactData: Partial<UserContact> = {
      email: user.email,
      first_name: first,
      last_name: last,
      phone: this.phone().trim() || undefined,
      company: this.company().trim() || undefined,
      user: user.name
    };

    this.portalService.createUserContact(contactData).subscribe({
      next: (contact) => {
        // Save to state
        this.stateService.setUserContact(contact);
        this.loading.set(false);

        // Navigate to portal
        this.router.navigate(['/portal', portal.name]);
      },
      error: (err) => {
        console.error('Error creating contact:', err);
        this.error.set('Error al registrar tu información. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Skip registration (if allowed)
   */
  skip(): void {
    const portal = this.selectedPortal();
    if (portal && !portal.request_contact_user_data) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  /**
   * Cancel and go back
   */
  cancel(): void {
    this.router.navigate(['/portals']);
  }
}
