/**
 * My PQR Tool Component
 *
 * Lists the PQRs submitted by the currently authenticated user contact.
 * Anonymous PQRs are NEVER shown here (they cannot be tracked back).
 * Allows viewing detail (status, resolution if any).
 */

import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

interface PQRListItem {
  name: string;
  pqr_type: string;
  pqr_type_label: string;
  pqr_type_color?: string;
  pqr_type_icon?: string;
  subject: string;
  status: string;
  received_at: string;
  resolved_at?: string;
}

interface PQRDetail extends PQRListItem {
  description: string;
  resolution?: string;
  is_anonymous: boolean;
}

@Component({
  selector: 'app-my-pqr-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './my-pqr-tool.component.html',
  styleUrls: ['./my-pqr-tool.component.scss']
})
export class MyPqrToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Portal state
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // UI state
  protected loading = signal<boolean>(false);
  protected loadingDetail = signal<boolean>(false);
  protected error = signal<string | null>(null);

  // List state
  protected pqrs = signal<PQRListItem[]>([]);
  protected filterStatus = signal<string>('all');

  // Detail state
  protected selectedPQR = signal<PQRDetail | null>(null);

  protected filteredPqrs = computed(() => {
    const status = this.filterStatus();
    if (status === 'all') return this.pqrs();
    if (status === 'open') {
      return this.pqrs().filter(p => !['Resolved', 'Closed', 'Rejected'].includes(p.status));
    }
    if (status === 'closed') {
      return this.pqrs().filter(p => ['Resolved', 'Closed', 'Rejected'].includes(p.status));
    }
    return this.pqrs();
  });

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;
    this.loadPqrs();
  }

  private async loadPqrs(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.frappeApi.callMethod<PQRListItem[]>(
        'pqr_management.api.entries.get_my_pqr',
        {},
        true
      ).toPromise();

      this.pqrs.set(response?.message || []);
    } catch (err: any) {
      console.error('Error loading PQRs:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al cargar las PQR.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async viewDetail(pqr: PQRListItem): Promise<void> {
    this.loadingDetail.set(true);
    this.error.set(null);

    try {
      const response = await this.frappeApi.callMethod<PQRDetail>(
        'pqr_management.api.entries.get_pqr_detail',
        { pqr_name: pqr.name },
        true
      ).toPromise();

      const data = response?.message;
      if (data) {
        this.selectedPQR.set(data);
      }
    } catch (err: any) {
      console.error('Error loading PQR detail:', err);
      this.error.set(this.extractErrorMessage(err, 'Error al cargar el detalle.'));
    } finally {
      this.loadingDetail.set(false);
    }
  }

  protected closeDetail(): void {
    this.selectedPQR.set(null);
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

  protected formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  protected getStatusClass(status: string): string {
    const map: Record<string, string> = {
      'New': 'status-new',
      'In Review': 'status-review',
      'In Process': 'status-process',
      'Resolved': 'status-resolved',
      'Closed': 'status-closed',
      'Rejected': 'status-rejected',
    };
    return map[status] || 'status-default';
  }

  protected translateStatus(status: string): string {
    const map: Record<string, string> = {
      'New': 'Nueva',
      'In Review': 'En revisión',
      'In Process': 'En proceso',
      'Resolved': 'Resuelta',
      'Closed': 'Cerrada',
      'Rejected': 'Rechazada',
    };
    return map[status] || status;
  }
}
