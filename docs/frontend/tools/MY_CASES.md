# Tool: `my_cases`

Tool de **lectura** que muestra los casos legales del User Contact autenticado, con listado, vista de detalle, y desglose financiero.

| Item | Valor |
|------|-------|
| `tool_type` | `my_cases` |
| Archivo TS | `src/app/features/tools/my-cases/my-cases-tool.component.ts` |
| Selector | `app-my-cases-tool` |
| Clase | `MyCasesToolComponent` |
| Servicio backend | `lex_app.api.case_log_api` (app externa) |
| App backend | `lex_app` |

---

## 1. Configuracion requerida

Ninguna. No requiere custom fields en el `Service Portal Tool`.

---

## 2. Flujo

```
[Lista de casos]
    |
    +-- Activos (status != Closed / Archived)
    |       |
    |       +-- click en case -> [Detalle del caso]
    |
    +-- Cerrados (Closed / Archived)
            |
            +-- click en case -> [Detalle del caso]

[Detalle del caso] (modal o vista full)
    |
    +-- Acciones realizadas (timeline)
    +-- Documentos
    +-- Fechas importantes
    +-- Partes involucradas
    +-- Info financiera
    +-- Cierre (si aplica)
```

---

## 3. Modelos definidos

Definidos inline en el componente porque son especificos de la app `lex_app`:

```typescript
// my-cases-tool.component.ts:8-77

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

interface CaseDetail extends CaseLog {
  case_type: string;
  legal_area: string;
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
```

---

## 4. Signals

```typescript
// my-cases-tool.component.ts:92-110
protected selectedPortal = this.stateService.selectedPortal;
protected userContact = this.stateService.userContact;
protected isAnonymousUser = this.stateService.isAnonymousUser;

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
```

---

## 5. APIs consumidas

| Endpoint | HTTP | Cuando | Args |
|----------|------|--------|------|
| `lex_app.api.case_log_api.get_user_cases` | GET | Carga inicial | `{ user_contact: contact.name }` |
| `lex_app.api.case_log_api.get_case_detail` | GET | Click en case | `{ case_name, user_contact }` |

Estas llamadas usan `HttpClient` directamente (no via `FrappeApiService`):

```typescript
// my-cases-tool.component.ts:135-140
const response = await this.http.get<{ message: CaseLog[] }>(
  '/api/method/lex_app.api.case_log_api.get_user_cases',
  { params: { user_contact: contact.name } }
).toPromise();
```

> **Inconsistencia**: las otras tools usan `FrappeApiService.callMethod(...)`. Esta tool usa `HttpClient` directo, lo que significa que **no envia el header `X-User-Contact-Token`**. La autenticacion se hace pasando `user_contact` como param explicito. Es deuda tecnica.

---

## 6. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Sale si anonimo. Llama `loadCases()` |
| `loadCases()` | GET con `user_contact` |
| `viewCaseDetail(caseName)` | GET detalle. Setea `selectedCase` y `showCaseDetail` |
| `closeCaseDetail()` | Limpia detalle |
| `goBack()` | Navega al portal |
| `goToRegistration()` | Navega a register |
| `getStatusColor(status)` | Mapea status a colores: `blue`/`orange`/`yellow`/`purple`/`green`/`gray` |
| `getPriorityColor(priority)` | `Low`->green, `Medium`->blue, `High`->orange, `Urgent`->red |
| `formatDate(date)` | Format `Intl` `es-ES` |
| `getDaysRemaining(endDate, status)` | Calcula dias restantes hasta `estimated_end_date` |
| `isOverdue(endDate, status)` | True si dias remaining < 0 |
| `formatCurrency(amount)` | `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })` |
| `getPaymentStatusColor(status)` | `Pending`/`Partial`/`Paid`/`Overdue` -> colores |
| `getOutcomeColor(outcome)` | `Favorable`/`Partially Favorable`/etc -> colores |

---

## 7. Console logs en produccion

El componente tiene varios `console.log` de debug (line 113-115, 142-149, 157-159) que deberian removerse antes de release:

```typescript
console.log('=== MY CASES COMPONENT INIT ===');
console.log('User contact:', this.userContact());
console.log('Cases API response:', response);
console.log('Setting cases:', response.message);
console.log('hasCases:', this.hasCases());
```

---

## 8. Notas y deuda tecnica

- **Usa `HttpClient` directo, no `FrappeApiService`**: rompe la consistencia. No envia `X-User-Contact-Token` automaticamente. La validacion se hace por `user_contact` en query param, lo cual es menos seguro (cualquiera con el name puede consultar).
- **Console logs de debug** en produccion.
- **Currency hardcoded a COP**: si se quisiera soportar otros paises, habria que parametrizar.
- **Statuses hardcoded en ingles** (`Closed`, `Archived`, `In Progress`, etc): asume que el backend siempre devuelve estos valores. Si el backend usa traducciones, los computed se rompen.
- **Detail view modal o no**: el campo `showCaseDetail` sugiere un modal. Verificar en el template como se renderiza.
- **No hay filtros** ni paginacion explicita. Si el usuario tiene muchos casos.
- **Solo lectura**: no se puede modificar nada desde el portal.
