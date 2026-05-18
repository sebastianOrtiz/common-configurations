# Tool: `meet_scheduling`

Tool que permite a un User Contact autenticado agendar una cita seleccionando fecha, horario y agregando contexto opcional.

| Item | Valor |
|------|-------|
| `tool_type` | `meet_scheduling` |
| Archivo TS | `src/app/features/tools/meet-scheduling/meet-scheduling-tool.component.ts` |
| Archivo HTML | `meet-scheduling-tool.component.html` |
| Archivo SCSS | `meet-scheduling-tool.component.scss` |
| Selector | `app-meet-scheduling-tool` |
| Clase | `MeetSchedulingToolComponent` |
| Servicio backend | `meet_scheduling.api.appointments` |
| App backend | `meet_scheduling` |

---

## 1. Configuracion requerida en backend

El `Service Portal Tool` con `tool_type = 'meet_scheduling'` necesita los siguientes custom fields (registrados por la app `meet_scheduling`):

| Custom Field | Tipo | Obligatorio | Proposito |
|--------------|------|-------------|-----------|
| `calendar_resource` | Link -> Calendar Resource | si | Recurso de calendario al que se agendaran las citas |
| `show_calendar_view` | Check | no (default true) | Si mostrar vista de calendario o solo dropdown de fechas |

El componente los lee asi (line 89-103):

```typescript
const portal = this.selectedPortal();
const tool = portal?.tools.find(t => t.tool_type === 'meet_scheduling');

if (tool && tool.calendar_resource) {
  this.calendarResource.set(tool.calendar_resource);
  this.showCalendarView.set(tool.show_calendar_view ?? true);
  this.loadCalendarMonth(this.currentMonth());
  this.loadUserAppointments();
} else {
  this.error.set('Configuracion de calendario no encontrada');
}
```

---

## 2. Flujo de usuario

```
[Pantalla principal]
    |
    +-- Tab "Agendar" (default)
    |       |
    |       v
    |   [Calendario del mes]
    |       |
    |       +-- click en dia con disponibilidad
    |       v
    |   [Lista de slots disponibles ese dia]
    |       |
    |       +-- click en slot
    |       v
    |   [Boton "Agendar cita"]
    |       |
    |       v
    |   [Modal pre-confirmacion]
    |       |  (input opcional para contexto + voice input)
    |       |
    |       +-- "Confirmar"
    |       v
    |   POST createAndConfirmAppointment
    |       |
    |       v
    |   [Modal de exito]
    |       |
    |       +-- "Ver mis citas" -> tab Mis Citas
    |
    +-- Tab "Mis Citas"
            |
            v
        Lista de citas + boton cancelar c/u
```

---

## 3. Signals declarados

```typescript
// meet-scheduling-tool.component.ts:46-83
// Config (leidos del portal tool)
protected calendarResource = signal<string>('');
protected showCalendarView = signal<boolean>(true);

// UI State
protected loading = signal<boolean>(false);
protected loadingSlots = signal<boolean>(false);
protected error = signal<string | null>(null);
protected successMessage = signal<string | null>(null);
protected activeTab = signal<'book' | 'appointments'>('book');
protected showPreConfirmModal = signal<boolean>(false);
protected showConfirmModal = signal<boolean>(false);
protected confirmedAppointment = signal<Appointment | null>(null);
protected appointmentContext = signal<string>('');

// Scheduling
protected selectedDate = signal<string>('');
protected availableSlots = signal<AvailableSlot[]>([]);
protected selectedSlot = signal<AvailableSlot | null>(null);
protected dateOptions = signal<DateOption[]>([]);

// Calendar
protected currentMonth = signal<Date>(new Date());
protected calendarDays = signal<CalendarDay[]>([]);
protected availabilityMap = signal<Map<string, AvailableSlot[]>>(new Map());

// Constantes (no signal)
protected monthNames = ['Enero', 'Febrero', ...];
protected weekDays = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

// User appointments
protected userAppointments = signal<Appointment[]>([]);

// Computed
protected hasSlots = computed(() => this.availableSlots().length > 0);

// State global
protected currentUser = this.stateService.currentUser;
protected userContact = this.stateService.userContact;
protected selectedPortal = this.stateService.selectedPortal;
protected isAnonymousUser = this.stateService.isAnonymousUser;
```

---

## 4. APIs consumidas

Todas via `MeetSchedulingService` (`core/services/meet-scheduling.service.ts`).

| Metodo del service | Endpoint backend | HTTP | Cuando |
|--------------------|------------------|------|--------|
| `getAvailableSlots(resource, from, to)` | `get_available_slots` | GET | Carga inicial y al cambiar de mes |
| `createAndConfirmAppointment(resource, contact, start, end, context)` | `create_and_confirm_appointment` | POST + honeypot | Al confirmar booking |
| `getMyAppointments()` | `get_my_appointments` | GET (con `X-User-Contact-Token`) | Tab "Mis Citas" |
| `cancelMyAppointment(name)` | `cancel_my_appointment` | POST + honeypot | Cancelar cita |

---

## 5. Metodos publicos del componente

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Lee config, carga mes actual y citas. Sale temprano si anonimo. |
| `previousMonth() / nextMonth()` | Navegacion del calendario |
| `getCurrentMonthName()` | "Enero 2026" |
| `onDaySelected(day)` | Click en dia. Filtra slots de ese dia y los muestra. |
| `onDateSelected(value)` | Alternativa a `onDaySelected` para legacy dropdown. |
| `selectSlot(slot)` | Marca slot seleccionado. |
| `switchTab(tab)` | `'book'` / `'appointments'`. Limpia errores. |
| `bookAppointment()` | Abre modal pre-confirmacion. |
| `confirmBooking()` | Crea cita en backend. Cierra pre-confirm, abre confirm modal. |
| `closePreConfirmModal()` | Cancela el modal de pre-confirmacion. |
| `closeConfirmModal()` | Cierra el modal de exito. |
| `viewAppointments()` | Cierra modal y va al tab Mis Citas. |
| `cancelAppointment(appointment)` | Cancela cita con `confirm()` nativo. |
| `formatTime(datetime)` | "14:30" |
| `formatDate(datetime)` | "lunes, 17 de marzo de 2026" |
| `getStatusClass(status)` | Devuelve clase CSS para badge segun status |
| `goBack()` | Navega al portal padre |
| `goToRegistration()` | Navega a `/portal/X/register` |

---

## 6. Construccion del calendario

`generateCalendarDays(monthDate)` (line 156-214) construye un grid de 42 celdas (6 semanas) con:

```typescript
interface CalendarDay {
  date: Date;
  dateStr: string;        // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  hasAvailability: boolean;
  isPast: boolean;
}
```

Luego `updateCalendarAvailability()` (line 219-226) marca los dias que tienen slots en el `availabilityMap`. Solo dias `isCurrentMonth && !isPast && hasAvailability` son clickables.

---

## 7. Voice input para el contexto

El modal de pre-confirmacion usa `<app-voice-input>` para dictar el contexto de la cita:

```html
<textarea [(ngModel)]="appointmentContextValue" rows="4"></textarea>
<app-voice-input
  language="es-ES"
  buttonLabel="Dictar"
  (transcriptChange)="onVoiceTranscript($event)"
></app-voice-input>
```

Donde `onVoiceTranscript` setea `appointmentContext.set(...)`.

---

## 8. Notas y deuda tecnica

- **Confirmacion con `confirm()` nativo** (line 501): usa el dialog del navegador. Inconsistente con el resto de la UI que tiene modales custom.
- **`generateDateOptions` legacy** (line 286-301): codigo no usado pero queda en el archivo.
- **`portal.name` vs `portal.portal_name`** (line 560 vs 570): inconsistencia.
- **Falta manejo de timezone**: las fechas se construyen con `Date` local del cliente. Si el `Calendar Resource` esta en otra tz, podria haber descuadres.
- **`isAnonymousUser` check**: solo en `ngOnInit`. Si el usuario hace logout en otro tab, el componente sigue cargado sin reaccionar. Considerar un effect que limpie.
- **`appointmentContext` no se limpia** al cerrar el pre-confirm modal sin confirmar (de hecho lo limpia line 454, pero no si el usuario simplemente navega fuera).
