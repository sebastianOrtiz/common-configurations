/**
 * Meet Scheduling Service
 *
 * Handles appointment and scheduling operations via meet_scheduling API
 */

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService, ApiResponse } from './frappe-api.service';
import {
  Appointment,
  AvailableSlot,
  ValidationResult,
  MeetingGenerationResult,
  CalendarResource,
  AvailabilityPlan
} from '../models/appointment.model';

// API path for meet_scheduling appointments domain
const API_APPOINTMENTS = 'meet_scheduling.api.appointments';

@Injectable({
  providedIn: 'root'
})
export class MeetSchedulingService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get all active calendar resources (public API)
   */
  getActiveCalendarResources(): Observable<CalendarResource[]> {
    // Use GET for public read endpoint
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.get_active_calendar_resources`, {}, true).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.error || 'Failed to load calendar resources');
        }
        return (response.message || []) as CalendarResource[];
      })
    );
  }

  /**
   * Get available slots for a date range (public API)
   */
  getAvailableSlots(
    calendarResource: string,
    fromDate: string,
    toDate: string
  ): Observable<AvailableSlot[]> {
    // Use GET for public read endpoint
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.get_available_slots`, {
      calendar_resource: calendarResource,
      from_date: fromDate,
      to_date: toDate
    }, true).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.error || 'Failed to load available slots');
        }
        return (response.message || []) as AvailableSlot[];
      })
    );
  }

  /**
   * Validate appointment before creating (public API)
   */
  validateAppointment(
    calendarResource: string,
    startDatetime: string,
    endDatetime: string,
    appointmentName?: string
  ): Observable<ValidationResult> {
    // Use GET for public read endpoint
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.validate_appointment`, {
      calendar_resource: calendarResource,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      appointment_name: appointmentName
    }, true).pipe(
      map(response => {
        if (!response.message) {
          throw new Error(response.error || 'Validation failed');
        }
        return response.message as ValidationResult;
      })
    );
  }

  /**
   * Create and confirm appointment in one operation (public API with honeypot)
   */
  createAndConfirmAppointment(
    calendarResource: string,
    userContact: string,
    startDatetime: string,
    endDatetime: string,
    appointmentContext?: string
  ): Observable<Appointment> {
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.create_and_confirm_appointment`, {
      calendar_resource: calendarResource,
      user_contact: userContact,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      appointment_context: appointmentContext,
      honeypot: ''  // Honeypot field - should always be empty
    }).pipe(
      map(response => {
        if (!response.success && !response.message) {
          throw new Error(response.error || 'Failed to create appointment');
        }
        return response.message as Appointment;
      })
    );
  }

  /**
   * Cancel or delete appointment (depending on status)
   * - Draft appointments are deleted
   * - Submitted appointments are cancelled
   */
  cancelAppointment(appointmentName: string): Observable<any> {
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.cancel_or_delete_appointment`, {
      appointment_name: appointmentName
    }).pipe(
      map(response => {
        if (!response.success && !response.message) {
          throw new Error(response.error || 'Failed to cancel appointment');
        }
        return response.message;
      })
    );
  }

  /**
   * Get appointment by name
   */
  getAppointment(appointmentName: string): Observable<Appointment> {
    return this.frappeApi.getDoc('Appointment', appointmentName).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load appointment');
        }
        return response.data as Appointment;
      })
    );
  }

  /**
   * Generate meeting manually (if create_on = manual)
   */
  generateMeeting(appointmentName: string): Observable<MeetingGenerationResult> {
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.generate_meeting`, {
      appointment_name: appointmentName
    }).pipe(
      map(response => {
        if (!response.message) {
          throw new Error(response.error || 'Failed to generate meeting');
        }
        return response.message as MeetingGenerationResult;
      })
    );
  }

  /**
   * Get Calendar Resource details
   */
  getCalendarResource(resourceName: string): Observable<CalendarResource> {
    return this.frappeApi.getDoc('Calendar Resource', resourceName).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load calendar resource');
        }
        return response.data as CalendarResource;
      })
    );
  }

  /**
   * Get Availability Plan details
   */
  getAvailabilityPlan(planName: string): Observable<AvailabilityPlan> {
    return this.frappeApi.getDoc('Availability Plan', planName).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to load availability plan');
        }
        return response.data as AvailabilityPlan;
      })
    );
  }

  /**
   * Get appointments for a user contact
   */
  getUserAppointments(userContactId: string): Observable<Appointment[]> {
    return this.frappeApi.getList(
      'Appointment',
      [['user_contact', '=', userContactId]],
      ['*'],
      0,
      100
    ).pipe(
      map(response => {
        if (!response.success || !response.data) {
          return [];
        }
        return response.data as Appointment[];
      })
    );
  }

  /**
   * Get appointments for a calendar resource (for admin view)
   */
  getResourceAppointments(
    calendarResource: string,
    fromDate?: string,
    toDate?: string
  ): Observable<Appointment[]> {
    const filters: any[] = [['calendar_resource', '=', calendarResource]];

    if (fromDate) {
      filters.push(['start_datetime', '>=', fromDate]);
    }
    if (toDate) {
      filters.push(['start_datetime', '<=', toDate]);
    }

    return this.frappeApi.getList(
      'Appointment',
      filters,
      ['*'],
      0,
      100
    ).pipe(
      map(response => {
        if (!response.success || !response.data) {
          return [];
        }
        return response.data as Appointment[];
      })
    );
  }

  // ===================
  // Authenticated User Methods
  // ===================
  // These methods require a valid User Contact auth token

  /**
   * Get appointments for the currently authenticated User Contact.
   * Requires valid auth token in X-User-Contact-Token header.
   */
  getMyAppointments(
    status?: string,
    fromDate?: string,
    toDate?: string
  ): Observable<Appointment[]> {
    const args: any = {};
    if (status) args.status = status;
    if (fromDate) args.from_date = fromDate;
    if (toDate) args.to_date = toDate;

    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.get_my_appointments`, args, true).pipe(
      map(response => {
        if (!response.success && !response.message) {
          throw new Error(response.error || 'Failed to load appointments');
        }
        return (response.message || []) as Appointment[];
      })
    );
  }

  /**
   * Get detailed information about a specific appointment.
   * Requires valid auth token. User can only view their own appointments.
   */
  getMyAppointmentDetail(appointmentName: string): Observable<Appointment> {
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.get_appointment_detail`, {
      appointment_name: appointmentName
    }, true).pipe(
      map(response => {
        if (!response.success && !response.message) {
          throw new Error(response.error || 'Failed to load appointment');
        }
        return response.message as Appointment;
      })
    );
  }

  /**
   * Cancel an appointment owned by the authenticated User Contact.
   * Requires valid auth token. User can only cancel their own appointments.
   */
  cancelMyAppointment(appointmentName: string): Observable<{ success: boolean; action: string; message: string }> {
    return this.frappeApi.callMethod(`${API_APPOINTMENTS}.cancel_my_appointment`, {
      appointment_name: appointmentName,
      honeypot: ''
    }).pipe(
      map(response => {
        if (!response.message) {
          throw new Error(response.error || 'Failed to cancel appointment');
        }
        return response.message as { success: boolean; action: string; message: string };
      })
    );
  }
}
