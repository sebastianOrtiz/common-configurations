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

// Base API path for meet_scheduling
const API_BASE = '/api/method/meet_scheduling.api.appointment_api';

@Injectable({
  providedIn: 'root'
})
export class MeetSchedulingService {
  constructor(private frappeApi: FrappeApiService) {}

  /**
   * Get available slots for a date range
   */
  getAvailableSlots(
    calendarResource: string,
    fromDate: string,
    toDate: string
  ): Observable<AvailableSlot[]> {
    return this.frappeApi.callMethod(`${API_BASE}.get_available_slots`, {
      calendar_resource: calendarResource,
      from_date: fromDate,
      to_date: toDate
    }).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.error || 'Failed to load available slots');
        }
        return (response.message || []) as AvailableSlot[];
      })
    );
  }

  /**
   * Validate appointment before creating
   */
  validateAppointment(
    calendarResource: string,
    startDatetime: string,
    endDatetime: string,
    appointmentName?: string
  ): Observable<ValidationResult> {
    return this.frappeApi.callMethod(`${API_BASE}.validate_appointment`, {
      calendar_resource: calendarResource,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      appointment_name: appointmentName
    }).pipe(
      map(response => {
        if (!response.message) {
          throw new Error(response.error || 'Validation failed');
        }
        return response.message as ValidationResult;
      })
    );
  }

  /**
   * Create appointment (Draft)
   */
  createAppointment(data: Partial<Appointment>): Observable<Appointment> {
    // Ensure it's created as Draft
    const appointmentData = {
      ...data,
      status: 'Draft',
      docstatus: 0
    };

    return this.frappeApi.createDoc('Appointment', appointmentData).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to create appointment');
        }
        return response.data as Appointment;
      })
    );
  }

  /**
   * Submit appointment (confirm)
   */
  submitAppointment(appointmentName: string): Observable<Appointment> {
    // Frappe submit is done via POST to submit action
    return this.frappeApi.post(`/api/resource/Appointment/${appointmentName}`, {
      docstatus: 1
    }, true).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to submit appointment');
        }
        return response.data as Appointment;
      })
    );
  }

  /**
   * Cancel appointment
   */
  cancelAppointment(appointmentName: string): Observable<Appointment> {
    return this.frappeApi.post(`/api/resource/Appointment/${appointmentName}`, {
      docstatus: 2
    }, true).pipe(
      map(response => {
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to cancel appointment');
        }
        return response.data as Appointment;
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
    return this.frappeApi.callMethod(`${API_BASE}.generate_meeting`, {
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
}
