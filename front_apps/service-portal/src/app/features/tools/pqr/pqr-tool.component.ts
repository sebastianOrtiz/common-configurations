/**
 * PQR Tool Component
 *
 * Allows citizens to submit a PQR (Petition, Complaint, Claim, etc.):
 * 1. Shows a list of allowed PQR types (configured per Service Portal Tool)
 * 2. On select: shows a form (subject + description + anonymous toggle)
 * 3. On submit: creates a PQR Entry. Can be authenticated or anonymous.
 *
 * Anonymous submissions are allowed if the tool's config has `pqr_allow_anonymous=1`,
 * OR if the user is not logged in (always treated as anonymous).
 */

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';

interface PQRType {
  name: string;
  type_code: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  display_order: number;
}

interface ToolTypesResponse {
  allow_anonymous: boolean;
  types: PQRType[];
}

interface CreatedPQR {
  name: string;
  pqr_type: string;
  subject: string;
  status: string;
  received_at: string;
  is_anonymous: boolean;
}

type ViewState = 'list' | 'form' | 'confirm';

@Component({
  selector: 'app-pqr-tool',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, VoiceInputComponent],
  templateUrl: './pqr-tool.component.html',
  styleUrls: ['./pqr-tool.component.scss']
})
export class PqrToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Portal state
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI state
  protected view = signal<ViewState>('list');
  protected loading = signal<boolean>(false);
  protected loadingTypes = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // Types list
  protected types = signal<PQRType[]>([]);
  protected allowAnonymous = signal<boolean>(true);
  protected selectedType = signal<PQRType | null>(null);

  // Form state
  protected subject = signal<string>('');
  protected description = signal<string>('');
  protected sendAsAnonymous = signal<boolean>(false);

  // Result state
  protected createdPQR = signal<CreatedPQR | null>(null);

  // Config
  private toolName = '';

  protected canSubmit = computed(() => {
    return (
      !!this.subject().trim() &&
      !!this.description().trim() &&
      !this.loading()
    );
  });

  ngOnInit(): void {
    const portal = this.selectedPortal();
    const tool = portal?.tools.find((t: any) => t.tool_type === 'pqr');

    if (!tool) {
      this.error.set('La configuración de PQR no se encontró.');
      return;
    }

    this.toolName = (tool as any).name;
    this.loadTypes();
  }

  private async loadTypes(): Promise<void> {
    this.loadingTypes.set(true);
    this.error.set(null);

    try {
      const response = await this.frappeApi.callMethod<ToolTypesResponse>(
        'pqr_management.api.types.get_tool_types',
        { tool_name: this.toolName },
        true
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.types.set(data.types || []);
        this.allowAnonymous.set(data.allow_anonymous);

        // If user is not logged in and anonymous is not allowed, show error
        if (this.isAnonymousUser() && !data.allow_anonymous) {
          this.error.set('Esta herramienta requiere iniciar sesión.');
        }
      }
    } catch (err: any) {
      console.error('Error loading PQR types:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al cargar los tipos de PQR.'));
    } finally {
      this.loadingTypes.set(false);
    }
  }

  protected selectType(type: PQRType): void {
    this.selectedType.set(type);
    this.subject.set('');
    this.description.set('');
    // Default: if user is anonymous (not logged in), force anonymous submission
    this.sendAsAnonymous.set(this.isAnonymousUser());
    this.view.set('form');
  }

  protected backToList(): void {
    this.view.set('list');
    this.selectedType.set(null);
    this.error.set(null);
  }

  protected async submitPQR(): Promise<void> {
    const type = this.selectedType();
    if (!type) return;

    if (!this.canSubmit()) return;

    this.loading.set(true);
    this.error.set(null);

    const isAnonymous = this.isAnonymousUser() ? true : this.sendAsAnonymous();

    try {
      const response = await this.frappeApi.callMethod<CreatedPQR>(
        'pqr_management.api.entries.create_entry_from_portal',
        {
          pqr_type: type.name,
          subject: this.subject().trim(),
          description: this.description().trim(),
          is_anonymous: isAnonymous ? 1 : 0,
          honeypot: '',
        }
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.createdPQR.set(data);
        this.view.set('confirm');
      }
    } catch (err: any) {
      console.error('Error submitting PQR:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al enviar la PQR.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected closeConfirmAndReturn(): void {
    this.createdPQR.set(null);
    this.view.set('list');
    this.selectedType.set(null);
    this.subject.set('');
    this.description.set('');
    this.goBack();
  }

  protected goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  protected goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }

  private extractErrorMessage(err: any, fallback: string): string {
    const message = err?.error?.message || err?.error?._server_messages;
    if (message) {
      try {
        const parsed = JSON.parse(message);
        return typeof parsed === 'string'
          ? parsed
          : parsed[0]?.message || fallback;
      } catch {
        return typeof message === 'string' ? message : fallback;
      }
    }
    return err?.message || fallback;
  }
}
