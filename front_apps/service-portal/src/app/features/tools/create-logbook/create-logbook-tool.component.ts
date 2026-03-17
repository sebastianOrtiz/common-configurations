/**
 * Create Logbook Tool Component
 *
 * Allows users to create a Logbook Entry directly from the Service Portal
 * without needing to create an Appointment first.
 */

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

interface CreatedEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  start_date: string;
}

@Component({
  selector: 'app-create-logbook-tool',
  standalone: true,
  imports: [CommonModule, FormsModule, VoiceInputComponent, IconComponent],
  templateUrl: './create-logbook-tool.component.html',
  styleUrls: ['./create-logbook-tool.component.scss']
})
export class CreateLogbookToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // State
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI State
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected userContext = signal<string>('');
  protected showConfirmModal = signal<boolean>(false);
  protected createdEntry = signal<CreatedEntry | null>(null);

  // Config
  private logbookAvailability = '';

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;

    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'create_logbook');

    if (tool && (tool as any).logbook_availability) {
      this.logbookAvailability = (tool as any).logbook_availability;
    } else {
      this.error.set('Configuración de disponibilidad no encontrada');
    }
  }

  submitEntry(): void {
    const contact = this.userContact();
    const context = this.userContext();

    if (!contact || !contact.name) {
      this.error.set('No se encontró información de contacto');
      return;
    }

    if (!context || !context.trim()) {
      this.error.set('Por favor describe tu caso o necesidad');
      return;
    }

    if (!this.logbookAvailability) {
      this.error.set('Configuración de disponibilidad no encontrada');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.frappeApi.callMethod<CreatedEntry>(
      'logbook.api.entries.create_entry_from_portal',
      {
        user_contact: contact.name,
        user_context: context.trim(),
        logbook_availability: this.logbookAvailability,
      }
    ).subscribe({
      next: (response) => {
        if (response?.message) {
          this.createdEntry.set(response.message);
          this.showConfirmModal.set(true);
          this.userContext.set('');
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error creating logbook entry:', err);
        const message = err?.error?.message || err?.error?._server_messages;
        if (message) {
          try {
            const parsed = JSON.parse(message);
            this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Error al crear la entrada');
          } catch {
            this.error.set(typeof message === 'string' ? message : 'Error al crear la entrada');
          }
        } else {
          this.error.set('Error al crear la entrada. Por favor intenta de nuevo.');
        }
        this.loading.set(false);
      }
    });
  }

  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
    this.createdEntry.set(null);
    this.goBack();
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }
}
