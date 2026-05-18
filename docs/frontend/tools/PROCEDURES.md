# Tool: `procedures`

Tool que muestra una lista de **tramites** configurados para el portal. Los tramites pueden ser internos (se completan creando una Logbook Entry) o externos (se muestra info y se redirige).

| Item | Valor |
|------|-------|
| `tool_type` | `procedures` |
| Archivo TS | `src/app/features/tools/procedures/procedures-tool.component.ts` |
| Selector | `app-procedures-tool` |
| Clase | `ProceduresToolComponent` |
| Servicio backend | `logbook.api.procedures` |
| App backend | `logbook` |

---

## 1. Configuracion requerida

El `Service Portal Tool` con `tool_type = 'procedures'` necesita:

| Custom Field | Tipo | Obligatorio | Proposito |
|--------------|------|-------------|-----------|
| `logbook_procedures_config` | Link -> Logbook Procedures Config | si | Configuracion de tramites disponibles para este portal |

Validacion:

```typescript
// procedures-tool.component.ts:76-95
ngOnInit(): void {
  if (this.isAnonymousUser()) return;

  const portal = this.selectedPortal();
  const tool = portal?.tools.find(t => t.tool_type === 'procedures');

  if (!tool) {
    this.error.set('Configuracion de tramites no encontrada');
    return;
  }

  this.toolName = tool.name || '';

  if (!(tool as any).logbook_procedures_config) {
    this.error.set('Esta herramienta no tiene una configuracion de tramites asignada');
    return;
  }

  this.loadProcedures();
}
```

---

## 2. Modelo

```typescript
// procedures-tool.component.ts:18-26
interface Procedure {
  name: string;
  title: string;
  description: string;
  icon: string;
  procedure_type: 'internal' | 'external';
  external_info?: string;
  external_url?: string;
}

interface CreatedEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  assigned_area: string;
  start_date: string;
}
```

---

## 3. Vista (state machine)

```typescript
// procedures-tool.component.ts:38
type ViewState = 'list' | 'form' | 'confirm' | 'external';
```

| Estado | Descripcion |
|--------|-------------|
| `'list'` | Lista de tramites configurados (default) |
| `'form'` | Tramite interno seleccionado: form de descripcion |
| `'confirm'` | Despues de crear: modal/vista de exito con datos de la entrada |
| `'external'` | Tramite externo seleccionado: muestra info y URL externa |

---

## 4. Flujo

```
[Lista de tramites]
    |
    +-- Tramite interno
    |       |
    |       v
    |   [Form con voice input]
    |       |
    |       +-- Submit -> POST create_procedure_entry
    |               |
    |               v
    |           [Confirmacion]
    |
    +-- Tramite externo
            |
            +-- POST register_external_request (fire-and-forget, no UI)
            |
            v
        [Vista informativa con URL externa]
```

---

## 5. Signals

```typescript
// procedures-tool.component.ts:50-72
protected selectedPortal = this.stateService.selectedPortal;
protected userContact = this.stateService.userContact;
protected isAnonymousUser = this.stateService.isAnonymousUser;

protected view = signal<ViewState>('list');
protected loading = signal<boolean>(false);
protected loadingProcedures = signal<boolean>(false);
protected error = signal<string | null>(null);

protected procedures = signal<Procedure[]>([]);
protected selectedProcedure = signal<Procedure | null>(null);

protected userContext = signal<string>('');

protected createdEntry = signal<CreatedEntry | null>(null);
```

---

## 6. APIs consumidas

| Endpoint | HTTP | Cuando | Args |
|----------|------|--------|------|
| `logbook.api.procedures.get_procedures` | GET | Carga inicial | `{ tool_name }` |
| `logbook.api.procedures.register_external_request` | POST | Al click tramite externo | `{ procedure_name }` |
| `logbook.api.procedures.create_procedure_entry` | POST | Submit form interno | `{ procedure_name, user_context }` |

---

## 7. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Lee tool name y custom field, llama `loadProcedures()` |
| `loadProcedures()` | GET con `tool_name` |
| `selectProcedure(procedure)` | Si interno -> `view = 'form'`. Si externo -> `view = 'external'` + `registerExternalRequest(name)` |
| `registerExternalRequest(name)` | POST fire-and-forget (no UI feedback en error) |
| `submitEntry()` | Valida y POSTea `create_procedure_entry`. En exito: `view = 'confirm'` |
| `backToList()` | Resetea state y vuelve a `view = 'list'` |
| `closeAndGoHome()` | Limpia y `goBack()` |
| `goBack()` | Navega al portal |
| `goToRegistration()` | Navega a register |

---

## 8. Tramites internos vs externos

### Internos (`procedure_type === 'internal'`)

- Se abre form con textarea + voice input.
- Submit crea una Logbook Entry en backend.
- Muestra confirmacion con datos de la entrada (`createdEntry`).

### Externos (`procedure_type === 'external'`)

- Muestra `procedure.external_info` (texto descriptivo) y `procedure.external_url` (link al sistema externo).
- En paralelo se registra un "Procedure Request" en backend via `registerExternalRequest`, para tracking.

---

## 9. Manejo de errores en submit

```typescript
// procedures-tool.component.ts:181-194
error: (err) => {
  const message = err?.error?.message || err?.error?._server_messages;
  if (message) {
    try {
      const parsed = JSON.parse(message);
      this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Error...');
    } catch {
      this.error.set(typeof message === 'string' ? message : 'Error...');
    }
  } else {
    this.error.set('Error al registrar el tramite...');
  }
  this.loading.set(false);
}
```

Mismo patron que `create-logbook` (deuda: extraer a helper compartido).

---

## 10. Notas y deuda tecnica

- **`registerExternalRequest` ignora errores**: solo loggea en consola (line 137-139). Si el backend falla, el usuario no se entera. Considerar mostrar warning.
- **`procedure.icon`** es un string libre, pero no se sabe si es Lucide name o emoji. Si es Lucide, debe pasarse a `<app-icon name="...">`. Verificar template.
- **Tipo de tramite (`internal`/`external`) hardcoded**: si el backend agrega un tipo nuevo, el template no lo soporta.
- **`logbook_procedures_config`** es el campo en el tool. Pero el endpoint recibe `tool_name` (el `name` del `Service Portal Tool`). Backend infiere la config a partir del tool.
- **No hay "regresar" desde `external` view a la lista** salvo via `backToList()`.
- **`userContext` se pierde** si el usuario cambia de vista sin enviar.
