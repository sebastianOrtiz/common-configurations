/**
 * Contact Registration Component
 *
 * Dynamically generates registration form based on User Contact DocType fields
 * Allows system users to register third-party contact information
 * (clients, patients, etc.) who will receive the service
 */

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { UserContact, DocField } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-contact-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact-registration.component.html',
  styleUrls: ['./contact-registration.component.scss']
})
export class ContactRegistrationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private portalService = inject(PortalService);
  private stateService = inject(StateService);

  // Dynamic form fields from DocType metadata
  protected fields = signal<DocField[]>([]);
  protected formData = signal<Record<string, any>>({});
  protected loadingFields = signal(true);

  // UI state
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  // State
  protected currentUser = this.stateService.currentUser;
  protected selectedPortal = this.stateService.selectedPortal;

  ngOnInit(): void {
    // Check if user already has a contact
    if (this.stateService.userContact()) {
      // Already registered, redirect to portal
      const portalName = this.route.snapshot.paramMap.get('portalName');
      if (portalName) {
        this.router.navigate(['/portal', portalName]);
      }
      return;
    }

    // Load User Contact DocType fields
    this.loadFields();
  }

  /**
   * Load fields from User Contact DocType
   */
  protected loadFields(): void {
    this.loadingFields.set(true);
    this.error.set(null);

    this.portalService.getUserContactFields().subscribe({
      next: (fields) => {
        this.fields.set(fields);

        // Initialize form data with default values
        const initialData: Record<string, any> = {};
        fields.forEach(field => {
          if (field.default) {
            initialData[field.fieldname] = field.default;
          }
        });
        this.formData.set(initialData);

        this.loadingFields.set(false);
      },
      error: (err) => {
        console.error('Error loading fields:', err);
        this.error.set('Error al cargar el formulario. Por favor intenta de nuevo.');
        this.loadingFields.set(false);
      }
    });
  }

  /**
   * Get field value
   */
  getFieldValue(fieldname: string): any {
    return this.formData()[fieldname] || '';
  }

  /**
   * Set field value
   */
  setFieldValue(fieldname: string, value: any): void {
    const currentData = this.formData();
    this.formData.set({
      ...currentData,
      [fieldname]: value
    });
  }

  /**
   * Get select options as array
   */
  getSelectOptions(field: DocField): string[] {
    if (!field.options) return [];
    return field.options.split('\n').map(opt => opt.trim()).filter(opt => opt);
  }

  /**
   * Get input type for field
   */
  getInputType(field: DocField): string {
    switch (field.fieldtype) {
      case 'Int':
      case 'Float':
      case 'Currency':
        return 'number';
      case 'Email':
      case 'Phone':
        return field.fieldtype.toLowerCase();
      case 'Date':
        return 'date';
      case 'Datetime':
        return 'datetime-local';
      case 'Time':
        return 'time';
      case 'Check':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  /**
   * Validate form
   */
  private validateForm(): string | null {
    const data = this.formData();
    const fields = this.fields();

    // Check required fields
    for (const field of fields) {
      if (field.reqd) {
        const value = data[field.fieldname];
        if (value === undefined || value === null || value === '') {
          return `El campo "${field.label}" es obligatorio`;
        }
      }
    }

    // Validate email format if email field exists
    const emailField = fields.find(f => f.fieldtype === 'Email' || f.options === 'Email');
    if (emailField && data[emailField.fieldname]) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data[emailField.fieldname])) {
        return `Por favor ingresa un email válido en "${emailField.label}"`;
      }
    }

    return null;
  }

  /**
   * Submit contact registration
   */
  onSubmit(): void {
    this.error.set(null);

    // Validate form
    const validationError = this.validateForm();
    if (validationError) {
      this.error.set(validationError);
      return;
    }

    const portal = this.selectedPortal();

    if (!portal) {
      this.error.set('Error de sesión. Por favor recarga la página.');
      return;
    }

    // Create user contact with form data
    this.loading.set(true);

    const contactData: Partial<UserContact> = { ...this.formData() };

    this.portalService.createUserContact(contactData).subscribe({
      next: (contact) => {
        // Save to state
        this.stateService.setUserContact(contact);
        this.loading.set(false);

        // Navigate to portal
        this.router.navigate(['/portal', portal.portal_name]);
      },
      error: (err) => {
        console.error('Error creating contact:', err);
        this.error.set(err.error || 'Error al registrar la información. Por favor intenta de nuevo.');
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
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  /**
   * Cancel and go back
   */
  cancel(): void {
    this.router.navigate(['/portals']);
  }
}
