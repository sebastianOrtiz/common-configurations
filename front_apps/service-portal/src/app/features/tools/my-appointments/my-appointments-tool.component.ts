/**
 * My Appointments Tool Component
 *
 * Displays user's scheduled appointments
 */

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MeetSchedulingService } from '../../../core/services/meet-scheduling.service';
import { StateService } from '../../../core/services/state.service';
import { Appointment } from '../../../core/models/appointment.model';

@Component({
  selector: 'app-my-appointments-tool',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-appointments-tool.component.html',
  styleUrls: ['./my-appointments-tool.component.scss']
})
export class MyAppointmentsToolComponent implements OnInit {
  private meetSchedulingService = inject(MeetSchedulingService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // UI State
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  // User appointments
  protected userAppointments = signal<Appointment[]>([]);

  // State
  protected currentUser = this.stateService.currentUser;
  protected userContact = this.stateService.userContact;
  protected selectedPortal = this.stateService.selectedPortal;

  ngOnInit(): void {
    this.loadUserAppointments();
  }

  /**
   * Load user's appointments
   */
  private loadUserAppointments(): void {
    const contact = this.userContact();
    if (!contact?.name) {
      this.error.set('No se pudo obtener información del contacto');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.meetSchedulingService.getUserAppointments(contact.name).subscribe({
      next: (appointments) => {
        // Sort by start date, most recent first
        const sorted = appointments.sort((a, b) =>
          new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
        );
        this.userAppointments.set(sorted);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading appointments:', err);
        this.error.set('Error al cargar las citas');
        this.loading.set(false);
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

    this.loading.set(true);
    this.error.set(null);

    this.meetSchedulingService.cancelAppointment(appointment.name).subscribe({
      next: (result) => {
        // Use the message from backend (handles both deleted and cancelled)
        this.successMessage.set(result.message || 'Cita cancelada exitosamente');
        this.loadUserAppointments();
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error canceling appointment:', err);
        this.error.set('Error al cancelar la cita');
        this.loading.set(false);
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
