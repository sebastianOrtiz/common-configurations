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

interface CalendarDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasAvailability: boolean;
  isPast: boolean;
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
  protected activeTab = signal<'book' | 'appointments'>('book');
  protected showConfirmModal = signal<boolean>(false);
  protected confirmedAppointment = signal<Appointment | null>(null);

  // Scheduling state
  protected selectedDate = signal<string>('');
  protected availableSlots = signal<AvailableSlot[]>([]);
  protected selectedSlot = signal<AvailableSlot | null>(null);
  protected dateOptions = signal<DateOption[]>([]);

  // Calendar state
  protected currentMonth = signal<Date>(new Date());
  protected calendarDays = signal<CalendarDay[]>([]);
  protected availabilityMap = signal<Map<string, AvailableSlot[]>>(new Map());
  protected monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  protected weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

      // Load calendar for current month
      this.loadCalendarMonth(this.currentMonth());

      // Load user appointments
      this.loadUserAppointments();
    } else {
      this.error.set('Configuración de calendario no encontrada');
    }
  }

  /**
   * Load calendar for a specific month
   */
  private loadCalendarMonth(monthDate: Date): void {
    const resource = this.calendarResource();
    if (!resource) return;

    // Get first and last day of month
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    // Generate calendar days
    this.generateCalendarDays(monthDate);

    // Load slots for the entire month
    this.loading.set(true);
    this.error.set(null);

    const fromDate = this.formatDateISO(firstDay);
    const toDate = this.formatDateISO(lastDay);

    this.meetSchedulingService.getAvailableSlots(resource, fromDate, toDate).subscribe({
      next: (slots) => {
        // Group slots by date
        const map = new Map<string, AvailableSlot[]>();
        slots.filter(s => s.is_available).forEach(slot => {
          const dateStr = slot.start.split(' ')[0];
          if (!map.has(dateStr)) {
            map.set(dateStr, []);
          }
          map.get(dateStr)!.push(slot);
        });

        this.availabilityMap.set(map);

        // Update calendar days with availability info
        this.updateCalendarAvailability();
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading month slots:', err);
        this.error.set('Error al cargar disponibilidad del mes');
        this.loading.set(false);
      }
    });
  }

  /**
   * Generate calendar days for a month
   */
  private generateCalendarDays(monthDate: Date): void {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // First day of month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();

    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    const days: CalendarDay[] = [];

    // Add previous month days to fill the week
    for (let i = 0; i < firstDayOfWeek; i++) {
      const date = new Date(year, month, -firstDayOfWeek + i + 1);
      days.push({
        date,
        dateStr: this.formatDateISO(date),
        isCurrentMonth: false,
        isToday: false,
        hasAvailability: false,
        isPast: date < today
      });
    }

    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isToday = this.isSameDay(date, today);
      days.push({
        date,
        dateStr: this.formatDateISO(date),
        isCurrentMonth: true,
        isToday,
        hasAvailability: false,
        isPast: date < today
      });
    }

    // Add next month days to complete the grid
    const remainingDays = 42 - days.length; // 6 weeks * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        dateStr: this.formatDateISO(date),
        isCurrentMonth: false,
        isToday: false,
        hasAvailability: false,
        isPast: date < today
      });
    }

    this.calendarDays.set(days);
  }

  /**
   * Update calendar days with availability information
   */
  private updateCalendarAvailability(): void {
    const map = this.availabilityMap();
    const updatedDays = this.calendarDays().map(day => ({
      ...day,
      hasAvailability: map.has(day.dateStr) && (map.get(day.dateStr)?.length ?? 0) > 0
    }));
    this.calendarDays.set(updatedDays);
  }

  /**
   * Navigate to previous month
   */
  previousMonth(): void {
    const current = this.currentMonth();
    const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    this.currentMonth.set(previous);
    this.loadCalendarMonth(previous);
    this.clearSelection();
  }

  /**
   * Navigate to next month
   */
  nextMonth(): void {
    const current = this.currentMonth();
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    this.currentMonth.set(next);
    this.loadCalendarMonth(next);
    this.clearSelection();
  }

  /**
   * Get current month name
   */
  getCurrentMonthName(): string {
    const date = this.currentMonth();
    return `${this.monthNames[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * Select a day from calendar
   */
  onDaySelected(day: CalendarDay): void {
    if (!day.isCurrentMonth || day.isPast || !day.hasAvailability) {
      return;
    }

    this.selectedDate.set(day.dateStr);
    this.selectedSlot.set(null);

    // Load slots for this specific day from the map
    const slots = this.availabilityMap().get(day.dateStr) || [];
    this.availableSlots.set(slots);
  }

  /**
   * Clear selection
   */
  private clearSelection(): void {
    this.selectedDate.set('');
    this.selectedSlot.set(null);
    this.availableSlots.set([]);
  }

  /**
   * Generate date options for the next 14 days (legacy, keeping for compatibility)
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
   * Switch tabs
   */
  switchTab(tab: 'book' | 'appointments'): void {
    this.activeTab.set(tab);
    this.error.set(null);
    this.successMessage.set(null);
  }

  /**
   * Book the selected appointment
   */
  bookAppointment(): void {
    const slot = this.selectedSlot();
    const contact = this.userContact();
    const resource = this.calendarResource();

    if (!slot || !contact || !contact.name || !resource) {
      this.error.set('Por favor selecciona un horario');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    // Create and confirm appointment in one operation
    this.meetSchedulingService.createAndConfirmAppointment(
      resource,
      contact.name,
      slot.start,
      slot.end
    ).subscribe({
      next: (appointment) => {
        this.confirmedAppointment.set(appointment);
        this.showConfirmModal.set(true);
        this.loading.set(false);
        this.selectedSlot.set(null);
        this.selectedDate.set('');
        this.availableSlots.set([]);
        // Reload user appointments
        this.loadUserAppointments();
      },
      error: (err) => {
        console.error('Error creating appointment:', err);
        this.error.set('Error al crear la cita. Por favor intenta de nuevo.');
        this.loading.set(false);
      }
    });
  }

  /**
   * Close confirmation modal
   */
  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
    this.confirmedAppointment.set(null);
  }

  /**
   * Close modal and switch to appointments tab
   */
  viewAppointments(): void {
    this.closeConfirmModal();
    this.switchTab('appointments');
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
      next: (result) => {
        // Use the message from backend (handles both deleted and cancelled)
        this.successMessage.set(result.message || 'Cita cancelada exitosamente');
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
