/**
 * OTP Verification Component
 *
 * Handles OTP code input and verification for MFA.
 * Allows users to choose between SMS and WhatsApp channels.
 * Supports both login (existing user) and registration (new user) flows.
 */

import { Component, EventEmitter, Input, Output, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OtpService } from '../../../../core/services/otp.service';
import { OTPSettings, UserContact } from '../../../../core/models/service-portal.model';

// Type for registration verification result
export interface RegistrationVerifiedResult {
  auth_token: string;
  user_contact: UserContact;
}

@Component({
  selector: 'app-otp-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './otp-verification.component.html',
  styleUrls: ['./otp-verification.component.scss']
})
export class OtpVerificationComponent implements OnInit {
  private otpService = inject(OtpService);

  // Input: document number and OTP settings from parent
  @Input({ required: true }) document!: string;
  @Input() otpSettings: OTPSettings | null = null;
  @Input() phoneNumber?: string;  // Masked phone number (optional, for display)

  // Registration mode inputs
  @Input() mode: 'login' | 'registration' = 'login';  // Flow mode
  @Input() formData: Record<string, any> | null = null;  // Form data for registration mode

  // Output events
  @Output() verified = new EventEmitter<string>();  // Emits auth_token on success (login mode)
  @Output() registrationVerified = new EventEmitter<RegistrationVerifiedResult>();  // Emits for registration mode
  @Output() cancelled = new EventEmitter<void>();

  // State
  protected currentStep = signal<'channel-select' | 'code-input'>('channel-select');
  protected selectedChannel = signal<'sms' | 'whatsapp'>('sms');
  protected otpCode = signal<string>('');
  protected maskedPhone = signal<string>('');
  protected expiryMinutes = signal<number>(5);

  // Loading and error states
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected otpSent = signal(false);

  // Resend cooldown
  protected resendCooldown = signal<number>(0);
  private cooldownInterval: any = null;

  ngOnInit(): void {
    // Set default channel from settings
    if (this.otpSettings?.default_channel) {
      this.selectedChannel.set(this.otpSettings.default_channel);
    }

    // If only one channel is available, skip channel selection
    if (this.otpSettings) {
      const smsAvailable = this.otpSettings.sms_available ?? false;
      const whatsappAvailable = this.otpSettings.whatsapp_available ?? false;

      if (smsAvailable && !whatsappAvailable) {
        this.selectedChannel.set('sms');
        this.sendOtp();
      } else if (!smsAvailable && whatsappAvailable) {
        this.selectedChannel.set('whatsapp');
        this.sendOtp();
      }
    }
  }

  /**
   * Check if SMS channel is available
   */
  get smsAvailable(): boolean {
    return this.otpSettings?.sms_available ?? false;
  }

  /**
   * Check if WhatsApp channel is available
   */
  get whatsappAvailable(): boolean {
    return this.otpSettings?.whatsapp_available ?? false;
  }

  /**
   * Select channel and send OTP
   */
  selectChannel(channel: 'sms' | 'whatsapp'): void {
    this.selectedChannel.set(channel);
    this.sendOtp();
  }

  /**
   * Send OTP to user's phone
   * Uses different API based on mode (login vs registration)
   */
  sendOtp(): void {
    this.loading.set(true);
    this.error.set(null);

    // Use different API based on mode
    const otpRequest$ = this.mode === 'registration' && this.formData !== null
      ? this.otpService.requestRegistrationOtp(this.formData, this.selectedChannel())
      : this.otpService.requestOtp(this.document, this.selectedChannel());

    otpRequest$.subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.success) {
          this.otpSent.set(true);
          this.currentStep.set('code-input');
          this.maskedPhone.set(response.phone || '****');
          this.expiryMinutes.set(response.expiry_minutes || 5);
          this.startResendCooldown();
        } else {
          this.error.set(response.message || 'Error al enviar el código');
        }
      },
      error: (err) => {
        console.error('Error requesting OTP:', err);
        this.loading.set(false);
        this.error.set(err.message || 'Error al enviar el código. Por favor intenta de nuevo.');
      }
    });
  }

  /**
   * Verify OTP code
   * Uses different API based on mode (login vs registration)
   */
  verifyOtp(): void {
    const code = this.otpCode().trim();

    if (!code) {
      this.error.set('Por favor ingresa el código de verificación');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    if (this.mode === 'registration') {
      // Registration mode: verify and create user
      const phoneNumber = this.formData?.['phone_number'] || '';
      this.otpService.verifyRegistrationOtp(phoneNumber, code).subscribe({
        next: (response) => {
          this.loading.set(false);
          if (response.success && response.auth_token && response.user_contact) {
            // Emit the result to parent
            this.registrationVerified.emit({
              auth_token: response.auth_token,
              user_contact: response.user_contact
            });
          } else {
            this.error.set('Código inválido. Por favor intenta de nuevo.');
          }
        },
        error: (err) => {
          console.error('Error verifying registration OTP:', err);
          this.loading.set(false);
          this.error.set(err.message || 'Código inválido. Por favor intenta de nuevo.');
        }
      });
    } else {
      // Login mode: verify existing user
      this.otpService.verifyOtp(this.document, code).subscribe({
        next: (response) => {
          this.loading.set(false);
          if (response.success && response.auth_token) {
            // Emit the auth token to parent
            this.verified.emit(response.auth_token);
          } else {
            this.error.set('Código inválido. Por favor intenta de nuevo.');
          }
        },
        error: (err) => {
          console.error('Error verifying OTP:', err);
          this.loading.set(false);
          this.error.set(err.message || 'Código inválido. Por favor intenta de nuevo.');
        }
      });
    }
  }

  /**
   * Resend OTP code
   * Uses different API based on mode (login vs registration)
   */
  resendOtp(): void {
    if (this.resendCooldown() > 0) return;
    this.otpCode.set('');
    this.error.set(null);

    // For registration mode, use resend endpoint instead of re-sending from scratch
    if (this.mode === 'registration') {
      const phoneNumber = this.formData?.['phone_number'] || '';
      this.loading.set(true);
      this.otpService.resendRegistrationOtp(phoneNumber, this.selectedChannel()).subscribe({
        next: (response) => {
          this.loading.set(false);
          if (response.success) {
            this.maskedPhone.set(response.phone || '****');
            this.expiryMinutes.set(response.expiry_minutes || 5);
            this.startResendCooldown();
          } else {
            this.error.set(response.message || 'Error al reenviar el código');
          }
        },
        error: (err) => {
          console.error('Error resending registration OTP:', err);
          this.loading.set(false);
          this.error.set(err.message || 'Error al reenviar el código. Por favor intenta de nuevo.');
        }
      });
    } else {
      // Login mode: just re-send
      this.sendOtp();
    }
  }

  /**
   * Start resend cooldown timer (60 seconds)
   */
  private startResendCooldown(): void {
    this.resendCooldown.set(60);

    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }

    this.cooldownInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current > 0) {
        this.resendCooldown.set(current - 1);
      } else {
        clearInterval(this.cooldownInterval);
        this.cooldownInterval = null;
      }
    }, 1000);
  }

  /**
   * Go back to channel selection
   */
  goBackToChannelSelect(): void {
    this.currentStep.set('channel-select');
    this.otpCode.set('');
    this.error.set(null);
    this.otpSent.set(false);
  }

  /**
   * Cancel OTP verification
   * For registration mode, also cancels the pending registration in backend
   */
  cancel(): void {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }

    // For registration mode, cancel the pending registration
    if (this.mode === 'registration' && this.formData?.['phone_number']) {
      this.otpService.cancelRegistration(this.formData['phone_number']).subscribe({
        next: () => {
          this.cancelled.emit();
        },
        error: () => {
          // Even if cancel fails, still emit cancelled to go back
          this.cancelled.emit();
        }
      });
    } else {
      this.cancelled.emit();
    }
  }

  /**
   * Handle OTP input - only allow numbers
   */
  onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Remove non-numeric characters
    const value = input.value.replace(/[^0-9]/g, '');
    this.otpCode.set(value);
    input.value = value;
  }
}
