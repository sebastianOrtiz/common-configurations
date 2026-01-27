/**
 * OTP Service
 *
 * Handles OTP (One-Time Password) verification via SMS/WhatsApp.
 * Works with the OTP domain API on the backend.
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';
import { OTPSettings, OTPRequestResponse, OTPVerifyResponse, RegistrationOTPVerifyResponse } from '../models/service-portal.model';

// API path for OTP domain
const API_OTP = 'common_configurations.api.otp';

@Injectable({
  providedIn: 'root'
})
export class OtpService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get public OTP settings
   */
  getOtpSettings(): Observable<OTPSettings> {
    return this.callApiGet<OTPSettings>(`${API_OTP}.get_otp_settings`);
  }

  /**
   * Check if OTP is enabled
   */
  isOtpEnabled(): Observable<boolean> {
    return this.callApiGet<{ enabled: boolean }>(`${API_OTP}.is_otp_enabled`).pipe(
      map(response => response?.enabled ?? false)
    );
  }

  /**
   * Request OTP to be sent to user's phone
   *
   * @param document User's document number
   * @param channel 'sms' or 'whatsapp'
   */
  requestOtp(document: string, channel: 'sms' | 'whatsapp' = 'sms'): Observable<OTPRequestResponse> {
    return this.callApiPost<OTPRequestResponse>(`${API_OTP}.request_otp`, {
      document,
      channel,
      honeypot: ''  // Honeypot field - should always be empty
    });
  }

  /**
   * Verify OTP code
   *
   * @param document User's document number
   * @param otpCode OTP code entered by user
   */
  verifyOtp(document: string, otpCode: string): Observable<OTPVerifyResponse> {
    return this.callApiPost<OTPVerifyResponse>(`${API_OTP}.verify_otp`, {
      document,
      otp_code: otpCode,
      honeypot: ''  // Honeypot field - should always be empty
    });
  }

  // ==========================================
  // Registration OTP Methods
  // ==========================================

  /**
   * Request OTP for new user registration
   * Stores form data in cache until OTP is verified
   *
   * @param formData Registration form data (must include phone_number)
   * @param channel 'sms' or 'whatsapp'
   */
  requestRegistrationOtp(formData: Record<string, any>, channel: 'sms' | 'whatsapp' = 'sms'): Observable<OTPRequestResponse> {
    return this.callApiPost<OTPRequestResponse>(`${API_OTP}.request_registration_otp`, {
      data: JSON.stringify(formData),
      channel,
      honeypot: ''
    });
  }

  /**
   * Verify OTP for pending registration and create user
   *
   * @param phoneNumber Phone number used in registration
   * @param otpCode OTP code entered by user
   */
  verifyRegistrationOtp(phoneNumber: string, otpCode: string): Observable<RegistrationOTPVerifyResponse> {
    return this.callApiPost<RegistrationOTPVerifyResponse>(`${API_OTP}.verify_registration_otp`, {
      phone_number: phoneNumber,
      otp_code: otpCode,
      honeypot: ''
    });
  }

  /**
   * Resend OTP for pending registration
   *
   * @param phoneNumber Phone number from registration
   * @param channel Optional new channel
   */
  resendRegistrationOtp(phoneNumber: string, channel?: 'sms' | 'whatsapp'): Observable<OTPRequestResponse> {
    return this.callApiPost<OTPRequestResponse>(`${API_OTP}.resend_registration_otp`, {
      phone_number: phoneNumber,
      channel,
      honeypot: ''
    });
  }

  /**
   * Cancel pending registration
   *
   * @param phoneNumber Phone number from registration
   */
  cancelRegistration(phoneNumber: string): Observable<{ success: boolean }> {
    return this.callApiPost<{ success: boolean }>(`${API_OTP}.cancel_registration`, {
      phone_number: phoneNumber,
      honeypot: ''
    });
  }

  /**
   * Call API method using GET
   */
  private callApiGet<T = any>(methodPath: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(methodPath, args, true).pipe(
      map(response => {
        if (!response.success && response.message === undefined) {
          throw new Error(response.error || 'API call failed');
        }
        return response.message as T;
      })
    );
  }

  /**
   * Call API method using POST
   */
  private callApiPost<T = any>(methodPath: string, args?: any): Observable<T> {
    return this.frappeApi.callMethod(methodPath, args, false).pipe(
      map(response => {
        if (!response.success && response.message === undefined) {
          throw new Error(response.error || 'API call failed');
        }
        return response.message as T;
      })
    );
  }
}
