# Servicios Core

Los servicios core del Service Portal son singletons (`providedIn: 'root'`) que encapsulan toda la logica de acceso a Frappe, gestion de estado, autenticacion y operaciones de negocio. Viven en:

`src/app/core/services/`

| Servicio | Archivo | Responsabilidad |
|----------|---------|-----------------|
| `FrappeApiService` | `frappe-api.service.ts` | Fachada HTTP unica con Frappe (CSRF, tokens, deduplicacion, normalizacion) |
| `StateService` | `state.service.ts` | Estado global reactivo via signals + persistencia en localStorage |
| `PortalService` | `portal.service.ts` | Operaciones sobre Service Portals, User Contacts y Tool Types |
| `AuthService` | `auth.service.ts` | Login Frappe (legacy) + checkAuthStatus |
| `OtpService` | `otp.service.ts` | OTP para login y registro (SMS / WhatsApp) |
| `MeetSchedulingService` | `meet-scheduling.service.ts` | Citas (slots, crear, cancelar, listar) |

---

## 1. FrappeApiService

`src/app/core/services/frappe-api.service.ts`

Singleton que centraliza TODAS las llamadas HTTP a Frappe.

### Configuracion interna

```typescript
// frappe-api.service.ts:20-29
interface FrappeConfig {
  authorizationMode: 'api-token' | 'csrf-token';
  token?: string;             // API token (modo dev)
  userContactToken?: string;  // Token de User Contact (X-User-Contact-Token)
}
```

En el constructor, `loadConfig()` (line 60-76) lee `frappe_api_token` y `sp_auth_token` desde localStorage.

### Headers automaticos

`getAuthHeaders()` (line 81-106) produce:

| Header | Cuando |
|--------|--------|
| `Content-Type: application/json` | Siempre |
| `Accept: application/json` | Siempre |
| `Authorization: Basic <token>` | Si `authorizationMode === 'api-token'` |
| `X-Frappe-CSRF-Token: <token>` | Si `authorizationMode === 'csrf-token'` |
| `X-User-Contact-Token: <token>` | Si `config.userContactToken` esta seteado |

El CSRF token se obtiene de `getCsrfToken()` (line 111-132) que prueba:
1. `window.frappe.csrf_token`
2. `window.csrf_token` (legacy)
3. Cookie `csrf_token`

### Metodos publicos

| Metodo | Firma | Descripcion |
|--------|-------|-------------|
| `fetchCsrfToken()` | `() => Observable<string>` | GET a `common_configurations.api.auth.get_csrf_token`, guarda el token en `window.frappe.csrf_token`. Se invoca en el bootstrap de `App`. |
| `get<T>(url, params?, skipCache?)` | | GET con deduplicacion via `pendingRequests` map. |
| `post<T>(url, data?, skipCache?)` | | POST con deduplicacion opcional. |
| `put<T>(url, data)` | | PUT sin cache. |
| `delete<T>(url)` | | DELETE sin cache. |
| `callMethod<T>(methodPath, args?, useGet?)` | | RPC a `/api/method/<methodPath>`. Si `useGet=true` se usa GET (recomendado para read-only, evita CSRF en guest). |
| `getDoc(doctype, name)` | | GET `/api/resource/<doctype>/<name>`. |
| `getList(doctype, filters, fields, start, limit)` | | GET listado con `JSON.stringify(filters)`. |
| `createDoc(doctype, data)` | | POST `/api/resource/<doctype>`. |
| `updateDoc(doctype, name, data)` | | PUT. |
| `deleteDoc(doctype, name)` | | DELETE. |
| `login(usr, pwd)` | | POST `/api/method/login`. |
| `logout()` | | POST `/api/method/logout`. |
| `getCurrentUser()` | | GET `/api/method/frappe.auth.get_logged_user`. |
| `setApiToken(token)` | | Cambia a modo `api-token` y persiste en localStorage. |
| `clearApiToken()` | | Vuelve a `csrf-token`. |
| `setUserContactToken(token)` | | Guarda el token en `config` y localStorage (clave `sp_auth_token`). |
| `clearUserContactToken()` | | Limpia el token. |
| `getUserContactToken()` | | Devuelve el token actual. |
| `getDocTypeMeta(doctype)` | | GET `/api/method/frappe.desk.form.load.getdoctype?doctype=...&with_parent=1`. Usado para construir formularios dinamicos. |

### Constantes exportadas

```typescript
// frappe-api.service.ts:17
export const USER_CONTACT_AUTH_HEADER = 'X-User-Contact-Token';
```

### Tipo de respuesta normalizado

```typescript
// frappe-api.service.ts:35-44
export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  count?: number;
  message?: T; // Frappe responde con la data en 'message'
  _server_messages?: string;
  exc?: string;
}
```

### Manejo de errores

`handleError()` (line 450-479) parsea `_server_messages` para extraer el mensaje legible y lo emite con `throwError(() => new Error(errorMessage))`. Los componentes lo capturan en `error: (err) => { ... }`.

### Ejemplo de uso

```typescript
import { inject } from '@angular/core';
import { FrappeApiService } from './core/services/frappe-api.service';

class MyComponent {
  private api = inject(FrappeApiService);

  load() {
    this.api.callMethod<MyData>(
      'my_app.api.module.endpoint',
      { foo: 'bar' },
      true // useGet
    ).subscribe({
      next: (response) => {
        if (response.success) {
          console.log(response.message);
        }
      },
      error: (err) => console.error(err.message)
    });
  }
}
```

---

## 2. StateService

`src/app/core/services/state.service.ts`

Estado global reactivo. Centraliza la informacion compartida entre toda la SPA.

### Forma del estado

```typescript
// state.service.ts:24-43
export interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  selectedPortal: ServicePortal | null;
  userContact: UserContact | null;
  authToken: string | null;
  isUserContactAuthenticated: boolean;
  referrerPortal: string | null;
  isLoading: boolean;
  globalError: string | null;
}
```

### Signals expuestos (readonly)

| Signal | Tipo | Origen |
|--------|------|--------|
| `currentUser` | `Signal<User \| null>` | localStorage `sp_current_user` |
| `isAuthenticated` | `Signal<boolean>` | derivado de `currentUser` |
| `selectedPortal` | `Signal<ServicePortal \| null>` | localStorage `sp_selected_portal` |
| `userContact` | `Signal<UserContact \| null>` | localStorage `sp_user_contact` |
| `authToken` | `Signal<string \| null>` | localStorage `sp_auth_token` |
| `referrerPortal` | `Signal<string \| null>` | localStorage `sp_referrer_portal` |
| `isLoading` | `Signal<boolean>` | en memoria |
| `globalError` | `Signal<string \| null>` | en memoria |

### Computed signals (state.service.ts:70-83)

| Computed | Lambda |
|----------|--------|
| `isPortalSelected` | `selectedPortal !== null` |
| `hasUserContact` | `userContact !== null` |
| `isUserContactAuthenticated` | `userContact !== null && authToken !== null` |
| `needsContactRegistration` | `portal && !portal.require_auth ? false : portal !== null && !contact` |
| `isAnonymousUser` | `userContact?.name === 'anonymous'` |

### Metodos publicos (setters/getters)

| Metodo | Efecto |
|--------|--------|
| `setCurrentUser(user)` | Setea user + isAuthenticated. Persiste o limpia. |
| `clearAuth()` | Limpia user y flag. |
| `setSelectedPortal(portal)` | Setea portal. Persiste. |
| `clearPortal()` | Limpia portal. |
| `setUserContact(contact, authToken?)` | Setea contact + (opcional) authToken. Persiste. |
| `setAnonymousContact()` | Coloca `ANONYMOUS_USER_CONTACT` en memoria. **No persiste**. |
| `setAuthToken(token)` | Setea token. Persiste. |
| `getAuthToken()` | Lee el signal. |
| `clearUserContact()` | Limpia contact y token. |
| `setReferrerPortal(portalName)` | Setea referrer. Persiste. |
| `clearReferrerPortal()` | Limpia referrer. |
| `setLoading(bool)` | UI global. |
| `setGlobalError(string)` | UI global. |
| `clearGlobalError()` | Limpia error. |
| `resetState()` | Limpia todo. |
| `clearPersistedState()` | Borra todas las claves de localStorage. |

### Ejemplo

```typescript
import { inject } from '@angular/core';
import { StateService } from './core/services/state.service';

class MyComponent {
  private state = inject(StateService);

  protected portal = this.state.selectedPortal;          // Signal<ServicePortal | null>
  protected userContact = this.state.userContact;
  protected isAnonymous = this.state.isAnonymousUser;    // Signal<boolean>

  doSomething() {
    if (this.isAnonymous()) {
      return;
    }
    const contact = this.userContact();
    // ...
  }
}
```

---

## 3. PortalService

`src/app/core/services/portal.service.ts`

Operaciones del dominio "Service Portal" y "User Contact".

### Constantes

```typescript
// portal.service.ts:14-17
const API_CONTACTS = 'common_configurations.api.contacts';
const API_PORTALS  = 'common_configurations.api.portals';
const API_AUTH     = 'common_configurations.api.auth';
```

### Metodos publicos

| Metodo | Endpoint backend | HTTP | Retorna |
|--------|------------------|------|---------|
| `getPortal(name)` | `<API_PORTALS>.get_portal` | GET | `Observable<ServicePortal>` |
| `getActivePortals()` | `<API_PORTALS>.get_portals` | GET | `Observable<ServicePortal[]>` |
| `createUserContact(data)` | `<API_CONTACTS>.create_user_contact` | POST + honeypot | `Observable<UserContactWithToken>` |
| `updateUserContact(name, data)` | `<API_CONTACTS>.update_user_contact` | POST + honeypot | `Observable<UserContact>` |
| `getUserContactByDocument(doc)` | `<API_CONTACTS>.get_user_contact_by_document` | GET | `Observable<UserContactWithToken \| null>` |
| `setAuthToken(token)` | (helper local) | - | `void` |
| `getAuthenticatedUserContact()` | `<API_AUTH>.get_authenticated_user_contact` | GET | `Observable<UserContact \| null>` |
| `logoutUserContact()` | `<API_AUTH>.logout_user_contact` | POST | `Observable<{success}>` (limpia el token local) |
| `getToolTypes()` | `/api/resource/Tool Type` | GET list | `Observable<ToolType[]>` |
| `getUserContactFields()` | `<API_CONTACTS>.get_user_contact_fields` | GET | `Observable<DocField[]>` (campos visibles del DocType) |

Los metodos `createUserContact` y `getUserContactByDocument` automaticamente guardan el `auth_token` en `FrappeApiService` cuando la respuesta no requiere OTP (`portal.service.ts:53-60, 85-92`).

### Tipo de respuesta enriquecida

```typescript
// service-portal.model.ts:174-178
export interface UserContactWithOTP extends UserContact {
  auth_token?: string;
  requires_otp?: boolean;
  otp_settings?: OTPSettings;
}
```

`UserContactWithToken` es un alias de `UserContactWithOTP` exportado por `portal.service.ts:20`.

### Honeypot

Tanto `createUserContact` como `updateUserContact` envian `honeypot: ''` para anti-bot. El backend rechaza si llega con valor.

---

## 4. AuthService

`src/app/core/services/auth.service.ts`

Maneja autenticacion Frappe (admin / system users). **No es el camino usado por la mayoria de portales** (que usan User Contact + token). Es codigo de fallback / dev.

### Signals reexpuestos desde StateService

```typescript
// auth.service.ts:21-23
readonly currentUser = this.stateService.currentUser;
readonly isAuthenticated = this.stateService.isAuthenticated;
readonly isLoading = this.stateService.isLoading;
```

### Metodos publicos

| Metodo | Descripcion |
|--------|-------------|
| `checkAuthStatus()` | Llama a `frappe.auth.get_logged_user`, si no es `Guest` setea el user en state. |
| `login(credentials)` | `/api/method/login`. Si exitoso, recarga el user. |
| `logout()` | Limpia state y token. |
| `getUserDetails()` | `GET /api/resource/User/<email>`. |
| `setApiToken(token)` | Activa modo API token y refresca user. |

En el constructor (`auth.service.ts:25-28`) se invoca `checkAuthStatus()` automaticamente. Esto dispara una request HTTP al cargar la app.

> El `LoginComponent` (`features/auth/login/login.component.ts`) usa este servicio. La ruta `/login` actualmente redirige a `/portals` (`app.routes.ts:43-47`), por lo que el componente queda "huerfano".

---

## 5. OtpService

`src/app/core/services/otp.service.ts`

OTP (codigo de un solo uso) para verificacion en dos pasos.

### Constante

```typescript
// otp.service.ts:14
const API_OTP = 'common_configurations.api.otp';
```

### Metodos publicos

| Metodo | Endpoint | HTTP | Descripcion |
|--------|----------|------|-------------|
| `getOtpSettings()` | `get_otp_settings` | GET | Configuracion publica de OTP (enabled, canales disponibles, expiracion). |
| `isOtpEnabled()` | `is_otp_enabled` | GET | Boolean. |
| `requestOtp(document, channel)` | `request_otp` | POST | Solicita OTP para login de un User Contact existente. Canal: `sms`/`whatsapp`. |
| `verifyOtp(document, otpCode)` | `verify_otp` | POST | Verifica OTP. Retorna `{ success, auth_token, user_contact }`. |
| `requestRegistrationOtp(formData, channel)` | `request_registration_otp` | POST | Solicita OTP para nuevo registro. El form data se cachea en backend. |
| `verifyRegistrationOtp(phone, otpCode)` | `verify_registration_otp` | POST | Verifica OTP y crea el User Contact. Retorna `auth_token` + `user_contact`. |
| `resendRegistrationOtp(phone, channel?)` | `resend_registration_otp` | POST | Reenvio del codigo. |
| `cancelRegistration(phone)` | `cancel_registration` | POST | Limpia el cache de registro pendiente. |

### Modelos relacionados (service-portal.model.ts)

```typescript
// service-portal.model.ts:132-169
export interface OTPSettings {
  enabled: boolean;
  otp_length?: number;
  otp_expiry_minutes?: number;
  default_channel?: 'sms' | 'whatsapp';
  sms_available?: boolean;
  whatsapp_available?: boolean;
}
export interface OTPRequestResponse {
  success: boolean;
  message?: string;
  phone?: string;       // Numero enmascarado para mostrar
  channel?: 'sms' | 'whatsapp';
  expiry_minutes?: number;
}
export interface OTPVerifyResponse {
  success: boolean;
  auth_token?: string;
  user_contact?: string;
}
export interface RegistrationOTPVerifyResponse {
  success: boolean;
  auth_token?: string;
  user_contact?: UserContact;
}
```

---

## 6. MeetSchedulingService

`src/app/core/services/meet-scheduling.service.ts`

Operaciones de citas para el dominio `meet_scheduling` (app externa). Es consumido por las tools `meet-scheduling` y `my-appointments`.

### Constante

```typescript
// meet-scheduling.service.ts:20
const API_APPOINTMENTS = 'meet_scheduling.api.appointments';
```

### Metodos publicos

| Metodo | Endpoint | HTTP | Descripcion |
|--------|----------|------|-------------|
| `getActiveCalendarResources()` | `get_active_calendar_resources` | GET | Listado de recursos de calendario activos. |
| `getAvailableSlots(resource, from, to)` | `get_available_slots` | GET | Slots disponibles en rango. |
| `validateAppointment(resource, start, end, name?)` | `validate_appointment` | GET | Validacion preview. |
| `createAndConfirmAppointment(resource, contact, start, end, context?)` | `create_and_confirm_appointment` | POST + honeypot | Crea + confirma cita atomicamente. |
| `cancelAppointment(name)` | `cancel_or_delete_appointment` | POST | Cancela o borra (segun estado). Path generico. |
| `getAppointment(name)` | `/api/resource/Appointment/<name>` | GET | Lectura directa. |
| `generateMeeting(name)` | `generate_meeting` | POST | Regenera URL de meeting. |
| `getCalendarResource(name)` | `/api/resource/Calendar Resource/<name>` | GET | Lectura. |
| `getAvailabilityPlan(name)` | `/api/resource/Availability Plan/<name>` | GET | Lectura. |
| `getUserAppointments(contactId)` | listado filtrado por contact | GET list | Requiere permisos Frappe (no usar para guest). |
| `getResourceAppointments(resource, from?, to?)` | listado | GET list | Vista admin. |
| **Autenticadas** | | | |
| `getMyAppointments(status?, from?, to?)` | `get_my_appointments` | GET | Citas del User Contact actual (validado por token). |
| `getMyAppointmentDetail(name)` | `get_appointment_detail` | GET | Detalle (validado por token). |
| `cancelMyAppointment(name)` | `cancel_my_appointment` | POST + honeypot | Cancela validando ownership por token. |

Las tres ultimas requieren `X-User-Contact-Token` valido y son las recomendadas para uso desde el portal publico.

---

## 7. Diagrama de dependencias

```
FrappeApiService  <----- AuthService
       ^
       |
       +----- PortalService
       |
       +----- OtpService
       |
       +----- MeetSchedulingService

StateService  <----- AuthService
              <----- componentes (lectura signals)
```

`FrappeApiService` es el unico que toca HTTP. Los demas services lo inyectan y lo envuelven con logica de dominio.

---

## 8. Notas y deuda tecnica

- **`AuthService.checkAuthStatus()`** se invoca en el constructor (line 25-28), lo que dispara una request HTTP al cargar la app aunque la mayoria de portales no use Frappe auth. Considerar lazy.
- **Login Frappe** (`AuthService.login`) y `LoginComponent` son codigo no usado activamente. Si se decide eliminar, tambien borrar `auth.guard.ts`.
- **`getUserAppointments` (vs `getMyAppointments`)**: el primero pide permisos Frappe; el segundo usa token. Las tools usan `getMyAppointments`. El primero quedaria como helper admin.
- **`callApiGet` / `callApiPost`** son helpers privados duplicados en `PortalService` y `OtpService` con la misma logica. Se podria extraer a `FrappeApiService` o a una utilidad compartida.
- **Logs de debug** (`[Auth Debug]`) en `FrappeApiService` son ruidosos en consola.
- **`UserContactWithToken`** se exporta como alias en `portal.service.ts:20` para compatibilidad. Considerar deprecar o consolidar.
- **`fetchCsrfToken()`** retorna `string`, pero en caso de error retorna `''`. Los consumidores no chequean esto. Si el endpoint cae, el header CSRF iria vacio.
