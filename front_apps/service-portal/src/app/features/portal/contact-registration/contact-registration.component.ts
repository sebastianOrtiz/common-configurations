/**
 * Contact Registration Component
 *
 * Dynamically generates registration form based on User Contact DocType fields
 * Allows system users to register third-party contact information
 * (clients, patients, etc.) who will receive the service
 *
 * Now includes MFA via OTP (SMS/WhatsApp) when enabled in OTP Settings.
 */

import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PortalService, UserContactWithToken } from '../../../core/services/portal.service';
import { StateService } from '../../../core/services/state.service';
import { OtpService } from '../../../core/services/otp.service';
import { UserContact, DocField, OTPSettings } from '../../../core/models/service-portal.model';
import { OtpVerificationComponent, RegistrationVerifiedResult } from './otp-verification/otp-verification.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { VoiceAssistantComponent, VoicePrompt } from '../../../shared/components/voice-assistant/voice-assistant.component';
import { SettingsService } from '../../../core/services/settings.service';
import { ViewChild } from '@angular/core';

// Registration step types - now includes 'otp' for OTP verification
type RegistrationStep = 'initial' | 'login' | 'register' | 'otp';

@Component({
  selector: 'app-contact-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, OtpVerificationComponent, IconComponent, VoiceAssistantComponent],
  templateUrl: './contact-registration.component.html',
  styleUrls: ['./contact-registration.component.scss']
})
export class ContactRegistrationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private portalService = inject(PortalService);
  private stateService = inject(StateService);
  private otpService = inject(OtpService);
  protected settingsService = inject(SettingsService);

  @ViewChild(VoiceAssistantComponent) voiceAssistant?: VoiceAssistantComponent;

  /**
   * Optional override for post-auth navigation. When the component is
   * embedded outside a real portal (e.g. the Tenant Hub login wrapper),
   * the host sets this URL and we navigate there instead of /portal/<x>.
   */
  @Input() postAuthRedirect?: string;

  private navigateAfterAuth(portalName: string): void {
    if (this.postAuthRedirect) {
      this.router.navigateByUrl(this.postAuthRedirect);
    } else {
      this.router.navigate(['/portal', portalName]);
    }
  }

  // Current registration step
  protected currentStep = signal<RegistrationStep>('initial');

  // Dynamic form fields from DocType metadata
  protected fields = signal<DocField[]>([]);
  protected formData = signal<Record<string, any>>({});
  protected loadingFields = signal(true);

  // UI state
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  // OTP state
  protected otpSettings = signal<OTPSettings | null>(null);
  protected otpDocument = signal<string>('');  // Document number for OTP verification
  protected otpMode = signal<'login' | 'registration'>('login');  // OTP flow mode
  protected registrationFormData = signal<Record<string, any> | null>(null);  // Form data for registration OTP

  // Existing contact (for updates) - may include auth token
  private existingContact: UserContactWithToken | null = null;
  // Pending contact for OTP verification (user found but needs OTP)
  private pendingOtpContact: UserContactWithToken | null = null;

  // State
  protected currentUser = this.stateService.currentUser;
  protected selectedPortal = this.stateService.selectedPortal;
  protected referrerPortal = this.stateService.referrerPortal;

  ngOnInit(): void {
    // Check if user already has a contact
    if (this.stateService.userContact()) {
      // Already registered, redirect to portal
      const portalName = this.route.snapshot.paramMap.get('portalName');
      if (portalName) {
        this.navigateAfterAuth(portalName);
      }
      return;
    }

    // Ensure the selected portal is loaded into state. Without this, users
    // arriving directly at /portal/<x>/register (reload, shared link, bookmark)
    // would see "Error de sesión" when submitting because selectedPortal()
    // is null until the home view loads it.
    this.ensurePortalLoaded();

    // Load User Contact DocType fields
    this.loadFields();
  }

  private ensurePortalLoaded(): void {
    if (this.stateService.selectedPortal()) return;

    const portalName = this.route.snapshot.paramMap.get('portalName');
    if (!portalName) return;

    this.portalService.getPortal(portalName).subscribe({
      next: (portal) => {
        if (portal) {
          this.stateService.setSelectedPortal(portal);
        }
      },
      error: (err) => {
        console.error('Error loading portal:', err);
        this.error.set('No se pudo cargar el portal. Verifica el enlace o intenta de nuevo.');
      }
    });
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
      this.error.set('Error de sesion. Por favor recarga la pagina.');
      return;
    }

    this.loading.set(true);

    const document = this.formData()['document']?.toString().trim();

    this.portalService.getUserContactByDocument(document).subscribe({
      next: (contact) => {
        this.loading.set(false);

        if (contact) {
          const portalRequiresMfa = portal?.enable_mfa_otp !== false;
          if (contact.requires_otp && contact.otp_settings && portalRequiresMfa) {
            // Store contact and settings for OTP verification
            this.pendingOtpContact = contact;
            this.otpSettings.set(contact.otp_settings);
            this.otpDocument.set(document);
            this.currentStep.set('otp');
          } else if (contact.auth_token) {
            // OTP not required - proceed with auth token
            this.stateService.setUserContact(contact, contact.auth_token);
            this.navigateAfterAuth(portal.portal_name);
          } else {
            // No token and no OTP - something is wrong
            this.error.set('Error de autenticacion. Por favor intenta de nuevo.');
          }
        } else {
          // Contact not found
          this.error.set('No se encontro un usuario registrado con ese numero de documento. Por favor verifica los datos o registrate como nuevo usuario.');
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
   * If OTP is enabled, uses OTP verification flow before creating the user.
   * Otherwise, creates the user directly.
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
          this.navigateAfterAuth(portal.portal_name);
        },
        error: (err) => {
          console.error('Error updating contact:', err);
          this.error.set(err.message || 'Error al actualizar la información. Por favor intenta de nuevo.');
          this.loading.set(false);
        }
      });
    } else {
      const portalWantsMfa = portal.require_auth && portal.enable_mfa_otp !== false;

      if (portalWantsMfa) {
        this.otpService.getOtpSettings().subscribe({
          next: (otpSettings) => {
            this.loading.set(false);

            if (otpSettings.enabled) {
              this.registrationFormData.set(contactData);
              this.otpSettings.set(otpSettings);
              this.otpDocument.set(contactData.document || '');
              this.otpMode.set('registration');
              this.currentStep.set('otp');
            } else {
              this.createUserDirectly(contactData, portal.portal_name);
            }
          },
          error: (err) => {
            console.error('Error checking OTP settings:', err);
            this.createUserDirectly(contactData, portal.portal_name);
          }
        });
      } else {
        this.loading.set(false);
        this.createUserDirectly(contactData, portal.portal_name);
      }
    }
  }

  /**
   * Create user contact directly without OTP verification
   */
  private createUserDirectly(contactData: Partial<UserContact>, portalName: string): void {
    this.loading.set(true);

    this.portalService.createUserContact(contactData).subscribe({
      next: (contact) => {
        this.loading.set(false);

        if (contact.auth_token) {
          // User created successfully
          this.stateService.setUserContact(contact, contact.auth_token);
          this.navigateAfterAuth(portalName);
        } else {
          this.error.set('Error de autenticación. Por favor intenta de nuevo.');
        }
      },
      error: (err) => {
        console.error('Error creating contact:', err);
        this.error.set(err.message || 'Error al registrar la información. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
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

  /**
   * Go back to the referrer portal (when navigated via portal_redirect)
   */
  goBackToReferrer(): void {
    const referrer = this.referrerPortal();
    if (!referrer) return;
    this.stateService.clearReferrerPortal();
    this.router.navigate(['/portal', referrer]);
  }

  /**
   * Handle successful OTP verification (login mode)
   * Called by OtpVerificationComponent when OTP is verified for existing user
   */
  onOtpVerified(authToken: string): void {
    const portal = this.selectedPortal();
    if (!portal) {
      this.error.set('Error de sesion. Por favor recarga la pagina.');
      this.currentStep.set('initial');
      return;
    }

    // Set the auth token in the portal service
    this.portalService.setAuthToken(authToken);

    // Use the pending contact info if available
    if (this.pendingOtpContact) {
      this.stateService.setUserContact(this.pendingOtpContact, authToken);
    }

    // Navigate to portal
    this.navigateAfterAuth(portal.portal_name);
  }

  /**
   * Handle successful registration OTP verification
   * Called by OtpVerificationComponent when OTP is verified for new user registration
   */
  onRegistrationVerified(result: RegistrationVerifiedResult): void {
    const portal = this.selectedPortal();
    if (!portal) {
      this.error.set('Error de sesion. Por favor recarga la pagina.');
      this.currentStep.set('initial');
      return;
    }

    // Set the auth token in the portal service
    this.portalService.setAuthToken(result.auth_token);

    // Set user contact in state
    this.stateService.setUserContact(result.user_contact, result.auth_token);

    // Clear registration form data
    this.registrationFormData.set(null);

    // Navigate to portal
    this.navigateAfterAuth(portal.portal_name);
  }

  /**
   * Handle OTP verification cancellation
   * Called by OtpVerificationComponent when user cancels
   */
  onOtpCancelled(): void {
    // Reset OTP state and go back to initial step
    this.pendingOtpContact = null;
    this.otpSettings.set(null);
    this.otpDocument.set('');
    this.otpMode.set('login');
    this.registrationFormData.set(null);
    this.currentStep.set('initial');
    this.error.set(null);
  }

  // ============================================================
  // Voice Assistant integration (MVP, no AI)
  // ============================================================

  /** Convenience getter for the template */
  get isVoiceAssistantAvailable(): boolean {
    return this.settingsService.isVoiceAssistantEnabled();
  }

  /**
   * Build prompts from the dynamic fields and run the voice assistant.
   * The user dictates each field; on completion the form is auto-filled.
   */
  async startVoiceAssistant(): Promise<void> {
    if (!this.voiceAssistant) return;

    const visibleFields = this.fields().filter(
      (f) => !f.hidden && !f.read_only && f.fieldtype !== 'Check'
    );

    const prompts: VoicePrompt[] = visibleFields.map((f) => {
      const label = f.label || f.fieldname;
      const isOptional = !f.reqd;
      let question = `¿Cuál es tu ${label.toLowerCase()}?`;
      let sanitize: ((v: string) => string | null) | undefined;
      let minLength: number | undefined;

      // Customize question + sanitizer per fieldtype
      if (f.fieldtype === 'Select' && f.options) {
        const options = (f.options as string).split('\n').filter((o) => o.trim());
        question = `Selecciona tu ${label.toLowerCase()}. Las opciones son: ${options.join(', ')}.`;
        // Normalize: lowercase + strip diacritics (tildes) so "cédula" matches "Cedula"
        const norm = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        sanitize = (v: string) => {
          const target = norm(v);
          if (!target) return null;
          const exact = options.find((o) => norm(o) === target);
          if (exact) return exact;
          const partial = options.find((o) => {
            const oNorm = norm(o);
            return oNorm.includes(target) || target.includes(oNorm);
          });
          return partial || null;
        };
      } else if (f.fieldname === 'document' || (f.label || '').toLowerCase().includes('documento')) {
        question = `¿Cuál es tu número de ${label.toLowerCase()}? Por favor díctalo dígito por dígito.`;
        sanitize = (v: string) => sanitizeDigits(v);
        minLength = 6; // Documentos colombianos típicamente 6-10 dígitos
      } else if (f.fieldtype === 'Data' && (f.options === 'Email' || (f.label || '').toLowerCase().includes('correo'))) {
        question = `¿Cuál es tu correo electrónico? Puedes decir arroba, punto y guion para los símbolos.`;
        sanitize = (v: string) => sanitizeEmail(v);
        minLength = 5; // a@b.c mínimo
      } else if ((f.label || '').toLowerCase().includes('teléfono') || (f.label || '').toLowerCase().includes('telefono')) {
        question = `¿Cuál es tu número de teléfono?`;
        sanitize = (v: string) => sanitizeDigits(v, true);
        minLength = 7;
      }

      return {
        key: f.fieldname,
        question,
        sanitize,
        optional: isOptional,
        minLength,
        confirmTemplate: (val) => `Entendí ${val} para ${label.toLowerCase()}. ¿Es correcto? Di sí o no.`,
      };
    });

    try {
      const answers = await this.voiceAssistant.startSurvey(prompts);
      // Merge answers into formData
      this.formData.update((current) => ({ ...current, ...answers }));
    } catch (err) {
      // User cancelled — silent, no error to show
    }
  }

  /**
   * Voice assistant for the login step: asks only for the document number
   * and triggers the same `onConnect()` flow used by the form.
   */
  async startVoiceLoginAssistant(): Promise<void> {
    if (!this.voiceAssistant) return;

    const prompts: VoicePrompt[] = [
      {
        key: 'document',
        question:
          '¿Cuál es tu número de documento para iniciar sesión? Por favor díctalo dígito por dígito.',
        sanitize: (v: string) => sanitizeDigits(v),
        confirmTemplate: (val) =>
          `Entendí ${val}. ¿Es correcto tu número de documento? Di sí o no.`,
      },
    ];

    try {
      const answers = await this.voiceAssistant.startSurvey(prompts);
      if (answers['document']) {
        // Merge into formData (login form uses formData()['document'])
        this.formData.update((current) => ({ ...current, document: answers['document'] }));
        // Slight delay so the user sees the field filled before submit
        setTimeout(() => this.onConnect(), 200);
      }
    } catch (err) {
      // User cancelled
    }
  }
}

// ============================================================
// Voice sanitizer helpers (Spanish)
// ============================================================

/**
 * Convert Spanish number words to digits and strip everything non-digit.
 * Handles: cero..nueve, diez..diecinueve, veinte..veintinueve, treinta..noventa.
 * Useful for cédula/document numbers dictated by voice.
 *
 * @param allowPlus if true, keep '+' (for phone numbers with country code)
 */
function sanitizeDigits(input: string, allowPlus: boolean = false): string | null {
  if (!input) return null;

  let text = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  // Words → digits (order matters: longest first)
  const replacements: Array<[RegExp, string]> = [
    // 16-19
    [/\bdiecis[eé]is\b/g, '16'],
    [/\bdiecisiete\b/g, '17'],
    [/\bdieciocho\b/g, '18'],
    [/\bdiecinueve\b/g, '19'],
    // 21-29
    [/\bveintiun[oa]?\b/g, '21'],
    [/\bveintid[oó]s\b/g, '22'],
    [/\bveintitr[eé]s\b/g, '23'],
    [/\bveinticuatro\b/g, '24'],
    [/\bveinticinco\b/g, '25'],
    [/\bveintis[eé]is\b/g, '26'],
    [/\bveintisiete\b/g, '27'],
    [/\bveintiocho\b/g, '28'],
    [/\bveintinueve\b/g, '29'],
    // Tens 20-90
    [/\bveinte\b/g, '20'],
    [/\btreinta\b/g, '30'],
    [/\bcuarenta\b/g, '40'],
    [/\bcincuenta\b/g, '50'],
    [/\bsesenta\b/g, '60'],
    [/\bsetenta\b/g, '70'],
    [/\bochenta\b/g, '80'],
    [/\bnoventa\b/g, '90'],
    // 10-15
    [/\bdiez\b/g, '10'],
    [/\bonce\b/g, '11'],
    [/\bdoce\b/g, '12'],
    [/\btrece\b/g, '13'],
    [/\bcatorce\b/g, '14'],
    [/\bquince\b/g, '15'],
    // 0-9
    [/\bcero\b/g, '0'],
    [/\bun[oa]?\b/g, '1'],
    [/\bdos\b/g, '2'],
    [/\btres\b/g, '3'],
    [/\bcuatro\b/g, '4'],
    [/\bcinco\b/g, '5'],
    [/\bseis\b/g, '6'],
    [/\bsiete\b/g, '7'],
    [/\bocho\b/g, '8'],
    [/\bnueve\b/g, '9'],
    // Connectors
    [/\b(y|guion|guion bajo|menos)\b/g, ''],
    [/\bm[aá]s\b/g, '+'],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  // Strip everything except digits (and optionally +)
  const cleaned = allowPlus
    ? text.replace(/[^0-9+]/g, '')
    : text.replace(/[^0-9]/g, '');

  return cleaned || null;
}

/**
 * Sanitize a dictated email:
 * - Lowercase
 * - Strip diacritics ("andrés" → "andres")
 * - Convert spoken symbols: arroba/at → @, punto/dot → ., guion/guion bajo → -/_
 * - Remove all whitespace
 */
function sanitizeEmail(input: string): string | null {
  if (!input) return null;

  let text = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  // Spoken symbols → characters
  const symbols: Array<[RegExp, string]> = [
    [/\barroba\b/g, '@'],
    [/\b(at|en)\b/g, '@'],
    [/\bpunto\b/g, '.'],
    [/\bdot\b/g, '.'],
    [/\bguion bajo\b/g, '_'],
    [/\bguion abajo\b/g, '_'],
    [/\bunderscore\b/g, '_'],
    [/\bguion\b/g, '-'],
    [/\bmenos\b/g, '-'],
    [/\bm[aá]s\b/g, '+'],
    [/\bmas\b/g, '+'],
  ];

  for (const [pattern, replacement] of symbols) {
    text = text.replace(pattern, replacement);
  }

  // Remove all whitespace
  text = text.replace(/\s+/g, '');

  return text || null;
}
