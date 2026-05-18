# API: Shared (utilidades compartidas)

Módulo de utilidades reutilizables por todos los dominios de la API y por otras apps del bench.

**Base path:** `common_configurations.api.shared`
**Ruta:** `common_configurations/api/shared/`

```
shared/
├── __init__.py          # Re-exporta todo
├── security.py          # Tokens, honeypot, decorators, ownership
├── rate_limit.py        # Rate limiting por IP
├── validators.py        # Sanitización y validadores genéricos
├── api_key.py           # Middleware de API Key
├── email.py             # Helper de envío de emails
└── exceptions.py        # Excepciones custom
```

---

## Importación recomendada

Cualquier app puede importar utilidades desde el package raíz:

```python
from common_configurations.api.shared import (
    # Rate limiting
    check_rate_limit, get_client_ip,
    # Security (User Contact tokens)
    check_honeypot,
    create_user_contact_token, get_current_user_contact,
    require_user_contact, validate_user_contact_ownership,
    AUTH_HEADER, TOKEN_EXPIRY_DAYS,
    generate_auth_token, hash_token, verify_token,
    get_token_from_request,
    # API Key
    authenticate_api_key, require_api_key,
    get_api_key_from_request, get_api_service_from_key,
    API_KEY_HEADER,
    # Validators
    sanitize_string,
    validate_document_number, validate_email, validate_phone, validate_name,
    # Email
    has_outgoing_email, send_email,
    # Exceptions
    APIError, ValidationError, NotFoundError,
    AuthenticationError, PermissionError, RateLimitError,
)
```

---

## `security.py` — Autenticación de User Contact

### Constantes

```python
TOKEN_LENGTH = 32              # 256 bits de entropía (token_hex(32) = 64 chars)
TOKEN_EXPIRY_DAYS = 30         # Tokens válidos por 30 días
AUTH_HEADER = "X-User-Contact-Token"
```

### `check_honeypot(honeypot_value: str = None) -> None`

Detecta bots por campo trampa. Si llega lleno, lo loguea en `Error Log` con el IP y lanza `ValidationError` genérica ("Invalid request") para no revelar la detección.

```python
def check_honeypot(honeypot_value: str = None) -> None:
    if honeypot_value:
        ip = get_client_ip()
        frappe.log_error(
            title=_("Bot Detected (Honeypot)"),
            message=f"IP: {ip}, Honeypot value: {honeypot_value[:100]}",
        )
        frappe.throw(_("Invalid request"), frappe.ValidationError)
```

### `generate_auth_token() -> str`

Genera token aleatorio criptográficamente seguro. Usa `secrets.token_hex(32)` = 64 chars hex.

### `hash_token(token: str) -> str`

Hash SHA-256 hex. Es una hash one-way para almacenamiento.

### `verify_token(token: str, token_hash: str) -> bool`

Compara con `secrets.compare_digest()` (constante en tiempo, previene timing attacks).

### `create_user_contact_token(user_contact_name: str) -> str`

Genera un nuevo token, hashea, guarda el hash en `User contact.auth_token_hash` + `token_created_at` y **devuelve el token en claro**. Invalida cualquier token anterior (solo un token activo por usuario).

> El caller debe hacer `frappe.db.commit()` después.

### `get_token_from_request() -> Optional[str]`

Busca el token en:

1. Header `X-User-Contact-Token` (preferido)
2. Query param `?user_contact_token=...` (fallback para GET)

### `get_current_user_contact() -> Optional[str]`

Devuelve el `name` del User Contact autenticado o `None`. Pasos:

1. Extrae el token del request.
2. Hashea el input.
3. Busca un User Contact con ese `auth_token_hash`.
4. Verifica expiración: si `now - token_created_at > 30 días`, limpia el hash y devuelve `None`.
5. Si todo OK, devuelve el `name`.

### `require_user_contact(allow_guest: bool = False)`

Decorador para endpoints que exigen autenticación. Almacena el `user_contact` en `frappe.local.user_contact` para uso dentro de la función.

```python
@frappe.whitelist(allow_guest=True)
@require_user_contact()
def my_endpoint():
    user_contact = frappe.local.user_contact  # ej. "USER-1"
    ...
```

Si no hay token y `allow_guest=False`, lanza `frappe.AuthenticationError`.

### `validate_user_contact_ownership(user_contact, resource_type, resource_name) -> bool`

Verifica que un User Contact sea dueño de un recurso (el recurso debe tener un campo `user_contact`). Lanza `frappe.PermissionError` si no coincide.

```python
# Verificar que el appointment APT-001 sea del usuario USER-1
validate_user_contact_ownership("USER-1", "Appointment", "APT-001")
```

---

## `rate_limit.py` — Rate limiting por IP

### `get_client_ip() -> str`

Detecta el IP real del cliente leyendo en orden:

1. Header `X-Forwarded-For` (primer IP si hay múltiples, casos detrás de proxy)
2. Header `X-Real-IP`
3. `frappe.request.remote_addr`

Fallback: `"unknown"`.

### `check_rate_limit(action: str, limit: int = 10, seconds: int = 60) -> None`

Rate limit por (acción, IP). Usa la cache de Frappe (Redis) con clave `rate_limit:<action>:<ip>`.

```python
check_rate_limit("create_contact", limit=20, seconds=60)
# Permite 20 requests por minuto por IP para la acción "create_contact"
```

Si se excede, lanza `frappe.TooManyRequestsError`.

---

## `validators.py` — Validación y sanitización

### `sanitize_string(value: str, max_length: int = 500) -> Optional[str]`

Sanitización genérica:

1. Strip de whitespace
2. **Normalización Unicode NFC** (precomposed). Evita mismatches con caracteres acentuados (ej. `é` como `e` + acento combinante).
3. Truncado a `max_length`
4. Elimina bytes nulos y caracteres de control con regex `[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]`

Devuelve `None` si el input está vacío.

### `validate_document_number(document: str, document_type: str = None) -> str`

Reglas:

- Obligatorio
- Longitud 4-20 chars
- Solo `[a-zA-Z0-9\-]`

### `validate_email(email: str) -> Optional[str]`

- Acepta vacío (devuelve `None`)
- Regex: `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
- Máximo 254 chars
- Convierte a lowercase

### `validate_phone(phone: str) -> Optional[str]`

- Acepta vacío (devuelve `None`)
- Permite formato internacional con `+` opcional
- Separadores permitidos: espacios, guiones, paréntesis, puntos
- Después de limpiar: 7-15 dígitos
- **Devuelve el teléfono ORIGINAL** (preservando formato), no la versión limpia

### `validate_name(name: str, field_label: str = "Name") -> str`

- Obligatorio
- Longitud 2-140 chars
- Bloquea patrones sospechosos (case-insensitive):

  ```
  <script, javascript:, onclick, onerror,
  SELECT, INSERT, UPDATE, DELETE, DROP, UNION,
  --, ;
  ```

### `validate_datetime(value: str) -> str`

Valida formato datetime usando `frappe.utils.get_datetime()`.

### `validate_date(value: str) -> str`

Valida regex `^\d{4}-\d{2}-\d{2}$`.

---

## `api_key.py` — Autenticación por API Key

### Constante

```python
API_KEY_HEADER = "X-API-Key"
```

### `get_api_key_from_request() -> Optional[str]`

Busca la key en:

1. Header `X-API-Key`
2. Query param `?api_key=...` (fallback para GET)

### `get_api_service_from_key(api_key: str) -> Optional[Dict[str, Any]]`

Busca primero en `API Service Key` (con `is_active=1`), luego verifica que el padre `API Service` esté activo. Devuelve:

```python
{
    "service_name": "APIS-2026-00001",
    "service_title": "WhatsApp Chatbot",
    "key_name": "Production",
    "rate_limit": 60,
}
```

### `authenticate_api_key() -> Dict[str, Any]`

Pipeline completo:

1. Lee la key del request.
2. La valida con `get_api_service_from_key`.
3. Aplica rate limit `api_service:<service_name>` con `limit=rate_limit, seconds=60`.

Lanza `AuthenticationError` si la key no existe o está inactiva.

### `require_api_key(endpoint_field: str = None)`

Decorador. Si se pasa `endpoint_field`, verifica que el `API Service` tenga ese Check en `1`. Almacena `frappe.local.api_service` con la info del servicio para uso dentro de la función.

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
@require_api_key("enable_lookup_contact")
def lookup_contact(document):
    service = frappe.local.api_service
    print(service["service_title"])  # "WhatsApp Chatbot"
    ...
```

Si `enable_lookup_contact = 0` → `frappe.PermissionError` con "This endpoint is not enabled for your API service."

---

## `email.py` — Helper de envío

### `has_outgoing_email() -> bool`

`True` si hay al menos un `Email Account` con `enable_outgoing = 1`.

### `send_email(recipients, subject, template=None, args=None, message=None, reference_doctype=None, reference_name=None, log_title="Email Send Failed") -> bool`

Wrapper sobre `frappe.sendmail` con:

- Skip silencioso si no hay outgoing email configurado (loggea warning)
- Normaliza `recipients` (acepta string o list)
- Acepta `template` (Frappe email template name) **o** `message` (HTML)
- Captura excepciones y las loguea con `log_title`

```python
from common_configurations.api.shared import send_email

send_email(
    recipients="user@example.com",
    subject="Cita confirmada",
    template="appointment_confirmation",
    args={"appointment": apt_doc.as_dict()},
    reference_doctype="Appointment",
    reference_name=apt_doc.name,
)
```

---

## `exceptions.py` — Excepciones tipadas

Clases que mapean a status HTTP y a excepciones Frappe:

| Clase | `status_code` | `frappe_exception` | Mensaje por defecto |
|-------|---------------|---------------------|---------------------|
| `APIError` | 400 | `frappe.ValidationError` | "Error en la solicitud" |
| `ValidationError` | 400 | `frappe.ValidationError` | "Datos inválidos" |
| `NotFoundError` | 404 | `frappe.DoesNotExistError` | "Recurso no encontrado" |
| `AuthenticationError` | 401 | `frappe.AuthenticationError` | "Autenticación requerida" |
| `PermissionError` | 403 | `frappe.PermissionError` | "No tienes permiso para realizar esta acción" |
| `RateLimitError` | 429 | `frappe.TooManyRequestsError` | "Demasiadas solicitudes. Por favor espera un momento." |
| `ConflictError` | 409 | `frappe.ValidationError` | "Conflicto con el estado actual" |

Uso:

```python
from common_configurations.api.shared import NotFoundError

err = NotFoundError("El contacto no existe")
err.throw()  # equivale a frappe.throw(_(message), frappe.DoesNotExistError)
```

> En la práctica el código usa directamente `frappe.throw(_("..."), frappe.ValidationError)`. Estas clases están disponibles para apps que prefieran un wrapper semántico.

---

## Referencias cruzadas

- [CONTACTS.md](CONTACTS.md) — Usa `check_honeypot`, `check_rate_limit`, validators.
- [AUTH.md](AUTH.md) — Usa `get_current_user_contact`.
- [EXTERNAL.md](EXTERNAL.md) — Usa `require_api_key`.
- [../features/USER_CONTACT_AUTH.md](../features/USER_CONTACT_AUTH.md) — Flujo completo de tokens.
- [../features/API_KEY_SYSTEM.md](../features/API_KEY_SYSTEM.md) — Flujo de API Key.
