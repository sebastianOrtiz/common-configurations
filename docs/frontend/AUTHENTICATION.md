# Autenticacion

El Service Portal usa un flujo de autenticacion propio basado en **User Contact** + **token** (no en cuentas Frappe). Soporta opcionalmente verificacion **OTP** (SMS / WhatsApp) y un modo **anonimo** para portales publicos.

---

## 1. Vision general

```
+---------------+    documento +
| Usuario llega |--- (login) ----> getUserContactByDocument()
| a /portal/X   |                          |
+---------------+                  +-------+--------+
        |                          |                |
        | nuevo                    | existente      | no encontrado
        v                          v                v
   formulario             [OTP requerido?]    "no encontrado"
   /register                 si       no        (sugerir registro)
        |                    |        |
        |              OTP step   set auth_token
        |  ---> backend valida y crea user contact
        |       o reusa el existente
        v
   set userContact + authToken en StateService
   + setUserContactToken en FrappeApiService
        |
        v
   redirect a /portal/X
```

Cada request HTTP subsiguiente lleva el header `X-User-Contact-Token: <token>` automaticamente (lo agrega `FrappeApiService.getAuthHeaders()`).

---

## 2. Tipos de usuario

| Tipo | `userContact.name` | Tiene `authToken`? | Persiste? |
|------|--------------------|--------------------|-----------|
| Autenticado | nombre del DocType User Contact | si | si (localStorage) |
| Anonimo | `'anonymous'` (constante `ANONYMOUS_USER_CONTACT`) | no | no (session only) |
| Sin login (admin Frappe) | (no aplica para portal publico) | - | - |

El usuario anonimo se establece automaticamente cuando el portal tiene `require_auth = false`. Ver `service-portal.model.ts:185-190`:

```typescript
export const ANONYMOUS_USER_CONTACT: UserContact = {
  name: 'anonymous',
  full_name: 'Invitado',
  document_type: '',
  document: 'anonymous',
};
```

Y `StateService.setAnonymousContact()`:

```typescript
// state.service.ts:184-187
setAnonymousContact(): void {
  this.userContactSignal.set(ANONYMOUS_USER_CONTACT);
  // No localStorage, no auth token
}
```

Cada tool debe chequear si el usuario es anonimo antes de cargar datos privados. Patron:

```typescript
ngOnInit(): void {
  if (this.isAnonymousUser()) return;
  this.loadMyData();
}
```

Y mostrar UI alternativa:

```html
@if (isAnonymousUser()) {
  <div class="auth-required-state">
    <h3>Acceso restringido</h3>
    <button (click)="goToRegistration()">Registrarse / Iniciar sesion</button>
  </div>
}
```

---

## 3. Componente de registro: `ContactRegistrationComponent`

Archivo: `src/app/features/portal/contact-registration/contact-registration.component.ts`

### Estados (steps)

```typescript
// contact-registration.component.ts:23
type RegistrationStep = 'initial' | 'login' | 'register' | 'otp';
```

- **`initial`**: pantalla de bienvenida con dos botones: "Ya tengo cuenta" -> `login`, "Soy nuevo" -> `register`.
- **`login`**: solo dos campos (tipo y numero de documento) -> `onConnect()`.
- **`register`**: formulario dinamico generado a partir de los campos del DocType User Contact (via `PortalService.getUserContactFields()`).
- **`otp`**: muestra `<app-otp-verification>` para ingresar el codigo.

### Carga dinamica del formulario

```typescript
// contact-registration.component.ts:85-110
protected loadFields(): void {
  this.portalService.getUserContactFields().subscribe({
    next: (fields) => {
      this.fields.set(fields);
      // Init form data con defaults
    },
    error: (err) => { ... }
  });
}
```

El backend (`common_configurations.api.contacts.get_user_contact_fields`) devuelve solo los campos visibles y editables de `User Contact`. El frontend los renderiza con un switch por `fieldtype` (`getInputType()` line 141-161).

### Flujo de login por documento

```typescript
// contact-registration.component.ts:254-305
onConnect(): void {
  // ... validar
  const document = this.formData()['document']?.toString().trim();

  this.portalService.getUserContactByDocument(document).subscribe({
    next: (contact) => {
      if (contact) {
        const portalRequiresMfa = portal?.enable_mfa_otp !== false;
        if (contact.requires_otp && contact.otp_settings && portalRequiresMfa) {
          // OTP step
          this.pendingOtpContact = contact;
          this.otpSettings.set(contact.otp_settings);
          this.otpDocument.set(document);
          this.currentStep.set('otp');
        } else if (contact.auth_token) {
          // OTP no requerido: login directo
          this.stateService.setUserContact(contact, contact.auth_token);
          this.router.navigate(['/portal', portal.portal_name]);
        }
      } else {
        // Sugerir registro
        this.error.set('No se encontro un usuario...');
      }
    }
  });
}
```

### Flujo de registro

```typescript
// contact-registration.component.ts:330-397
onSubmit(): void {
  // ... validar
  if (this.existingContact && this.existingContact.name) {
    // UPDATE de contacto existente
    this.portalService.updateUserContact(...).subscribe(...);
  } else {
    const portalWantsMfa = portal.require_auth && portal.enable_mfa_otp !== false;
    if (portalWantsMfa) {
      this.otpService.getOtpSettings().subscribe({
        next: (otpSettings) => {
          if (otpSettings.enabled) {
            // OTP step para registration
            this.otpMode.set('registration');
            this.currentStep.set('otp');
          } else {
            this.createUserDirectly(contactData, portal.portal_name);
          }
        }
      });
    } else {
      this.createUserDirectly(contactData, portal.portal_name);
    }
  }
}
```

### `createUserDirectly()`

```typescript
// contact-registration.component.ts:402-423
private createUserDirectly(contactData, portalName): void {
  this.portalService.createUserContact(contactData).subscribe({
    next: (contact) => {
      if (contact.auth_token) {
        this.stateService.setUserContact(contact, contact.auth_token);
        this.router.navigate(['/portal', portalName]);
      }
    }
  });
}
```

---

## 4. Componente OTP: `OtpVerificationComponent`

Archivo: `src/app/features/portal/contact-registration/otp-verification/otp-verification.component.ts`

### Inputs

| Input | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `document` (requerido) | `string` | - | Numero de documento del usuario |
| `otpSettings` | `OTPSettings \| null` | `null` | Settings publicos (canales, expiracion) |
| `phoneNumber` | `string?` | - | Telefono enmascarado (display) |
| `mode` | `'login' \| 'registration'` | `'login'` | Tipo de flujo |
| `formData` | `Record<string,any> \| null` | `null` | Solo para `registration`: datos del formulario |

### Outputs

| Output | Tipo | Cuando emite |
|--------|------|--------------|
| `verified` | `EventEmitter<string>` | Login OK: emite el `auth_token` |
| `registrationVerified` | `EventEmitter<RegistrationVerifiedResult>` | Registro OK: emite `{auth_token, user_contact}` |
| `cancelled` | `EventEmitter<void>` | El usuario cancela. En `registration` ademas llama a `cancelRegistration` en backend. |

### Steps internos

```typescript
// otp-verification.component.ts:46
currentStep = signal<'channel-select' | 'code-input'>('channel-select');
```

- **`channel-select`**: el usuario elige SMS o WhatsApp. Si solo uno esta disponible, se autoselecciona y se salta al siguiente paso.
- **`code-input`**: input numerico para el codigo, con cooldown de reenvio (60 segundos).

### Cooldown de reenvio

```typescript
// otp-verification.component.ts:235-251
private startResendCooldown(): void {
  this.resendCooldown.set(60);
  this.cooldownInterval = setInterval(() => {
    const current = this.resendCooldown();
    if (current > 0) {
      this.resendCooldown.set(current - 1);
    } else {
      clearInterval(this.cooldownInterval);
    }
  }, 1000);
}
```

### APIs usadas

| Metodo | Endpoint backend | Mode |
|--------|------------------|------|
| `OtpService.requestOtp(doc, channel)` | `common_configurations.api.otp.request_otp` | login |
| `OtpService.verifyOtp(doc, code)` | `common_configurations.api.otp.verify_otp` | login |
| `OtpService.requestRegistrationOtp(formData, channel)` | `request_registration_otp` | registration |
| `OtpService.verifyRegistrationOtp(phone, code)` | `verify_registration_otp` | registration |
| `OtpService.resendRegistrationOtp(phone, channel?)` | `resend_registration_otp` | registration |
| `OtpService.cancelRegistration(phone)` | `cancel_registration` | registration |

---

## 5. Token storage

| Clave localStorage | Donde se setea | Donde se lee |
|--------------------|----------------|--------------|
| `sp_auth_token` | `FrappeApiService.setUserContactToken()` (line 503-510) y `StateService.setAuthToken()` (line 192-200) | `FrappeApiService.loadConfig()` (line 69-75), `StateService.loadPersistedState()` (line 314-317) |
| `sp_user_contact` | `StateService.setUserContact()` | `StateService.loadPersistedState()` |
| `sp_selected_portal` | `StateService.setSelectedPortal()` | idem |
| `sp_referrer_portal` | `StateService.setReferrerPortal()` | idem |
| `sp_current_user` | `StateService.setCurrentUser()` | idem (Frappe user) |
| `frappe_api_token` | `FrappeApiService.setApiToken()` | `FrappeApiService.loadConfig()` |

> **Importante**: hay redundancia historica. `StateService` y `FrappeApiService` ambos persisten `sp_auth_token`. Cuando se setea via `StateService.setUserContact(contact, token)`, **NO** se llama a `FrappeApiService.setUserContactToken()`. Ver punto 8 (deuda tecnica).

---

## 6. Inyeccion del token en requests

`FrappeApiService.getAuthHeaders()` agrega el header automaticamente:

```typescript
// frappe-api.service.ts:97-103
if (this.config.userContactToken) {
  headers = headers.set(USER_CONTACT_AUTH_HEADER, this.config.userContactToken);
  console.log('[Auth Debug] Sending User Contact token:', this.config.userContactToken.substring(0, 20) + '...');
}
```

El backend `common_configurations.api.shared.security.get_current_user_contact()` valida el token y devuelve el contacto.

---

## 7. Logout

`PortalLayoutComponent.exitPortal()` (line 65-82):

```typescript
exitPortal(): void {
  const currentPortal = this.portal();
  if (!currentPortal) return;

  const referrer = this.referrerPortal();
  this.stateService.clearUserContact();

  if (referrer) {
    this.stateService.clearReferrerPortal();
    this.router.navigate(['/portal', referrer]);
  } else {
    // Trick: navegar fuera y volver para forzar reload
    this.router.navigate(['/portals']).then(() => {
      this.router.navigate(['/portal', currentPortal.portal_name]);
    });
  }
}
```

Esto solo limpia el state local. **Para invalidar el token en backend** se debe usar `PortalService.logoutUserContact()`, que llama a `common_configurations.api.auth.logout_user_contact`. Actualmente `exitPortal` no lo usa (ver deuda tecnica).

`PortalService.logoutUserContact()` (`portal.service.ts:114-123`):

```typescript
logoutUserContact(): Observable<{ success: boolean }> {
  return this.callApiPost<{ success: boolean }>(`${API_AUTH}.logout_user_contact`, {
    honeypot: ''
  }).pipe(
    tap(() => this.frappeApi.clearUserContactToken())
  );
}
```

---

## 8. Manejo de sesion expirada (401)

`FrappeApiService.handleError()` extrae el mensaje de error pero **no hay logica especifica para 401**. Si el token expira:

1. El backend responde 401 con `_server_messages`.
2. `handleError()` parsea el mensaje y lo emite con `throwError(...)`.
3. La tool muestra el error en su `error.set(err.message)`.
4. El usuario debe volver a `/portal/X/register` manualmente.

**No hay interceptor HTTP** que detecte 401 y haga logout automatico. Esto es deuda tecnica.

---

## 9. Estados de autenticacion en componentes

Patron de signals expuestos en cada tool:

```typescript
// ej: my-appointments-tool.component.ts:36-39
protected currentUser     = this.stateService.currentUser;       // Signal<User | null>
protected userContact     = this.stateService.userContact;       // Signal<UserContact | null>
protected selectedPortal  = this.stateService.selectedPortal;    // Signal<ServicePortal | null>
protected isAnonymousUser = this.stateService.isAnonymousUser;   // Signal<boolean>
```

En templates:

```html
@if (isAnonymousUser()) {
  <!-- Pedir registro -->
} @else if (userContact()) {
  <!-- Mostrar datos del usuario -->
}
```

---

## 10. Diagramas de secuencia

### Login con OTP

```
Usuario       ContactReg     PortalSvc      OtpComp       OtpSvc        Backend
  |               |              |              |             |             |
  |--documento->|              |              |             |             |
  |               |--getUserContactByDocument->|             |             |
  |               |              |---------------------------------------->|
  |               |              |<--{requires_otp:true, otp_settings}-----|
  |               |--currentStep('otp')        |             |             |
  |               |--render <app-otp-verification>           |             |
  |               |              |              |--requestOtp(doc, sms)-->|
  |               |              |              |             |-------->|backend
  |               |              |              |             |<--ok----|
  |--codigo----->|              |              |             |             |
  |               |              |              |--verifyOtp(doc, code)-->|
  |               |              |              |             |---------->|
  |               |              |              |             |<--token---|
  |               |              |              |<--verified(token)-------|
  |               |<--onOtpVerified(token)------|             |             |
  |               |--setUserContact(...)                       |             |
  |               |--navigate(/portal/X)                       |             |
```

### Registro nuevo con OTP

Similar al anterior pero con `requestRegistrationOtp(formData, channel)` y `verifyRegistrationOtp(phone, code)` que tambien crea el User Contact en backend.

---

## 11. Notas y deuda tecnica

- **Logout no revoca el token en backend**: `exitPortal()` solo limpia state. Deberia llamar `PortalService.logoutUserContact()` para invalidar el token server-side.
- **No hay interceptor 401**: si el token expira, no se redirige automaticamente al registro.
- **`sp_auth_token` se persiste desde dos lugares** (`StateService` y `FrappeApiService`). La logica de "guardar el token" esta fragmentada. Idealmente `StateService.setAuthToken()` deberia delegar a `FrappeApiService.setUserContactToken()` o viceversa, no haber dos caminos.
- **OTP en login asume que `getUserContactByDocument` ya devuelve `otp_settings`**: si el backend cambia el contrato, el flujo de OTP se rompe sin error visible.
- **Login Frappe (`AuthService`) es codigo muerto**: el `LoginComponent` no es alcanzable (ruta `/login` redirige). Si se decide eliminar, tambien borrar `auth.guard.ts`.
- **`enable_mfa_otp`** en el portal puede deshabilitar OTP por portal. Si el portal tiene `enable_mfa_otp: false`, se hace login directo aunque el global lo requiera. La logica esta en `contact-registration.component.ts:279, 370`.
- **`pendingOtpContact`**: variable privada que guarda el contact mientras se hace OTP. Tener este estado en una propiedad mutable (no signal) puede causar inconsistencias si el componente se reusa. Considerar moverlo a signal.
- **El backend espera `phone_number` para registration OTP** (en `formData['phone_number']`). Si el campo no esta en el form, el flujo falla silenciosamente.
