/**
 * Meet Scheduling Tool Component
 *
 * Provides appointment scheduling functionality
 */

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MeetSchedulingService } from '../../../core/services/meet-scheduling.service';
import { StateService } from '../../../core/services/state.service';
import { Appointment, AvailableSlot } from '../../../core/models/appointment.model';

interface DateOption {
  date: Date;
  label: string;
  value: string;
}

@Component({
  selector: 'app-meet-scheduling-tool',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './meet-scheduling-tool.component.html',
  styleUrls: ['./meet-scheduling-tool.component.scss']
})
export class MeetSchedulingToolComponent implements OnInit {
  private meetSchedulingService = inject(MeetSchedulingService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Configuration from portal tool
  protected calendarResource = signal<string>('');
  protected showCalendarView = signal<boolean>(true);

  // UI State
  protected loading = signal<boolean>(false);
  protected loadingSlots = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  // Scheduling state
  protected selectedDate = signal<string>('');
  protected availableSlots = signal<AvailableSlot[]>([]);
  protected selectedSlot = signal<AvailableSlot | null>(null);
  protected dateOptions = signal<DateOption[]>([]);

  // User appointments
  protected userAppointments = signal<Appointment[]>([]);

  // Computed
  protected hasSlots = computed(() => this.availableSlots().length > 0);

  // State
  protected currentUser = this.stateService.currentUser;
  protected userContact = this.stateService.userContact;
  protected selectedPortal = this.stateService.selectedPortal;

  ngOnInit(): void {
    // Get calendar resource from portal tool configuration
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'meet_scheduling');

    if (tool && tool.calendar_resource) {
      this.calendarResource.set(tool.calendar_resource);
      this.showCalendarView.set(tool.show_calendar_view ?? true);

      // Generate date options for next 14 days
      this.generateDateOptions();

      // Load user appointments
      this.loadUserAppointments();
    } else {
      this.error.set('Configuración de calendario no encontrada');
    }
  }

  /**
   * Generate date options for the next 14 days
   */
  private generateDateOptions(): void {
    const options: DateOption[] = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      const label = this.formatDateLabel(date);
      const value = this.formatDateISO(date);

      options.push({ date, label, value });
    }

    this.dateOptions.set(options);
  }

  /**
   * Format date as readable label
   */
  private formatDateLabel(date: Date): string {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (this.isSameDay(date, today)) {
      return 'Hoy - ' + date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
    } else if (this.isSameDay(date, tomorrow)) {
      return 'Mañana - ' + date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });
    }
  }

  /**
   * Format date as ISO string (YYYY-MM-DD)
   */
  private formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * Handle date selection and load slots
   */
  onDateSelected(dateValue: string): void {
    this.selectedDate.set(dateValue);
    this.selectedSlot.set(null);
    this.loadAvailableSlots(dateValue);
  }

  /**
   * Load available slots for a specific date
   */
  private loadAvailableSlots(date: string): void {
    const resource = this.calendarResource();
    if (!resource) return;

    this.loadingSlots.set(true);
    this.error.set(null);

    this.meetSchedulingService.getAvailableSlots(resource, date, date).subscribe({
      next: (slots) => {
        this.availableSlots.set(slots.filter(s => s.is_available));
        this.loadingSlots.set(false);
      },
      error: (err) => {
        console.error('Error loading slots:', err);
        this.error.set('Error al cargar horarios disponibles');
        this.loadingSlots.set(false);
      }
    });
  }

  /**
   * Select a time slot
   */
  selectSlot(slot: AvailableSlot): void {
    this.selectedSlot.set(slot);
  }

  /**
   * Book the selected appointment
   */
  bookAppointment(): void {
    const slot = this.selectedSlot();
    const contact = this.userContact();
    const resource = this.calendarResource();

    if (!slot || !contact || !resource) {
      this.error.set('Por favor selecciona un horario');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    // Create appointment
    this.meetSchedulingService.createAppointment({
      calendar_resource: resource,
      user_contact: contact.name,
      start_datetime: slot.start,
      end_datetime: slot.end,
      status: 'Draft'
    }).subscribe({
      next: (appointment) => {
        // Submit the appointment to confirm it
        this.meetSchedulingService.submitAppointment(appointment.name!).subscribe({
          next: () => {
            this.successMessage.set('¡Cita agendada exitosamente!');
            this.loading.set(false);
            this.selectedSlot.set(null);
            this.selectedDate.set('');
            this.availableSlots.set([]);
            // Reload user appointments
            this.loadUserAppointments();
          },
          error: (err) => {
            console.error('Error submitting appointment:', err);
            this.error.set('Error al confirmar la cita');
            this.loading.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Error creating appointment:', err);
        this.error.set('Error al crear la cita. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Load user's appointments
   */
  private loadUserAppointments(): void {
    const contact = this.userContact();
    if (!contact?.name) return;

    this.meetSchedulingService.getUserAppointments(contact.name).subscribe({
      next: (appointments) => {
        // Sort by start date, most recent first
        const sorted = appointments.sort((a, b) =>
          new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
        );
        this.userAppointments.set(sorted);
      },
      error: (err) => {
        console.error('Error loading appointments:', err);
      }
    });
  }

  /**
   * Cancel an appointment
   */
  cancelAppointment(appointment: Appointment): void {
    if (!appointment.name) return;

    if (!confirm('¿Estás seguro de cancelar esta cita?')) {
      return;
    }

    this.meetSchedulingService.cancelAppointment(appointment.name).subscribe({
      next: () => {
        this.successMessage.set('Cita cancelada exitosamente');
        this.loadUserAppointments();
      },
      error: (err) => {
        console.error('Error canceling appointment:', err);
        this.error.set('Error al cancelar la cita');
      }
    });
  }

  /**
   * Format time from datetime string
   */
  formatTime(datetime: string): string {
    return new Date(datetime).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Format date from datetime string
   */
  formatDate(datetime: string): string {
    return new Date(datetime).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Get status badge class
   */
  getStatusClass(status: string): string {
    switch (status) {
      case 'Confirmed': return 'status-confirmed';
      case 'Completed': return 'status-completed';
      case 'Cancelled': return 'status-cancelled';
      case 'No-show': return 'status-noshow';
      default: return 'status-draft';
    }
  }

  /**
   * Go back to portal
   */
  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }
}
