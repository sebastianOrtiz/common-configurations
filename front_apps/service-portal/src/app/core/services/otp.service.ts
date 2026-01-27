/**
 * OTP Service
 *
 * Handles OTP (One-Time Password) verification via SMS/WhatsApp.
 * Works with the OTP domain API on the backend.
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';
import { OTPSettings, OTPRequestResponse, OTPVerifyResponse } from '../models/service-portal.model';

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
