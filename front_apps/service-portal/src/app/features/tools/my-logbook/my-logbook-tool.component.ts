import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

interface LogbookEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  start_date: string;
  assigned_to: string;
  description?: string;
  estimated_end_date?: string;
}

interface LogbookAction {
  date: string;
  action_type: string;
  description: string;
  duration?: string;
  cost?: number;
  next_step?: string;
  follow_up_date?: string;
  attachment?: string;
  registered_by?: string;
  visible_to_client?: number;
}

interface LogbookDocument {
  document_type: string;
  title: string;
  document_date: string;
  file?: string;
  description?: string;
  filing_number?: string;
  uploaded_by?: string;
}

interface LogbookDate {
  event_type: string;
  title: string;
  date: string;
  end_date?: string;
  location?: string;
  description?: string;
  completed?: number;
}

interface LogbookParty {
  party_name: string;
  role: string;
  identification?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

interface LogbookEntryDetail {
  name: string;
  title: string;
  status: string;
  priority: string;
  start_date: string;
  estimated_end_date?: string;
  assigned_to: string;
  description?: string;
  user_context?: string;
  actions?: LogbookAction[];
  documents?: LogbookDocument[];
  important_dates?: LogbookDate[];
  parties?: LogbookParty[];
}

@Component({
  selector: 'app-my-logbook-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './my-logbook-tool.component.html',
  styleUrls: ['./my-logbook-tool.component.scss']
})
export class MyLogbookToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // State signals
  protected loading = signal<boolean>(true);
  protected error = signal<string | null>(null);
  protected entries = signal<LogbookEntry[]>([]);
  protected selectedEntry = signal<LogbookEntryDetail | null>(null);
  protected showEntryDetail = signal<boolean>(false);

  // Computed
  protected hasEntries = computed(() => this.entries().length > 0);
  protected activeEntries = computed(() =>
    this.entries().filter(e => e.status !== 'Completado' && e.status !== 'Archivado'
      && e.status !== 'Completed' && e.status !== 'Archived')
  );
  protected completedEntries = computed(() =>
    this.entries().filter(e => e.status === 'Completado' || e.status === 'Archivado'
      || e.status === 'Completed' || e.status === 'Archived')
  );

  async ngOnInit() {
    if (this.isAnonymousUser()) {
      this.loading.set(false);
      return;
    }
    await this.loadEntries();
  }

  private async loadEntries() {
    const contact = this.userContact();

    if (!contact || !contact.name) {
      this.error.set('No se encontró información de contacto');
      this.loading.set(false);
      return;
    }

    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.frappeApi.callMethod<LogbookEntry[]>(
        'logbook.api.entries.get_my_entries',
        {},
        true
      ).toPromise();

      if (response?.message) {
        this.entries.set(response.message);
      }
    } catch (err: any) {
      console.error('Error loading entries:', err);
      this.error.set('Error al cargar las entradas');
    } finally {
      this.loading.set(false);
    }
  }

  protected async viewEntryDetail(entryName: string) {
    const contact = this.userContact();
    if (!contact || !contact.name) return;

    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.frappeApi.callMethod<LogbookEntryDetail>(
        'logbook.api.entries.get_entry_detail',
        { entry_name: entryName },
        true
      ).toPromise();

      if (response?.message) {
        this.selectedEntry.set(response.message);
        this.showEntryDetail.set(true);
      }
    } catch (err: any) {
      console.error('Error loading entry detail:', err);
      this.error.set('Error al cargar detalles de la entrada');
    } finally {
      this.loading.set(false);
    }
  }

  protected closeEntryDetail() {
    this.showEntryDetail.set(false);
    this.selectedEntry.set(null);
  }

  protected goBack() {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  protected goToRegistration() {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }

  protected getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'New': 'blue',
      'Nuevo': 'blue',
      'In Progress': 'orange',
      'En progreso': 'orange',
      'On Hold': 'yellow',
      'En espera': 'yellow',
      'Waiting Response': 'yellow',
      'Esperando respuesta': 'yellow',
      'Completed': 'green',
      'Completado': 'green',
      'Archived': 'gray',
      'Archivado': 'gray'
    };
    return colors[status] || 'gray';
  }

  protected getPriorityColor(priority: string): string {
    const colors: { [key: string]: string } = {
      'Low': 'green',
      'Baja': 'green',
      'Medium': 'blue',
      'Media': 'blue',
      'High': 'orange',
      'Alta': 'orange',
      'Urgent': 'red',
      'Urgente': 'red'
    };
    return colors[priority] || 'gray';
  }

  protected formatDate(date: string | undefined): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  protected getDaysRemaining(endDate: string | undefined, status: string): number | null {
    if (!endDate || status === 'Completed' || status === 'Archived'
      || status === 'Completado' || status === 'Archivado') return null;

    const today = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  protected isOverdue(endDate: string | undefined, status: string): boolean {
    const daysRemaining = this.getDaysRemaining(endDate, status);
    return daysRemaining !== null && daysRemaining < 0;
  }
}
