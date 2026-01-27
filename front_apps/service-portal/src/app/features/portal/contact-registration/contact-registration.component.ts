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
import { PortalService, UserContactWithToken } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { UserContact, DocField } from '../../../core/models/service-portal.model';

// Registration step types
type RegistrationStep = 'initial' | 'login' | 'register';

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

  // Current registration step
  protected currentStep = signal<RegistrationStep>('initial');

  // Dynamic form fields from DocType metadata
  protected fields = signal<DocField[]>([]);
  protected formData = signal<Record<string, any>>({});
  protected loadingFields = signal(true);

  // UI state
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  // Existing contact (for updates) - may include auth token
  private existingContact: UserContactWithToken | null = null;

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
   * Navigate to the login step (existing user)
   */
  goToLogin(): void {
    this.currentStep.set('login');
    this.error.set(null);
    this.existingContact = null;
    // Set default document type to Cedula de ciudadania
    this.formData.set({
      document_type: 'Cedula de ciudadania'
    });
  }

  /**
   * Navigate to the register step (new user)
   */
  goToRegister(): void {
    this.currentStep.set('register');
    this.error.set(null);
    this.existingContact = null;
    // Reset form with default values
    const initialData: Record<string, any> = {};
    this.fields().forEach(field => {
      if (field.default) {
        initialData[field.fieldname] = field.default;
      }
    });
    this.formData.set(initialData);
  }

  /**
   * Go back to initial step
   */
  goToInitial(): void {
    this.currentStep.set('initial');
    this.error.set(null);
    this.existingContact = null;
    this.formData.set({});
  }

  /**
   * Validate login form (document fields only)
   */
  private validateLoginForm(): string | null {
    const data = this.formData();

    // Check document type
    if (!data['document_type'] || data['document_type'].toString().trim() === '') {
      return 'Por favor selecciona el tipo de documento';
    }

    // Check document number
    if (!data['document'] || data['document'].toString().trim() === '') {
      return 'Por favor ingresa el número de documento';
    }

    return null;
  }

  /**
   * Connect existing user by document number
   */
  onConnect(): void {
    this.error.set(null);

    // Validate login form
    const validationError = this.validateLoginForm();
    if (validationError) {
      this.error.set(validationError);
      return;
    }

    const portal = this.selectedPortal();
    if (!portal) {
      this.error.set('Error de sesión. Por favor recarga la página.');
      return;
    }

    this.loading.set(true);

    const document = this.formData()['document']?.toString().trim();

    this.portalService.getUserContactByDocument(document).subscribe({
      next: (contact) => {
        this.loading.set(false);

        if (contact) {
          // Contact found - save to state and navigate to portal
          this.stateService.setUserContact(contact, contact.auth_token);
          this.router.navigate(['/portal', portal.portal_name]);
        } else {
          // Contact not found
          this.error.set('No se encontró un usuario registrado con ese número de documento. Por favor verifica los datos o regístrate como nuevo usuario.');
        }
      },
      error: (err) => {
        console.error('Error connecting:', err);
        this.error.set(err.message || 'Error al buscar el usuario. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Get document type options from fields
   */
  getDocumentTypeOptions(): string[] {
    const field = this.fields().find(f => f.fieldname === 'document_type');
    if (field && field.options) {
      return field.options.split('\n').map(opt => opt.trim()).filter(opt => opt);
    }
    return [];
  }

  /**
   * Get document type field
   */
  getDocumentTypeField(): DocField | undefined {
    return this.fields().find(f => f.fieldname === 'document_type');
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

    this.loading.set(true);

    const contactData: Partial<UserContact> = { ...this.formData() };

    // Update existing contact or create new one
    if (this.existingContact && this.existingContact.name) {
      // Update existing contact - use the auth token from when we found the contact
      this.portalService.updateUserContact(this.existingContact.name, contactData).subscribe({
        next: (contact) => {
          // Save to state with auth token from the existing contact lookup
          this.stateService.setUserContact(contact, this.existingContact?.auth_token);
          this.loading.set(false);

          // Navigate to portal
          this.router.navigate(['/portal', portal.portal_name]);
        },
        error: (err) => {
          console.error('Error updating contact:', err);
          this.error.set(err.message || 'Error al actualizar la información. Por favor intenta de nuevo.');
          this.loading.set(false);
        }
      });
    } else {
      // Create new contact
      this.portalService.createUserContact(contactData).subscribe({
        next: (contact) => {
          // Save to state with auth token from creation response
          this.stateService.setUserContact(contact, contact.auth_token);
          this.loading.set(false);

          // Navigate to portal
          this.router.navigate(['/portal', portal.portal_name]);
        },
        error: (err) => {
          console.error('Error creating contact:', err);
          this.error.set(err.message || 'Error al registrar la información. Por favor intenta de nuevo.');
          this.loading.set(false);
        }
      });
    }
  }

  /**
   * Skip registration - No longer allowed, registration is always mandatory
   * @deprecated Contact registration is now mandatory for all portals
   */
  skip(): void {
    // Contact registration is always required, skip is not allowed
    // This method is kept for backwards compatibility but does nothing
  }

  /**
   * Cancel and go back
   */
  cancel(): void {
    this.router.navigate(['/portals']);
  }
}
