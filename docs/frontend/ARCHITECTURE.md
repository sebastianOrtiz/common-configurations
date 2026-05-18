# Arquitectura del Service Portal

Este documento describe la arquitectura general del frontend Angular del Service Portal: stack, organizacion de carpetas, patrones de diseno, flujo de datos y comunicacion HTTP con Frappe.

---

## 1. Stack tecnologico

| Capa | Tecnologia | Version |
|------|------------|---------|
| Framework | Angular | `^21.1.0` |
| Compilador | `@angular/compiler-cli` | `^21.1.0` |
| Builder | `@angular/build:application` | `^21.1.1` |
| Routing | `@angular/router` | `^21.1.0` |
| Forms | `@angular/forms` | `^21.1.0` |
| HTTP | `@angular/common/http` | `^21.1.0` |
| Iconos | `lucide-angular` | `^0.563.0` |
| Reactividad | Signals (`@angular/core`) | Builtin |
| Async (legacy) | RxJS | `~7.8.0` |
| Lenguaje | TypeScript | `~5.9.2` |
| Estilos | SCSS | inline + global |
| Test runner | Vitest | `^4.0.8` |

Fuente: `package.json:27-46`.

### Caracteristicas de Angular 21 usadas

- **Standalone components**: ningun NgModule. Cada componente declara sus propios `imports`.
- **Signals**: `signal()`, `computed()` para estado reactivo en lugar de `BehaviorSubject` o `Subject`.
- **Control flow nativo**: `@if`, `@for`, `@switch` en templates (sintaxis nueva, no estructural directiva).
- **`inject()`** function: preferida sobre injection por constructor.
- **`provideRouter()`** y **`provideHttpClient()`** como providers funcionales (no `RouterModule.forRoot`).
- **`provideBrowserGlobalErrorListeners()`** para capturar errores globales.

---

## 2. Bootstrap

`src/main.ts` arranca la app con `bootstrapApplication(App, appConfig)`:

```typescript
// src/main.ts:1-6
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
```

`appConfig` (en `src/app/app.config.ts:8-19`) provee:
- `provideBrowserGlobalErrorListeners()`
- `provideRouter(routes)` con las rutas declaradas en `app.routes.ts`
- `provideHttpClient(withInterceptorsFromDi())`

Notar que el **Service Worker** esta comentado intencionalmente:

```typescript
// src/app/app.config.ts:13-17
// Service Worker disabled - Frappe doesn't serve these files correctly
// provideServiceWorker('ngsw-worker.js', { ... })
```

El componente raiz es `App` (`src/app/app.ts:11-19`). Su unico efecto es disparar la obtencion del CSRF token de Frappe en `ngOnInit`:

```typescript
// src/app/app.ts:14-18
ngOnInit(): void {
  // Fetch CSRF token on app initialization
  // This is required for website routes that don't inject the token automatically
  this.frappeApi.fetchCsrfToken().subscribe();
}
```

El template (`src/app/app.html:1`) solo contiene `<router-outlet />`.

---

## 3. Estructura de carpetas

```
src/
|-- main.ts                       # Bootstrap
|-- index.html                    # Shell HTML, fuente Inter
|-- styles.scss                   # Reset, tipografia, scrollbars
|-- app/
    |-- app.ts                    # AppComponent raiz
    |-- app.config.ts             # ApplicationConfig
    |-- app.routes.ts             # Rutas top-level
    |-- core/                     # Singletons (services, models, guards)
    |   |-- services/             # Servicios HTTP, estado, helpers
    |   |-- models/               # Interfaces (User, ServicePortal, Appointment, ...)
    |   `-- guards/               # AuthGuard (no usado en routes)
    |-- features/                 # Componentes orientados a feature
    |   |-- auth/login/           # Login Frappe (legacy, redirige a /portals)
    |   |-- portal/               # Componentes del flujo del portal
    |   `-- tools/                # Componentes de cada tool
    `-- shared/                   # Componentes reusables
        `-- components/
```

Se sigue el patron `core / features / shared` recomendado por la guia oficial de Angular para SPAs:

- **`core/`**: singletons (`@Injectable({ providedIn: 'root' })`), guards, modelos. Solo se importa una vez.
- **`features/`**: componentes de pagina o flujo (no reusables fuera de su feature).
- **`shared/`**: componentes y utilidades genericos reusables (Icon, VoiceInput, etc).

---

## 4. Patron de tool-router (carga dinamica)

El "tool-router" es la pieza clave que permite agregar tools sin tocar las rutas. Vive en:

`src/app/features/tools/tool-router/tool-router.component.ts`

### Flujo

1. La ruta `/portal/:portalName/tool/:toolType` carga lazy `tools.routes.ts`.
2. `tools.routes.ts` define una unica child route `path: ''` que carga el componente `ToolRouterComponent`.
3. `ToolRouterComponent` lee `:toolType` del parent route y dispara `loadToolComponent(toolType)`.
4. Dentro de `loadToolComponent` hay un `switch` que hace `import()` dinamico del componente que corresponde.
5. Se instancia con `viewContainerRef.createComponent(ComponentClass)`.

Codigo relevante:

```typescript
// src/app/features/tools/tool-router/tool-router.component.ts:61-110
switch (toolType) {
  case 'meet_scheduling':
    const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
    ComponentClass = meetScheduling.MeetSchedulingToolComponent;
    break;
  case 'my_appointments':
    const myAppointments = await import('../my-appointments/my-appointments-tool.component');
    ComponentClass = myAppointments.MyAppointmentsToolComponent;
    break;
  // ... my_cases, portal_quick_links, my_logbook, create_logbook, procedures
  default:
    this.error = true;
    return;
}

if (ComponentClass) {
  this.viewContainerRef.clear();
  this.componentRef = this.viewContainerRef.createComponent(ComponentClass);
}
```

### Ventajas

- **Lazy loading real**: cada tool genera un chunk separado en build.
- **Sin acoplar router a tool types**: la lista de tools vive en backend (`Tool Type` doctype).
- **Open/closed**: agregar una tool nueva = agregar un case en el switch + un componente.

### Desventaja / deuda tecnica

Agregar tools requiere modificar `tool-router.component.ts`. Es un punto de acoplamiento dificil de extender desde otra app. Una alternativa seria un registro de componentes inyectable.

Ver tambien `tool-not-found.component.ts` que se muestra como fallback cuando el `toolType` no matchea.

---

## 5. Flujo de datos (signals + services)

### Patron general

```
Backend Frappe
    | (HTTP via FrappeApiService)
    v
Service (PortalService, MeetSchedulingService, OtpService, ...)
    | (Observable<T>)
    v
Component (subscribe / takeUntil)
    | (set signal)
    v
Template (@if, @for, {{ signal() }})
```

### Tipos de estado

1. **Estado local (UI)**: cada componente declara sus propios `signal()` para loading, error, datos de la pantalla, modal abierto, etc.

   ```typescript
   // ej: meet-scheduling-tool.component.ts:49-58
   protected loading = signal<boolean>(false);
   protected error = signal<string | null>(null);
   protected showPreConfirmModal = signal<boolean>(false);
   protected selectedDate = signal<string>('');
   ```

2. **Estado global (App)**: `StateService` (`core/services/state.service.ts`) expone signals readonly que cualquier componente puede consumir:
   - `selectedPortal` - portal actualmente seleccionado
   - `userContact` - User Contact autenticado (o anonimo)
   - `authToken` - token X-User-Contact-Token
   - `currentUser` - usuario Frappe (admin) si aplica
   - `referrerPortal` - portal de origen (para `portal_redirect`)

3. **Computed signals**: derivacion sin estado, tanto en services como en componentes:

   ```typescript
   // state.service.ts:72-83
   readonly isUserContactAuthenticated = computed(() =>
     this.userContactSignal() !== null && this.authTokenSignal() !== null
   );
   readonly isAnonymousUser = computed(() =>
     this.userContactSignal()?.name === 'anonymous'
   );
   ```

### Persistencia

Determinada en `StateService.loadPersistedState()` (`state.service.ts:290-330`). Las claves de localStorage son:

```typescript
// state.service.ts:13-19
const STORAGE_KEYS = {
  currentUser:     'sp_current_user',
  selectedPortal:  'sp_selected_portal',
  userContact:     'sp_user_contact',
  authToken:       'sp_auth_token',
  referrerPortal:  'sp_referrer_portal'
};
```

Nota: el usuario **anonimo** (`ANONYMOUS_USER_CONTACT`) NO se persiste en localStorage. Es solo de sesion. Ver `service-portal.model.ts:185-190` y `state.service.ts:184-187`.

---

## 6. Comunicacion HTTP con Frappe

Toda la comunicacion pasa por `FrappeApiService` (`core/services/frappe-api.service.ts`). Es la unica fachada HTTP de la app.

### Caracteristicas

1. **Construccion de URLs**: `buildUrl()` (line 399-412) acepta URLs absolutas, relativas o paths simples.
2. **Headers automaticos** (`getAuthHeaders()` line 81-106):
   - `Content-Type: application/json`
   - `Accept: application/json`
   - **CSRF**: `X-Frappe-CSRF-Token` extraido de `window.frappe.csrf_token` o de cookies (line 111-132).
   - **User Contact**: `X-User-Contact-Token` si hay token en `config.userContactToken`.
3. **Deduplicacion** de requests GET concurrentes via `pendingRequests` (Map) y `shareReplay(1)`.
4. **CSRF bootstrap**: en `ngOnInit` de `App` se hace `fetchCsrfToken()` (line 139-163) contra `/api/method/common_configurations.api.auth.get_csrf_token` para garantizar que el token este disponible aun en rutas que no lo inyectan.
5. **Normalizacion de respuestas** (`normalizeResponse()` line 417-444): Frappe responde con la data en `message`, asi que se mapea a `{ success, data, message, error, exc, _server_messages }`.
6. **Errores con detalle** (`handleError()` line 450-479): parsea `_server_messages` para extraer el mensaje legible que Frappe expone.

### Modos de autorizacion

```typescript
// frappe-api.service.ts:20-29
interface FrappeConfig {
  authorizationMode: 'api-token' | 'csrf-token';
  token?: string;
  userContactToken?: string;
}
```

- **`csrf-token`** (default): para usuarios web (cookies de sesion + token CSRF).
- **`api-token`**: modo dev/test con un API key/secret en `Authorization: Basic <token>` (line 87-88). Activable con `setApiToken()` (line 484-488).

El **X-User-Contact-Token** es ortogonal a los anteriores: siempre se envia si esta presente, sin importar el modo.

### Helpers convenientes

`FrappeApiService` expone metodos de alto nivel:

| Metodo | Proposito |
|--------|-----------|
| `callMethod(path, args, useGet?)` | Llama a un metodo whitelisted `frappe.call`. `useGet=true` para read-only (evita CSRF). |
| `getDoc(doctype, name)` | GET `/api/resource/<doctype>/<name>` |
| `getList(doctype, filters, fields, start, limit)` | GET `/api/resource/<doctype>` |
| `createDoc(doctype, data)` | POST `/api/resource/<doctype>` |
| `updateDoc(doctype, name, data)` | PUT `/api/resource/<doctype>/<name>` |
| `deleteDoc(doctype, name)` | DELETE `/api/resource/<doctype>/<name>` |
| `login(username, password)` | POST `/api/method/login` |
| `logout()` | POST `/api/method/logout` |
| `getCurrentUser()` | GET `/api/method/frappe.auth.get_logged_user` |
| `getDocTypeMeta(doctype)` | GET `/api/method/frappe.desk.form.load.getdoctype` |

---

## 7. Estado anonimo vs autenticado

El sistema soporta dos tipos de "usuario":

1. **User Contact autenticado** (caso comun): el usuario hizo registro/login por documento y tiene un token `sp_auth_token` en localStorage. El header `X-User-Contact-Token` se envia en todas las requests.

2. **Usuario anonimo** (`ANONYMOUS_USER_CONTACT`, `service-portal.model.ts:185-190`): se establece automaticamente cuando el portal tiene `require_auth = false`. No tiene auth_token, no se persiste y se considera "invitado". Cada tool debe chequear `isAnonymousUser()` antes de pedir datos privados.

Patron tipico en una tool:

```typescript
// my-appointments-tool.component.ts:41-44
ngOnInit(): void {
  if (this.isAnonymousUser()) return;
  this.loadUserAppointments();
}
```

Y el template muestra un estado "auth required":

```html
@if (isAnonymousUser()) {
  <div class="auth-required-state">
    <h3>Acceso restringido</h3>
    <button (click)="goToRegistration()">Registrarse / Iniciar sesion</button>
  </div>
}
```

---

## 8. Tabla de configuracion Angular

Fuente: `angular.json`.

| Campo | Valor |
|-------|-------|
| `outputPath` | `../../common_configurations/public/service-portal` |
| `baseHref` | `/service-portal/` |
| `deployUrl` | `/assets/common_configurations/service-portal/browser/` |
| `browser` | `src/main.ts` |
| `tsConfig` | `tsconfig.app.json` |
| `inlineStyleLanguage` | `scss` |
| `assets[0].input` | `public` |
| `styles` | `["src/styles.scss"]` |
| `production.outputHashing` | `all` |
| `production.serviceWorker` | `ngsw-config.json` (declarado, pero no provisto en runtime) |
| `production.budgets.initial.maximumError` | `1MB` |

---

## 9. Notas y deuda tecnica detectadas

- **Logs de debug** en produccion: `FrappeApiService` imprime tokens recortados en `console.log` (`[Auth Debug]`, lineas 72-103, 504-509). Considerar removerlos antes de release o gatearlos con `isDevMode()`.
- **AuthGuard no esta en uso**: el archivo `core/guards/auth.guard.ts` existe pero no se referencia en `app.routes.ts`. La ruta `/login` redirige a `/portals` (no se usa login Frappe). El guard es codigo muerto.
- **`appointment-booking-tool.component`** no esta registrado en el `tool-router`. Parece una version legacy / alternativa de `meet-scheduling`. Mantenerlo o eliminarlo.
- **Service Worker**: declarado en build pero no provisto en runtime (comentado en `app.config.ts:13-17`). Si se reactiva, validar que `/service-portal/ngsw-worker.js` es servido por Frappe.
- **Tool router con switch**: extensible solo modificando el switch. Idealmente seria un registry inyectable.
- **`appointmentContext.value()` inexistente**: en `confirmBooking` de meet-scheduling se usa el signal correcto pero el contexto a veces es opcional sin validacion explicita.
- **`portal.name` vs `portal.portal_name`**: hay inconsistencias en el codigo donde se navega usando uno u otro. Por ejemplo `meet-scheduling-tool.component.ts:560` usa `portal.name` y `:570` usa `portal.portal_name`. Conviene unificar.
