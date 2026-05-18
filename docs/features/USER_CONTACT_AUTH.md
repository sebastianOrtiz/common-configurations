# Feature: Autenticación de User Contact por Token

Sistema completo de autenticación basado en tokens para usuarios públicos (User Contacts) que interactúan con el Service Portal. Permite acceso seguro sin crear cuentas de Frappe (no consume licencias de usuario, no tiene acceso al desk).

---

## Visión general

Los **User Contacts** son usuarios "guest" que se identifican por su número de documento. Tras un registro o login exitoso, reciben un **token aleatorio de 64 caracteres hex** (256 bits de entropía) que deben enviar en cada request en el header `X-User-Contact-Token`.

El backend **NO almacena el token en claro**; solo guarda su hash SHA-256 en el campo `auth_token_hash` (con `permlevel: 1`).

---

## Flujo completo

### Diagrama

```
┌─────────────┐                                ┌──────────────┐
│  Frontend   │                                │   Backend    │
│  (Angular)  │                                │   (Frappe)   │
└──────┬──────┘                                └──────┬───────┘
       │                                              │
       │ 1) GET get_csrf_token                        │
       │─────────────────────────────────────────────>│
       │<──────────── { message: "csrf-xxx" } ───────│
       │                                              │
       │ 2) POST create_user_contact / login          │
       │    Body: { data: {...}, honeypot: "" }       │
       │    Headers: X-Frappe-CSRF-Token: csrf-xxx    │
       │─────────────────────────────────────────────>│
       │                                              │
       │      (sin OTP)                               │
       │<──── { ..., auth_token: "7c2b..." } ────────│
       │                                              │
       │   localStorage.setItem('token', '7c2b...')   │
       │                                              │
       │ 3) Cualquier endpoint protegido              │
       │    Headers: X-User-Contact-Token: 7c2b...    │
       │─────────────────────────────────────────────>│
       │                                              │
       │  Decorador @require_user_contact():          │
       │  - Lee header                                │
       │  - hash_token(input) == auth_token_hash?     │
       │  - now - token_created_at < 30 días?         │
       │  - frappe.local.user_contact = "USER-1"      │
       │                                              │
       │<───────── { ...resultado del endpoint... } ──│
       │                                              │
       │ 4) POST logout_user_contact                  │
       │    Headers: X-User-Contact-Token: 7c2b...    │
       │─────────────────────────────────────────────>│
       │       Limpia auth_token_hash = NULL          │
       │<──── { success: true } ──────────────────────│
```

---

## Componentes técnicos

### 1) Generación de token

`api/shared/security.py:62-71`:

```python
TOKEN_LENGTH = 32                       # 256 bits

def generate_auth_token() -> str:
    return secrets.token_hex(TOKEN_LENGTH)   # 64 chars hex
```

`secrets.token_hex()` usa la fuente de aleatoriedad criptográfica del sistema operativo. **No usar `random.choice()`**: no es criptográficamente seguro.

### 2) Almacenamiento del hash

`api/shared/security.py:74-86`:

```python
def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
```

SHA-256 es apropiado para tokens **de alta entropía** (los nuestros tienen 256 bits). No se necesita bcrypt/argon2 porque la entropía del token ya es suficientemente alta y el costo computacional de bcrypt sería prohibitivo en endpoints de alta frecuencia.

### 3) Persistencia

`create_user_contact_token(user_contact_name)` (security.py:113-140):

```python
def create_user_contact_token(user_contact_name: str) -> str:
    token = generate_auth_token()
    token_hash = hash_token(token)

    frappe.db.set_value(
        "User contact",
        user_contact_name,
        {"auth_token_hash": token_hash, "token_created_at": now_datetime()},
        update_modified=False,
    )

    return token   # Solo el token CLARO se devuelve al cliente
```

> Notar `update_modified=False` para no cambiar la fecha de modificación del doc en cada login.

### 4) Validación

`get_current_user_contact()` (security.py:167-215):

```python
def get_current_user_contact() -> Optional[str]:
    token = get_token_from_request()
    if not token:
        return None

    token_hash = hash_token(token)
    user_contact = frappe.db.get_value(
        "User contact",
        {"auth_token_hash": token_hash},
        ["name", "token_created_at"],
        as_dict=True,
    )

    if not user_contact:
        return None

    # Verificar expiración
    if user_contact.token_created_at:
        age = get_datetime(now_datetime()) - get_datetime(user_contact.token_created_at)
        if age.days > TOKEN_EXPIRY_DAYS:    # 30 días
            # Limpia automáticamente
            frappe.db.set_value("User contact", user_contact.name,
                {"auth_token_hash": None, "token_created_at": None},
                update_modified=False)
            return None

    return user_contact.name
```

### 5) Decorador

`require_user_contact()` (security.py:223-264):

```python
def require_user_contact(allow_guest: bool = False):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_contact = get_current_user_contact()

            if not user_contact and not allow_guest:
                frappe.throw(
                    _("Authentication required. Please register or login first."),
                    frappe.AuthenticationError,
                )

            frappe.local.user_contact = user_contact
            return func(*args, **kwargs)

        return wrapper
    return decorator
```

Uso:

```python
@frappe.whitelist(allow_guest=True)
@require_user_contact()
def get_my_data():
    user_contact = frappe.local.user_contact  # "USER-1"
    return {"appointments": frappe.get_all("Appointment", filters={"user_contact": user_contact})}
```

### 6) Validación de ownership

Para asegurar que un usuario solo pueda acceder a sus propios recursos:

```python
@frappe.whitelist(allow_guest=True)
@require_user_contact()
def cancel_appointment(name):
    user_contact = frappe.local.user_contact
    validate_user_contact_ownership(user_contact, "Appointment", name)
    # Solo llega aquí si Appointment.user_contact == "USER-1"
    ...
```

`validate_user_contact_ownership` (security.py:272-303):

```python
def validate_user_contact_ownership(
    user_contact: str, resource_type: str, resource_name: str
) -> bool:
    if not user_contact:
        return False

    owner_contact = frappe.db.get_value(resource_type, resource_name, "user_contact")

    if owner_contact != user_contact:
        frappe.throw(
            _("You don't have permission to access this resource."),
            frappe.PermissionError,
        )

    return True
```

Para que funcione, el DocType del recurso (ej. `Appointment`) debe tener un campo `user_contact` Link → `User contact`.

---

## Cómo el frontend usa el sistema

### Storage del token (Angular)

`front_apps/service-portal/src/app/core/services/frappe-api.service.ts`:

```typescript
export const USER_CONTACT_AUTH_HEADER = 'X-User-Contact-Token';

interface FrappeConfig {
  authorizationMode: 'api-token' | 'csrf-token';
  token?: string;
  userContactToken?: string;  // Token de User Contact
}
```

El token se persiste en `localStorage` tras un login exitoso. El servicio lo inyecta en cada request HTTP.

### Reading current user

`auth.service.ts` llama a `get_authenticated_user_contact()` al cargar la app. Si devuelve `null`, redirige al flujo de registro/login.

### Logout

```typescript
// Llama al endpoint para invalidar en backend
this.api.post('common_configurations.api.auth.logout_user_contact', { honeypot: '' }).subscribe();

// Limpia localStorage
localStorage.removeItem('userContactToken');
```

---

## Expiración y rotación

- **Vida útil:** 30 días desde `token_created_at` (constante `TOKEN_EXPIRY_DAYS`).
- **Tokens activos por usuario:** Solo 1 (al generar uno nuevo se sobrescribe el anterior).
- **Auto-limpieza al expirar:** `get_current_user_contact()` detecta expiración y limpia los campos automáticamente.
- **Logout manual:** llama a `AuthService.logout()` que pone `auth_token_hash` y `token_created_at` a `NULL`.

---

## Seguridad

### Protecciones implementadas

1. **Hash en almacenamiento** — Solo SHA-256 hex en DB, nunca el token en claro.
2. **Constant-time comparison** — `secrets.compare_digest()` previene timing attacks.
3. **High entropy** — 256 bits de aleatoriedad, criptográficamente seguros.
4. **Permlevel 1** — Los campos `auth_token_hash` y `token_created_at` solo son visibles para System Manager con permlevel 1.
5. **Auto-expiración** — Tokens > 30 días se invalidan automáticamente.
6. **Honeypot + rate limit** — Todos los endpoints públicos están protegidos.
7. **HTTPS** — En producción, el token viaja por TLS.

### Limitaciones / no implementado

- **No hay revocación masiva** — No existe un mecanismo para invalidar todos los tokens de todos los usuarios de golpe (sería trivial: `UPDATE tabUser_contact SET auth_token_hash=NULL`).
- **No hay refresh tokens** — Tras los 30 días, el usuario debe volver a hacer "login" por documento (o por OTP si está habilitado).
- **No hay device binding** — Un token funciona desde cualquier IP/User-Agent.
- **No hay scope/permissions por token** — Todos los tokens tienen el mismo poder.

---

## Integración con OTP (MFA)

Cuando el portal tiene `require_auth = 1` y `enable_mfa_otp = 1` Y `OTP Settings.enable_otp_verification = 1`:

1. `create_user_contact` / `get_user_contact_by_document` **NO devuelven `auth_token`**, devuelven `requires_otp: true` con la config OTP.
2. El frontend redirige a la UI de OTP.
3. El usuario recibe el código por SMS y lo envía a `verify_otp`.
4. Solo si el OTP es válido, se ejecuta `create_user_contact_token()` y se devuelve el token.

> Ver [../api/OTP.md](../api/OTP.md) para el detalle del flujo.

---

## Uso desde otras apps

Ejemplo en `meet_scheduling`:

```python
# meet_scheduling/api/appointments/endpoints.py
import frappe
from common_configurations.api.shared import (
    check_rate_limit,
    require_user_contact,
    validate_user_contact_ownership,
)

@frappe.whitelist(allow_guest=True, methods=["GET"])
@require_user_contact()
def get_my_appointments():
    check_rate_limit("get_my_appointments", limit=30, seconds=60)
    user_contact = frappe.local.user_contact

    return frappe.get_all(
        "Appointment",
        filters={"user_contact": user_contact},
        fields=["name", "start_datetime", "end_datetime", "status"],
    )


@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_user_contact()
def cancel_my_appointment(name):
    check_rate_limit("cancel_appointment", limit=10, seconds=60)
    user_contact = frappe.local.user_contact
    validate_user_contact_ownership(user_contact, "Appointment", name)

    doc = frappe.get_doc("Appointment", name)
    doc.status = "Cancelled"
    doc.save(ignore_permissions=True)
    return {"success": True}
```

---

## Referencias cruzadas

- [../doctypes/USER_CONTACT.md](../doctypes/USER_CONTACT.md) — Campos del DocType.
- [../api/AUTH.md](../api/AUTH.md) — Endpoints HTTP.
- [../api/CONTACTS.md](../api/CONTACTS.md) — Registro y login.
- [../api/OTP.md](../api/OTP.md) — MFA por SMS.
- [../api/SHARED.md](../api/SHARED.md) — `security.py` detallado.
- `common_configurations/api/shared/security.py` — Código fuente.
