# Tool: `my_logbook`

Tool de lectura que muestra las entradas de bitacora (Logbook Entries) del User Contact autenticado.

| Item | Valor |
|------|-------|
| `tool_type` | `my_logbook` |
| Archivo TS | `src/app/features/tools/my-logbook/my-logbook-tool.component.ts` |
| Selector | `app-my-logbook-tool` |
| Clase | `MyLogbookToolComponent` |
| Servicio backend | `logbook.api.entries` |
| App backend | `logbook` |

---

## 1. Configuracion requerida

Ninguna. No requiere custom fields en el `Service Portal Tool`.

---

## 2. Flujo

```
[Lista de entradas]
    |
    +-- Activas (status != Completed / Archived / Completado / Archivado)
    |       |
    |       +-- click -> [Detalle]
    |
    +-- Completadas (Completed / Archived / Completado / Archivado)
            |
            +-- click -> [Detalle]

[Detalle]
    |
    +-- Acciones (con duracion, costo, fecha de seguimiento, etc)
    +-- Documentos
    +-- Fechas importantes
    +-- Partes involucradas
```

---

## 3. Modelos definidos inline

```typescript
// my-logbook-tool.component.ts:8-76

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

interface LogbookEntryDetail extends LogbookEntry {
  user_context?: string;
  actions?: LogbookAction[];
  documents?: LogbookDocument[];
  important_dates?: LogbookDate[];
  parties?: LogbookParty[];
}
```

---

## 4. Signals

```typescript
// my-logbook-tool.component.ts:91-111
protected selectedPortal = this.stateService.selectedPortal;
protected userContact = this.stateService.userContact;
protected isAnonymousUser = this.stateService.isAnonymousUser;

protected loading = signal<boolean>(true);
protected error = signal<string | null>(null);
protected entries = signal<LogbookEntry[]>([]);
protected selectedEntry = signal<LogbookEntryDetail | null>(null);
protected showEntryDetail = signal<boolean>(false);

protected hasEntries = computed(() => this.entries().length > 0);
protected activeEntries = computed(() =>
  this.entries().filter(e => e.status !== 'Completado' && e.status !== 'Archivado'
    && e.status !== 'Completed' && e.status !== 'Archived')
);
protected completedEntries = computed(() =>
  this.entries().filter(e => e.status === 'Completado' || e.status === 'Archivado'
    || e.status === 'Completed' || e.status === 'Archived')
);
```

Notar que se filtran los status tanto en ingles como en espanol (`Completed`/`Completado`). Esto sugiere que el backend devuelve los valores traducidos segun la sesion.

---

## 5. APIs consumidas

| Endpoint | HTTP | Cuando |
|----------|------|--------|
| `logbook.api.entries.get_my_entries` | GET (con `X-User-Contact-Token`) | Carga inicial |
| `logbook.api.entries.get_entry_detail` | GET | Click en entry. Args: `{ entry_name }` |

Usa `FrappeApiService.callMethod` con `useGet = true` (correcto para reads).

---

## 6. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Sale si anonimo. Llama `loadEntries()` |
| `loadEntries()` | GET y setea `entries` |
| `viewEntryDetail(entryName)` | GET detalle. Setea `selectedEntry` y `showEntryDetail` |
| `closeEntryDetail()` | Limpia detalle |
| `getStatusColor(status)` | Maps a colores (ingles y espanol) |
| `getPriorityColor(priority)` | Maps a colores (Low/Baja, Medium/Media, High/Alta, Urgent/Urgente) |
| `formatDate(date)` | Format `Intl` |
| `getDaysRemaining(endDate, status)` | Calcula dias restantes |
| `isOverdue(endDate, status)` | Detecta vencido |
| `goBack()`, `goToRegistration()` | Navegacion |

### Mapeo de colores por status

```typescript
// my-logbook-tool.component.ts:197-212
'New': 'blue',          'Nuevo': 'blue',
'In Progress': 'orange', 'En progreso': 'orange',
'On Hold': 'yellow',     'En espera': 'yellow',
'Waiting Response': 'yellow', 'Esperando respuesta': 'yellow',
'Completed': 'green',    'Completado': 'green',
'Archived': 'gray',      'Archivado': 'gray'
```

---

## 7. Filtros

El componente expone dos vistas computed (`activeEntries`, `completedEntries`) pero **no filtros dinamicos** por priority, fecha, etc. La separacion entre activas y completadas se hace automaticamente.

---

## 8. Notas y deuda tecnica

- **Doble mapping ingles/espanol**: indica que el backend traduce statuses segun la sesion. Si llega un valor inesperado, cae en `gray`. Considerar enum en el backend para evitar duplicacion.
- **No hay filtros adicionales** (status, priority, fechas).
- **No hay accion de edicion**: es solo lectura, lo cual es coherente con la responsabilidad de la tool. Para crear se usa `create_logbook`.
- **No paginacion**: si hay muchas entradas, todas se cargan de una.
