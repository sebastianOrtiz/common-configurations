# Tool: `create_logbook`

Tool que permite a un User Contact autenticado crear una entrada de bitacora (Logbook Entry) directamente desde el portal, sin necesidad de crear una cita primero.

| Item | Valor |
|------|-------|
| `tool_type` | `create_logbook` |
| Archivo TS | `src/app/features/tools/create-logbook/create-logbook-tool.component.ts` |
| Selector | `app-create-logbook-tool` |
| Clase | `CreateLogbookToolComponent` |
| Servicio backend | `logbook.api.entries` |
| App backend | `logbook` |

---

## 1. Configuracion requerida

El `Service Portal Tool` con `tool_type = 'create_logbook'` necesita:

| Custom Field | Tipo | Obligatorio | Proposito |
|--------------|------|-------------|-----------|
| `logbook_availability` | Link -> Logbook Availability | si | Define a quien se asigna y con que reglas |

Lectura del campo:

```typescript
// create-logbook-tool.component.ts:53-64
ngOnInit(): void {
  if (this.isAnonymousUser()) return;

  const portal = this.selectedPortal();
  const tool = portal?.tools.find(t => t.tool_type === 'create_logbook');

  if (tool && (tool as any).logbook_availability) {
    this.logbookAvailability = (tool as any).logbook_availability;
  } else {
    this.error.set('Configuracion de disponibilidad no encontrada');
  }
}
```

Notar el cast `(tool as any)` porque `logbook_availability` no esta tipado en `ServicePortalTool` (es un custom field externo).

---

## 2. Flujo

```
[Pantalla con textarea]
    |
    +-- Usuario escribe contexto (o usa voice input)
    |
    +-- Click "Crear bitacora"
    |
    v
   POST create_entry_from_portal
    |
    v
[Modal de confirmacion con datos de la entrada]
    |
    +-- "Aceptar" -> navega de vuelta al portal
```

---

## 3. Signals

```typescript
// create-logbook-tool.component.ts:38-48
protected selectedPortal = this.stateService.selectedPortal;
protected userContact = this.stateService.userContact;
protected isAnonymousUser = this.stateService.isAnonymousUser;

protected loading = signal<boolean>(false);
protected error = signal<string | null>(null);
protected userContext = signal<string>('');
protected showConfirmModal = signal<boolean>(false);
protected createdEntry = signal<CreatedEntry | null>(null);
```

Modelo local:

```typescript
// create-logbook-tool.component.ts:17-24
interface CreatedEntry {
  name: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  start_date: string;
}
```

---

## 4. APIs consumidas

| Endpoint | HTTP | Cuando | Args |
|----------|------|--------|------|
| `logbook.api.entries.create_entry_from_portal` | POST | Click en submit | `{ user_contact, user_context, logbook_availability }` |

Usa `FrappeApiService.callMethod` (no GET, es write).

---

## 5. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Lee custom field. Sale si anonimo. |
| `submitEntry()` | Valida y POSTea. Setea `createdEntry` y abre modal. Maneja errores parseando `_server_messages`. |
| `closeConfirmModal()` | Cierra modal y navega al portal. |
| `goBack()` | Vuelve al portal. |
| `goToRegistration()` | Va a `/portal/X/register`. |

### Manejo de errores

```typescript
// create-logbook-tool.component.ts:104-118
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
    this.error.set('Error al crear la entrada. Por favor intenta de nuevo.');
  }
  this.loading.set(false);
}
```

Es una doble parsing porque Frappe a veces envia `_server_messages` como string JSON anidado.

---

## 6. Voice Input

El template incluye `<app-voice-input>` para dictar la descripcion:

```html
<textarea [(ngModel)]="userContextValue"></textarea>
<app-voice-input
  language="es-ES"
  (transcriptChange)="onVoiceTranscript($event)"
></app-voice-input>
```

`onVoiceTranscript` setea `userContext.set(transcript)`.

---

## 7. Navigation post-submit

Tras confirmar, el flujo cierra el modal y navega al portal padre via `goBack()`:

```typescript
// create-logbook-tool.component.ts:122-126
closeConfirmModal(): void {
  this.showConfirmModal.set(false);
  this.createdEntry.set(null);
  this.goBack();
}
```

---

## 8. Notas y deuda tecnica

- **`logbookAvailability` no es signal** (es propiedad privada `private logbookAvailability = ''`). Si en el futuro se quiere reactividad, deberia ser signal.
- **No hay validacion del contexto minimo de caracteres**: si el usuario escribe "a" se crea la entrada. Considerar minLength.
- **El nombre del campo `userContext`** se confunde con el de "User Context" como concepto. Mejor renombrar a `description` o similar.
- **Error message duplicado** en logica de catch. Considerar extraer a un helper compartido entre tools.
