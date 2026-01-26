/**
 * Appointment Booking Tool Component
 *
 * Allows users to book appointments with calendar resources
 * Includes voice input for appointment context
 */

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MeetSchedulingService } from '../../../core/services/meet-scheduling.service';
import { StateService } from '../../../core/services/state.service';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';
import { AvailableSlot, CalendarResource } from '../../../core/models/appointment.model';

@Component({
  selector: 'app-appointment-booking-tool',
  standalone: true,
  imports: [CommonModule, FormsModule, VoiceInputComponent],
  templateUrl: './appointment-booking-tool.component.html',
  styleUrls: ['./appointment-booking-tool.component.scss']
})
export class AppointmentBookingToolComponent implements OnInit {
  private meetSchedulingService = inject(MeetSchedulingService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // State
  protected selectedPortal = this.stateService.selectedPortal();
  protected userContact = this.stateService.userContact();
  protected currentUser = this.stateService.currentUser();

  // UI State
  protected loading = signal<boolean>(false);
  protected loadingSlots = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  // Booking state
  protected step = signal<number>(1); // 1: Select resource, 2: Select date/time, 3: Add context, 4: Confirm
  protected calendarResources = signal<CalendarResource[]>([]);
  protected selectedResource = signal<CalendarResource | null>(null);
  protected availableSlots = signal<AvailableSlot[]>([]);
  protected selectedSlot = signal<AvailableSlot | null>(null);
  protected appointmentContext = signal<string>('');
  protected isRecordingVoice = signal<boolean>(false);

  // Date selection
  protected selectedDate = signal<string>(this.getTodayDate());
  protected dateRange = signal<{ from: string; to: string }>({
    from: this.getTodayDate(),
    to: this.getDatePlusDays(7)
  });

  // Computed
  protected hasSlots = computed(() => this.availableSlots().length > 0);
  protected canProceed = computed(() => {
    const step = this.step();
    if (step === 1) return !!this.selectedResource();
    if (step === 2) return !!this.selectedSlot();
    if (step === 3) return true; // Context is optional
    return false;
  });

  ngOnInit(): void {
    this.loadCalendarResources();
  }

  /**
   * Load available calendar resources
   */
  private loadCalendarResources(): void {
    this.loading.set(true);
    this.error.set(null);

    this.meetSchedulingService
      .getActiveCalendarResources()
      .subscribe({
        next: (resources) => {
          this.calendarResources.set(resources);
          this.loading.set(false);

          if (resources.length === 0) {
            this.error.set('No hay servicios disponibles en este momento');
          }
        },
        error: (err) => {
          console.error('Error loading calendar resources:', err);
          this.error.set('Error al cargar servicios disponibles');
          this.loading.set(false);
        }
      });
  }

  /**
   * Select a calendar resource
   */
  selectResource(resource: CalendarResource): void {
    this.selectedResource.set(resource);
    this.loadAvailableSlots();
    this.nextStep();
  }

  /**
   * Load available slots for selected resource and date range
   */
  loadAvailableSlots(): void {
    const resource = this.selectedResource();
    if (!resource) return;

    const range = this.dateRange();
    this.loadingSlots.set(true);
    this.error.set(null);

    this.meetSchedulingService
      .getAvailableSlots(resource.name, range.from, range.to)
      .subscribe({
        next: (slots) => {
          this.availableSlots.set(slots);
          this.loadingSlots.set(false);

          if (slots.length === 0) {
            this.error.set('No hay horarios disponibles en este rango de fechas');
          }
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
    this.nextStep();
  }

  /**
   * Handle voice transcript
   */
  onVoiceTranscript(transcript: string): void {
    this.appointmentContext.set(transcript);
  }

  /**
   * Handle voice recording state change
   */
  onVoiceRecordingChange(isRecording: boolean): void {
    this.isRecordingVoice.set(isRecording);
  }

  /**
   * Handle voice input error
   */
  onVoiceError(error: string): void {
    console.error('Voice input error:', error);
    // Could show a toast notification here
  }

  /**
   * Confirm and create appointment
   */
  confirmBooking(): void {
    const contact = this.userContact;
    const resource = this.selectedResource();
    const slot = this.selectedSlot();
    const context = this.appointmentContext();

    if (!contact || !resource || !slot) {
      this.error.set('Información incompleta para crear la cita');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Ensure contact name is defined
    if (!contact?.name) {
      this.error.set('No se pudo obtener la información del contacto');
      return;
    }

    this.meetSchedulingService
      .createAndConfirmAppointment(
        resource.name,
        contact.name,
        slot.start,
        slot.end,
        context || undefined
      )
      .subscribe({
        next: (appointment) => {
          this.loading.set(false);
          this.successMessage.set('¡Cita agendada exitosamente!');

          // Show success and redirect
          setTimeout(() => {
            this.router.navigate(['/portal', this.selectedPortal?.name, 'tool', 'my_appointments']);
          }, 2000);
        },
        error: (err) => {
          console.error('Error creating appointment:', err);
          this.error.set(err.error?.message || 'Error al crear la cita');
          this.loading.set(false);
        }
      });
  }

  /**
   * Navigation methods
   */
  nextStep(): void {
    if (this.canProceed()) {
      this.step.update(s => Math.min(s + 1, 4));
    }
  }

  previousStep(): void {
    this.step.update(s => Math.max(s - 1, 1));
    this.error.set(null);
  }

  goBack(): void {
    if (this.selectedPortal) {
      this.router.navigate(['/portal', this.selectedPortal.name]);
    }
  }

  /**
   * Date helpers
   */
  protected getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  protected getDatePlusDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Change date range
   */
  onDateChange(): void {
    const selectedDate = this.selectedDate();
    this.dateRange.set({
      from: selectedDate,
      to: this.getDatePlusDays(7)
    });
    this.loadAvailableSlots();
  }

  /**
   * Format helpers
   */
  formatTime(datetime: string): string {
    return new Date(datetime).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDate(datetime: string): string {
    return new Date(datetime).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatShortDate(datetime: string): string {
    return new Date(datetime).toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }
}
