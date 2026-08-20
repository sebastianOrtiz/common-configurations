/**
 * My Appointments Tool Component
 *
 * Displays user's scheduled appointments
 */

import { Component, OnDestroy, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MeetSchedulingService } from '../../../core/services/meet-scheduling.service';
import { StateService } from '../../../core/services/state.service';
import { AssistantContextService } from '../../../core/services/assistant-context.service';
import { Appointment } from '../../../core/models/appointment.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/**
 * Unique scope id for this tool's voice actions. Any string is valid as
 * long as it's unique per active scope — `registerActions`/`unregister`
 * key their Map entry by it.
 */
const ASSISTANT_SCOPE_ID = 'my-appointments-tool';

@Component({
  selector: 'app-my-appointments-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './my-appointments-tool.component.html',
  styleUrls: ['./my-appointments-tool.component.scss']
})
export class MyAppointmentsToolComponent implements OnInit, OnDestroy {
  private meetSchedulingService = inject(MeetSchedulingService);
  private stateService = inject(StateService);
  private router = inject(Router);
  private assistantContext = inject(AssistantContextService);

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
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // ============================================================
  // Voice Command Layer — per-tool action registry (Fase 2 seed).
  //
  // Besides the GLOBAL voice actions (navigate between tools, go back/home,
  // search, log in, fill the active form), a tool can register its own
  // autonomous actions here. This is the reference example other tools
  // should copy:
  //
  //   1. Pick a unique `scopeId` (a plain string constant is enough).
  //   2. Call `registerActions(scopeId, [...])` once — in the constructor
  //      (static actions, as below) or inside an `effect()`/`ngOnInit` if
  //      the action's availability/labels depend on reactive state.
  //   3. Call `unregister(scopeId)` in `ngOnDestroy` — mandatory, or the
  //      action leaks into every other page.
  //
  // The `run` callback executes autonomously: no confirmation step beyond
  // the bubble's own spoken acknowledgement.
  // ============================================================
  constructor() {
    this.assistantContext.registerActions(ASSISTANT_SCOPE_ID, [
      {
        id: 'appointments.new',
        description: 'Agendar una nueva cita',
        samplePhrases: ['nueva cita', 'agendar cita', 'quiero una cita', 'pedir una cita', 'sacar una cita'],
        run: () => this.goToScheduling(),
      },
    ]);
  }

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;
    this.loadUserAppointments();
  }

  ngOnDestroy(): void {
    this.assistantContext.unregister(ASSISTANT_SCOPE_ID);
  }

  /** "Nueva cita" — jumps straight to this portal's meet_scheduling tool, if configured. */
  private goToScheduling(): void {
    const portal = this.selectedPortal();
    if (!portal) return;
    const schedulingTool = portal.tools.find(
      (t) => t.tool_type === 'meet_scheduling' && t.is_enabled
    );
    if (schedulingTool) {
      this.router.navigate(['/portal', portal.portal_name, 'tool', 'meet_scheduling', schedulingTool.name]);
    } else {
      // No scheduling tool configured on this portal — go home instead of a dead end.
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  /**
   * Load user's appointments using authenticated endpoint
   */
  private loadUserAppointments(): void {
    const contact = this.userContact();
    if (!contact?.name) {
      this.error.set('No se pudo obtener información del contacto');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Use getMyAppointments which uses token-based authentication
    // instead of getUserAppointments which requires Frappe permissions
    this.meetSchedulingService.getMyAppointments().subscribe({
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
        this.error.set(err.message || 'Error al cargar las citas');
        this.loading.set(false);
      }
    });
  }

  /**
   * Cancel an appointment using authenticated endpoint
   */
  cancelAppointment(appointment: Appointment): void {
    if (!appointment.name) return;

    if (!confirm('¿Estás seguro de cancelar esta cita?')) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Use cancelMyAppointment which validates token and ownership
    this.meetSchedulingService.cancelMyAppointment(appointment.name).subscribe({
      next: (result) => {
        // Use the message from backend (handles both deleted and cancelled)
        this.successMessage.set(result.message || 'Cita cancelada exitosamente');
        this.loadUserAppointments();
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error canceling appointment:', err);
        this.error.set(err.message || 'Error al cancelar la cita');
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

  /**
   * Navigate to registration page
   */
  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }
}
