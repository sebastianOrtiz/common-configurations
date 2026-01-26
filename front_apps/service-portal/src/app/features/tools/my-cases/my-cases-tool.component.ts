import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
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

interface CaseParty {
  party_name: string;
  party_role: string;
  identification?: string;
  contact_info?: string;
  notes?: string;
}

interface CaseDetail {
  name: string;
  case_title: string;
  case_type: string;
  legal_area: string;
  status: string;
  priority: string;
  start_date: string;
  estimated_end_date?: string;
  assigned_lawyer: string;
  case_description?: string;
  desired_outcome?: string;
  user_context?: string;
  is_free_service?: number;
  actions?: CaseAction[];
  documents?: CaseDocument[];
  important_dates?: CaseDate[];
  parties?: CaseParty[];
  estimated_amount?: number;
  legal_fees?: number;
  expenses?: number;
  payment_status?: string;
  closure_date?: string;
  final_outcome?: string;
  closure_notes?: string;
}

@Component({
  selector: 'app-my-cases-tool',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-cases-tool.component.html',
  styleUrls: ['./my-cases-tool.component.scss']
})
export class MyCasesToolComponent implements OnInit {
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
    console.log('=== MY CASES COMPONENT INIT ===');
    console.log('User contact:', this.userContact());
    await this.loadCases();
  }

  private async loadCases() {
    const contact = this.userContact();

    if (!contact || !contact.name) {
      this.error.set('No se encontró información de contacto');
      this.loading.set(false);
      return;
    }

    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.http.get<{ message: CaseLog[] }>(
        '/api/method/lex_app.api.case_log_api.get_user_cases',
        {
          params: { user_contact: contact.name }
        }
      ).toPromise();

      console.log('Cases API response:', response);

      if (response?.message) {
        console.log('Setting cases:', response.message);
        this.cases.set(response.message);
        console.log('Cases after set:', this.cases());
        console.log('hasCases:', this.hasCases());
        console.log('activeCases:', this.activeCases());
      } else {
        console.log('No message in response');
      }
    } catch (err: any) {
      console.error('Error loading cases:', err);
      this.error.set('Error al cargar los casos');
    } finally {
      console.log('Setting loading to false');
      this.loading.set(false);
      console.log('Loading is now:', this.loading());
    }
  }

  protected async viewCaseDetail(caseName: string) {
    const contact = this.userContact();
    if (!contact || !contact.name) return;

    try {
      this.loading.set(true);
      this.error.set(null);

      const response = await this.http.get<{ message: CaseDetail }>(
        '/api/method/lex_app.api.case_log_api.get_case_detail',
        {
          params: {
            case_name: caseName,
            user_contact: contact.name
          }
        }
      ).toPromise();

      if (response?.message) {
        this.selectedCase.set(response.message);
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

  protected formatCurrency(amount: number | undefined): string {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  protected getPaymentStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'Pending': 'yellow',
      'Partial': 'orange',
      'Paid': 'green',
      'Overdue': 'red'
    };
    return colors[status] || 'gray';
  }

  protected getOutcomeColor(outcome: string): string {
    const colors: { [key: string]: string } = {
      'Favorable': 'green',
      'Partially Favorable': 'blue',
      'Unfavorable': 'red',
      'Dismissed': 'gray',
      'Settlement': 'orange',
      'Other': 'gray'
    };
    return colors[outcome] || 'gray';
  }
}
