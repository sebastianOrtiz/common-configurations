import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { StateService } from '../../../core/services/state.service';
import { HttpClient } from '@angular/common/http';

interface CaseLog {
  name: string;
  case_title: string;
  status: string;
  priority: string;
  start_date: string;
  assigned_lawyer: string;
  case_description?: string;
  estimated_end_date?: string;
}

interface CaseAction {
  action_date: string;
  action_type: string;
  description: string;
  status: string;
  responsible?: string;
}

interface CaseDocument {
  document_type: string;
  document_name: string;
  document_date: string;
  file?: string;
  description?: string;
}

interface CaseDate {
  event_type: string;
  event_date: string;
  event_time?: string;
  description: string;
  location?: string;
  status: string;
}

interface CaseDetail {
  name: string;
  case_title: string;
  status: string;
  priority: string;
  start_date: string;
  estimated_end_date?: string;
  assigned_lawyer: string;
  case_description?: string;
  desired_outcome?: string;
  actions?: CaseAction[];
  documents?: CaseDocument[];
  important_dates?: CaseDate[];
}

@Component({
  selector: 'app-case-management-tool',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './case-management-tool.component.html',
  styleUrls: ['./case-management-tool.component.scss']
})
export class CaseManagementToolComponent implements OnInit {
  private http = inject(HttpClient);
  private stateService = inject(StateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;

  // State signals
  protected loading = signal<boolean>(true);
  protected error = signal<string | null>(null);
  protected cases = signal<CaseLog[]>([]);
  protected selectedCase = signal<CaseDetail | null>(null);
  protected showCaseDetail = signal<boolean>(false);

  // Computed
  protected hasCases = computed(() => this.cases().length > 0);
  protected activeCases = computed(() =>
    this.cases().filter(c => c.status !== 'Closed' && c.status !== 'Archived')
  );
  protected closedCases = computed(() =>
    this.cases().filter(c => c.status === 'Closed' || c.status === 'Archived')
  );

  async ngOnInit() {
    await this.loadCases();
  }

  private async loadCases() {
    const contact = this.userContact();

    if (!contact) {
      this.error.set('No se encontró información de contacto');
      this.loading.set(false);
      return;
    }

    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.http.get<{ message: CaseLog[] }>(
        '/api/method/lex_app.lex_app.doctype.case_log.case_log.get_cases_by_client',
        {
          params: { user_contact: contact.name }
        }
      ).toPromise();

      if (response?.message) {
        this.cases.set(response.message);
      }
    } catch (err: any) {
      console.error('Error loading cases:', err);
      this.error.set('Error al cargar los casos');
    } finally {
      this.loading.set(false);
    }
  }

  protected async viewCaseDetail(caseName: string) {
    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.http.get<{ docs: CaseDetail[] }>(
        '/api/resource/Case Log/' + caseName
      ).toPromise();

      if (response?.docs && response.docs.length > 0) {
        this.selectedCase.set(response.docs[0]);
        this.showCaseDetail.set(true);
      }
    } catch (err: any) {
      console.error('Error loading case detail:', err);
      this.error.set('Error al cargar detalles del caso');
    } finally {
      this.loading.set(false);
    }
  }

  protected closeCaseDetail() {
    this.showCaseDetail.set(false);
    this.selectedCase.set(null);
  }

  protected goBack() {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  protected getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'New': 'blue',
      'In Progress': 'orange',
      'Waiting Client': 'yellow',
      'Waiting Third Party': 'yellow',
      'In Hearing': 'purple',
      'Closed': 'green',
      'Archived': 'gray'
    };
    return colors[status] || 'gray';
  }

  protected getPriorityColor(priority: string): string {
    const colors: { [key: string]: string } = {
      'Low': 'green',
      'Medium': 'blue',
      'High': 'orange',
      'Urgent': 'red'
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
    if (!endDate || status === 'Closed' || status === 'Archived') return null;

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
