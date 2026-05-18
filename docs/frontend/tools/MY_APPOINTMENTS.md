# Tool: `my_appointments`

Tool de lectura que lista las citas del User Contact autenticado y permite cancelarlas.

| Item | Valor |
|------|-------|
| `tool_type` | `my_appointments` |
| Archivo TS | `src/app/features/tools/my-appointments/my-appointments-tool.component.ts` |
| Selector | `app-my-appointments-tool` |
| Clase | `MyAppointmentsToolComponent` |
| Servicio backend | `meet_scheduling.api.appointments` |

---

## 1. Configuracion requerida

Ninguna. No requiere custom fields en el `Service Portal Tool`. Basta con que el `tool_type` este declarado y `is_enabled = true`.

---

## 2. Flujo

```
[Pantalla principal]
    |
    +-- Cargando spinner mientras carga
    |
    +-- Lista de citas (ordenadas por fecha desc)
    |       |
    |       +-- Cada card muestra: status badge, fecha, hora, resource, contexto
    |       |
    |       +-- Boton "Cancelar" (con confirm nativo)
    |
    +-- Estado vacio: "No tienes citas"
    +-- Estado anonimo: pedir registro
```

---

## 3. Signals

```typescript
// my-appointments-tool.component.ts:28-39
protected loading = signal<boolean>(false);
protected error = signal<string | null>(null);
protected successMessage = signal<string | null>(null);
protected userAppointments = signal<Appointment[]>([]);

protected currentUser = this.stateService.currentUser;
protected userContact = this.stateService.userContact;
protected selectedPortal = this.stateService.selectedPortal;
protected isAnonymousUser = this.stateService.isAnonymousUser;
```

---

## 4. APIs consumidas

| Metodo del service | Endpoint | HTTP | Cuando |
|--------------------|----------|------|--------|
| `getMyAppointments()` | `meet_scheduling.api.appointments.get_my_appointments` | GET con `X-User-Contact-Token` | Al cargar y tras cancelar |
| `cancelMyAppointment(name)` | `meet_scheduling.api.appointments.cancel_my_appointment` | POST + honeypot | Al cancelar |

Notar que NO se usa `getUserAppointments` (que requiere permisos Frappe). Se usa el endpoint con token.

---

## 5. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Sale si anonimo. Llama `loadUserAppointments()` |
| `loadUserAppointments()` | GET y sort desc por `start_datetime` |
| `cancelAppointment(appointment)` | Confirma con `confirm()` nativo y llama `cancelMyAppointment`. Recarga la lista. |
| `formatTime/formatDate` | Helpers `Intl` con `es-ES` |
| `getStatusClass(status)` | Mapea `'Confirmed' / 'Completed' / 'Cancelled' / 'No-show' / 'Draft'` a clases CSS |
| `goBack()` | Navega al portal |
| `goToRegistration()` | Navega a `/portal/X/register` |

---

## 6. Filtros

Actualmente **no hay filtros** implementados en el componente. El service `getMyAppointments(status?, fromDate?, toDate?)` acepta filtros, pero el componente los llama sin parametros.

Si se quisieran agregar filtros (ej: por status), seria una mejora directa:

```typescript
protected statusFilter = signal<string | null>(null);

loadUserAppointments(): void {
  this.meetSchedulingService.getMyAppointments(this.statusFilter() ?? undefined).subscribe(...);
}
```

---

## 7. Status badge classes

```typescript
// my-appointments-tool.component.ts:132-140
getStatusClass(status: string): string {
  switch (status) {
    case 'Confirmed': return 'status-confirmed';
    case 'Completed': return 'status-completed';
    case 'Cancelled': return 'status-cancelled';
    case 'No-show':   return 'status-noshow';
    default:          return 'status-draft';
  }
}
```

Las clases estan definidas en el SCSS del componente (mismo SCSS de `meet-scheduling-tool` pero copiado).

---

## 8. Notas y deuda tecnica

- **No hay filtros** ni paginacion. Si el usuario tiene muchas citas (>50) la UI puede degradarse.
- **Confirm nativo** para cancelar. Inconsistente con la UI custom.
- **Status como string libre**: depende de los valores que retorne el backend. Si el backend cambia el case (ej: `confirmed` vs `Confirmed`) se rompen los badges.
- **No hay "ver detalle"**: el service tiene `getMyAppointmentDetail(name)` pero el componente no lo usa.
- **Cancel reuse de `loadUserAppointments()`** dispara dos requests: el cancel + el list. Considerar optimistic update.
