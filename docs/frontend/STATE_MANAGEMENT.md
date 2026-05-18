# Manejo de Estado con Signals

El Service Portal usa **Angular Signals** como mecanismo principal de reactividad. La gestion de estado se distribuye en tres capas: estado local de componente, estado global centralizado (`StateService`), y persistencia opcional en `localStorage`.

---

## 1. Filosofia general

```
+------------------+
| Estado local UI  |  signal()        - loading, error, modales, forms
+------------------+
        |
        v
+------------------+
| Estado de tool   |  signal() + computed()  - datos del feature actual
+------------------+
        |
        v
+------------------+
| Estado global    |  StateService    - portal, userContact, authToken, referrer
+------------------+
        |
        v
+------------------+
| Persistencia     |  localStorage    - 'sp_*' keys
+------------------+
```

- **Signals** reemplazan `BehaviorSubject` y `Subject` para estado in-memory.
- **Computed** se usan para derivar valores sin estado adicional.
- **Effects** (`effect()`) prácticamente no se usan en la codebase actual. La sincronizacion entre signals + persistencia se hace explicitamente en setters (no via effects).

---

## 2. Patron: `signal()`

Crear un signal con valor inicial:

```typescript
import { signal } from '@angular/core';

protected loading = signal<boolean>(false);
protected error = signal<string | null>(null);
protected items = signal<Item[]>([]);
```

Leer:

```typescript
if (this.loading()) { ... }
const currentError = this.error();
const itemCount = this.items().length;
```

Escribir (set):

```typescript
this.loading.set(true);
this.error.set('Something went wrong');
this.items.set([...]);
```

Actualizar basado en valor previo:

```typescript
this.step.update(s => Math.min(s + 1, 4));
```

En templates:

```html
@if (loading()) {
  <div class="spinner"></div>
}
@for (item of items(); track item.id) {
  <li>{{ item.name }}</li>
}
```

---

## 3. Patron: `computed()`

Derivar valor de uno o mas signals:

```typescript
// state.service.ts:70-83
readonly isPortalSelected = computed(() => this.selectedPortalSignal() !== null);
readonly hasUserContact = computed(() => this.userContactSignal() !== null);
readonly isUserContactAuthenticated = computed(() =>
  this.userContactSignal() !== null && this.authTokenSignal() !== null
);
readonly isAnonymousUser = computed(() =>
  this.userContactSignal()?.name === 'anonymous'
);
```

Los computed son **lazy** y memoizados: solo se recomputan cuando alguna de sus dependencias cambia.

Ejemplo en tool (`my-cases-tool.component.ts:103-110`):

```typescript
protected hasCases = computed(() => this.cases().length > 0);
protected activeCases = computed(() =>
  this.cases().filter(c => c.status !== 'Closed' && c.status !== 'Archived')
);
protected closedCases = computed(() =>
  this.cases().filter(c => c.status === 'Closed' || c.status === 'Archived')
);
```

---

## 4. StateService: estado global

`src/app/core/services/state.service.ts`

Es un singleton (`providedIn: 'root'`) que expone:

### Signals writable (privados)

```typescript
// state.service.ts:50-57
private currentUserSignal = signal<User | null>(null);
private isAuthenticatedSignal = signal<boolean>(false);
private selectedPortalSignal = signal<ServicePortal | null>(null);
private userContactSignal = signal<UserContact | null>(null);
private authTokenSignal = signal<string | null>(null);
private referrerPortalSignal = signal<string | null>(null);
private isLoadingSignal = signal<boolean>(false);
private globalErrorSignal = signal<string | null>(null);
```

### Signals readonly (publicos)

```typescript
// state.service.ts:60-67
readonly currentUser = this.currentUserSignal.asReadonly();
readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();
readonly selectedPortal = this.selectedPortalSignal.asReadonly();
readonly userContact = this.userContactSignal.asReadonly();
readonly authToken = this.authTokenSignal.asReadonly();
readonly referrerPortal = this.referrerPortalSignal.asReadonly();
readonly isLoading = this.isLoadingSignal.asReadonly();
readonly globalError = this.globalErrorSignal.asReadonly();
```

`.asReadonly()` previene que los consumidores hagan `.set()` sobre los signals globales. Solo `StateService` puede mutarlos.

### Computed signals expuestos

Ver seccion 3 (todos los `readonly isXxx = computed(() => ...)`).

### Estado de aplicacion derivado

```typescript
// state.service.ts:86-96
readonly state = computed<AppState>(() => ({
  currentUser: this.currentUserSignal(),
  isAuthenticated: this.isAuthenticatedSignal(),
  selectedPortal: this.selectedPortalSignal(),
  userContact: this.userContactSignal(),
  authToken: this.authTokenSignal(),
  isUserContactAuthenticated: this.isUserContactAuthenticated(),
  referrerPortal: this.referrerPortalSignal(),
  isLoading: this.isLoadingSignal(),
  globalError: this.globalErrorSignal()
}));
```

Util para debugging o logging.

---

## 5. Sincronizacion entre componentes

Cualquier componente lee del global haciendo:

```typescript
private stateService = inject(StateService);

protected portal = this.stateService.selectedPortal;       // Signal<ServicePortal | null>
protected userContact = this.stateService.userContact;
protected isAnonymousUser = this.stateService.isAnonymousUser;  // Signal<boolean>
```

Y en el template:

```html
<h1>Bienvenido {{ userContact()?.full_name }}</h1>
@if (isAnonymousUser()) { ... }
```

Cuando otro componente llama a `stateService.setSelectedPortal(...)`, **todos los componentes que leen ese signal se re-renderizan automaticamente**. No hace falta subscribirse manualmente.

### Ejemplo de propagacion

1. `PortalSelectorComponent.selectPortal(portal)` -> `stateService.setSelectedPortal(portal)`.
2. `selectedPortalSignal` cambia.
3. `PortalLayoutComponent.portal` (que es `stateService.selectedPortal`) cambia automaticamente.
4. El template del layout re-renderiza el header con el nuevo portal.
5. `PortalViewComponent.portal` tambien se actualiza si esta montado.
6. Cualquier tool montada que use `selectedPortal` se actualiza.

---

## 6. Persistencia en localStorage

### Claves persistidas

```typescript
// state.service.ts:13-19
const STORAGE_KEYS = {
  currentUser: 'sp_current_user',
  selectedPortal: 'sp_selected_portal',
  userContact: 'sp_user_contact',
  authToken: 'sp_auth_token',
  referrerPortal: 'sp_referrer_portal'
};
```

### Lectura al cargar

En el constructor (`state.service.ts:98-101`):

```typescript
constructor() {
  this.loadPersistedState();
}
```

`loadPersistedState()` (line 290-330) lee cada clave, parsea JSON y setea el signal correspondiente. Si la deserializacion falla, llama a `clearPersistedState()` para evitar datos corruptos.

### Escritura en setters

Cada setter persiste o limpia segun el valor:

```typescript
// state.service.ts:138-147
setSelectedPortal(portal: ServicePortal | null): void {
  this.selectedPortalSignal.set(portal);
  if (portal) {
    localStorage.setItem(STORAGE_KEYS.selectedPortal, JSON.stringify(portal));
  } else {
    localStorage.removeItem(STORAGE_KEYS.selectedPortal);
  }
}
```

### Anonimo NO persiste

```typescript
// state.service.ts:184-187
setAnonymousContact(): void {
  this.userContactSignal.set(ANONYMOUS_USER_CONTACT);
  // Intentionally skipped: no localStorage persistence, no auth token
}
```

Esto es intencional. Si el usuario refresca la pagina, vuelve a ser anonimo (lo cual es correcto para portales publicos).

### Limpiar todo

```typescript
// state.service.ts:275-281
resetState(): void {
  this.clearAuth();
  this.clearPortal();
  this.clearUserContact();
  this.clearGlobalError();
  this.setLoading(false);
}

// state.service.ts:335-341
clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  localStorage.removeItem(STORAGE_KEYS.selectedPortal);
  localStorage.removeItem(STORAGE_KEYS.userContact);
  localStorage.removeItem(STORAGE_KEYS.authToken);
  localStorage.removeItem(STORAGE_KEYS.referrerPortal);
}
```

---

## 7. Patron en tools: setup tipico

```typescript
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { StateService } from '../../../core/services/state.service';

@Component({ ... })
export class MyToolComponent implements OnInit {
  private stateService = inject(StateService);

  // Estado global (signals readonly desde StateService)
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // Estado local (signals propios)
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected items = signal<MyItem[]>([]);

  // Derivado
  protected hasItems = computed(() => this.items().length > 0);

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getItems().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      }
    });
  }
}
```

---

## 8. Por que NO se usan effects

`effect()` se ejecuta cuando uno de sus signals dependientes cambia. Util para "side effects" automaticos (ej: persistir, log, sync con DOM).

En esta codebase **no se usan**. Las razones (deducidas):

1. **Persistencia explicita**: la sincronizacion con localStorage se hace en los setters (`setSelectedPortal`, `setUserContact`, etc), no por effects. Esto es mas predecible.
2. **Sync con FrappeApiService**: cuando se setea el `authToken` en `StateService`, **no** se setea automaticamente en `FrappeApiService` via effect. Es el llamador quien debe hacer ambas cosas.

Esto crea **una pequena fuente de inconsistencia** (ver seccion 11) que un effect resolveria limpiamente.

---

## 9. Interaccion con RxJS

Los services aun retornan `Observable<T>` (no signals). Esto es porque RxJS provee:
- `pipe`/`map` para transformar respuestas HTTP.
- `tap` para side effects (persistir token).
- `catchError` para manejo de errores tipado.

El patron es: **services usan RxJS, componentes convierten a signals**.

```typescript
this.portalService.getPortal(name).subscribe({
  next: (portal) => this.portalSignal.set(portal),   // RxJS -> signal
  error: (err) => this.error.set(err.message)
});
```

> Angular 21 introdujo `toSignal()` y `toObservable()` para interoperabilidad. Esta codebase no los usa aun (oportunidad de mejora).

---

## 10. Tabla de signals por componente clave

| Componente | Signal local | Tipo | Proposito |
|------------|--------------|------|-----------|
| `PortalSelectorComponent` | `portals` | `Signal<ServicePortal[]>` | Lista para mostrar |
| | `loading`, `error` | `Signal<boolean / string|null>` | UI |
| `PortalViewComponent` | `portal`, `enabledTools` | local copias del portal | Datos pintados |
| | `loading`, `error` | | UI |
| `ContactRegistrationComponent` | `currentStep` | `Signal<'initial'|'login'|'register'|'otp'>` | Step machine |
| | `fields`, `formData` | `Signal<DocField[] / Record>` | Form dinamico |
| | `otpSettings`, `otpDocument`, `otpMode` | | Datos para OTP |
| `OtpVerificationComponent` | `currentStep` | `'channel-select'|'code-input'` | Step interno |
| | `selectedChannel` | `'sms'|'whatsapp'` | Eleccion |
| | `otpCode`, `maskedPhone`, `expiryMinutes` | | Datos |
| | `resendCooldown` | `Signal<number>` | Cuenta regresiva |
| `MeetSchedulingToolComponent` | `calendarResource`, `showCalendarView` | Config | Tomado del portal tool |
| | `selectedDate`, `availableSlots`, `selectedSlot` | | Picker |
| | `currentMonth`, `calendarDays`, `availabilityMap` | | Calendario |
| | `showPreConfirmModal`, `showConfirmModal` | `Signal<boolean>` | Modales |
| | `appointmentContext` | `Signal<string>` | Form text |
| | `userAppointments` | `Signal<Appointment[]>` | Lista |
| | `hasSlots` | `computed` | Derivado |

---

## 11. Notas y deuda tecnica

- **Sincronizacion `StateService` <-> `FrappeApiService`**: cuando `StateService.setAuthToken()` cambia el token, `FrappeApiService.config.userContactToken` **no** se actualiza automaticamente. Solo cuando se llama `FrappeApiService.setUserContactToken()` explicitamente. Esto crea un riesgo de "estado fragmentado".
  - Solucion ideal: un `effect()` que sincronice, o consolidar en un solo lugar.
- **`AppState` interfaz**: definida pero solo usada para el computed `state` (debugging). Si se quisiera serializar el estado completo, podria reutilizarse.
- **No hay validacion del JSON de `localStorage`**: si `sp_user_contact` esta corrupto, se loggea y se limpia, pero no se notifica al usuario.
- **Persistencia eager**: cada `set()` escribe en localStorage inmediatamente. Para datos grandes (ej: portal con muchas tools) podria ser ineficiente. Considerar `debounce` o flush periodico.
- **No hay version del schema**: si en el futuro cambia la forma de `UserContact` o `ServicePortal`, no hay manera de detectar y migrar datos viejos. Considerar agregar `version: 1` a las claves persistidas.
- **No se usa `toSignal()` de RxJS**: los componentes convierten manualmente. Migrar a `toSignal(observable$)` simplificaria.
- **No hay tests de signals**: la mayoria del comportamiento reactivo no esta cubierto por tests.
