# API: OTP

Endpoints HTTP para verificación por **One-Time Password vía SMS**. Cubren dos flujos:

1. **OTP de usuario existente** (login con MFA)
2. **OTP de registro** (verificación de teléfono durante el registro inicial)

**Base path:** `common_configurations.api.otp.*`
**Archivo:** `common_configurations/api/otp/endpoints.py`

---

## Resumen

| Endpoint | Método | Auth | Rate limit | Flujo |
|----------|--------|------|------------|-------|
| `get_otp_settings` | GET | Guest | 60 req/min | Lectura config pública |
| `is_otp_enabled` | GET | Guest | 60 req/min | Check rápido |
| `request_otp` | POST | Guest | 10 req/min | Usuario existente |
| `verify_otp` | POST | Guest | 20 req/min | Usuario existente |
| `request_registration_otp` | POST | Guest | 10 req/min | Registro |
| `verify_registration_otp` | POST | Guest | 20 req/min | Registro |
| `resend_registration_otp` | POST | Guest | 5 req/min | Registro |
| `cancel_registration` | POST | Guest | (sin RL explícito) | Registro |

---

## 1. `get_otp_settings`

Devuelve la configuración pública de OTP para que el frontend ajuste su UI (longitud del código, tiempo de expiración para el contador).

### Respuesta si OTP habilitado

```json
{
  "enabled": true,
  "otp_length": 6,
  "otp_expiry_minutes": 5,
  "sms_provider": "Infobip Producción"
}
```

### Respuesta si OTP deshabilitado

```json
{ "enabled": false }
```

### Ejemplo

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.otp.get_otp_settings"
```

---

## 2. `is_otp_enabled`

Check binario más simple.

### Respuesta

```json
{ "enabled": true }
```

---

## 3. `request_otp` — OTP para usuario existente

Genera un OTP, lo envía por SMS y guarda el hash en el `User contact`.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_otp(document: str, honeypot: str = None) -> dict:
    check_honeypot(honeypot)
    check_rate_limit("request_otp", limit=10, seconds=60)
    document = sanitize_string(document)
    ...
    return OTPService.request_otp(document)
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `document` | string | Sí | Número de documento del User contact |
| `honeypot` | string | No | Debe llegar vacío |

### Reglas aplicadas internamente

1. **Lockout check**: si `otp_locked_until > now`, devuelve error con minutos restantes.
2. **Rate limit por usuario**: si `otp_requests_count >= max_otp_requests_per_hour` (default 3) → error.
3. **OTP generado**: dígitos aleatorios con `secrets.choice("0123456789")`.
4. **Hash SHA-256**: solo el hash se guarda en `otp_hash` del User contact.
5. **Formato E.164**: el teléfono se formatea con código país `+57` (Colombia) si no lo tiene.
6. **Envío**: vía `get_sms_client().send_sms(phone, otp)` (Infobip por defecto).

### Respuesta

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "phone": "+57***34567",
  "expiry_minutes": 5
}
```

El teléfono se enmascara: `phone[:3] + '*' * (len - 5) + phone[-2:]`.

### Errores comunes

| Caso | Mensaje |
|------|---------|
| OTP deshabilitado | OTP verification is not enabled |
| Usuario no encontrado | User not found |
| Usuario sin teléfono | Phone number is required for OTP verification |
| Cuenta bloqueada | Account is temporarily locked. Please try again in N minutes. |
| Rate limit excedido | Too many OTP requests. Please try again in N minutes. |

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.otp.request_otp" \
  -H "Content-Type: application/json" \
  -d '{"document": "12345678", "honeypot": ""}'
```

---

## 4. `verify_otp` — Verificación y emisión de token

Verifica el código OTP y, si es válido, **genera un auth token** (igual que un login completo).

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_otp(document: str, otp_code: str, honeypot: str = None) -> dict:
    check_honeypot(honeypot)
    check_rate_limit("verify_otp", limit=20, seconds=60)
    ...
    otp_code = otp_code.replace(" ", "").replace("-", "")
    return OTPService.verify_otp(document, otp_code)
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `document` | string | Sí | |
| `otp_code` | string | Sí | El código (espacios y guiones se eliminan automáticamente) |
| `honeypot` | string | No | Debe llegar vacío |

### Reglas aplicadas

1. **Lockout check**.
2. **Existencia de OTP**: el doc debe tener `otp_hash` y `otp_created_at`.
3. **Expiración**: `now > otp_created_at + otp_expiry_minutes` → OTP expirado, se limpia.
4. **Comparación de hashes**: SHA-256 del input vs `otp_hash` almacenado.
5. **Si falla**: incrementa `otp_attempts`. Al llegar a `max_verification_attempts` (default 5), se bloquea por `lockout_duration_minutes` (default 30).
6. **Si pasa**: genera auth token con `create_user_contact_token()`, limpia `otp_hash` y `otp_created_at`.

### Respuesta exitosa

```json
{
  "success": true,
  "auth_token": "7c2b3a... (64 chars hex)",
  "user_contact": "USER-1"
}
```

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.otp.verify_otp" \
  -H "Content-Type: application/json" \
  -d '{"document": "12345678", "otp_code": "473921", "honeypot": ""}'
```

---

## 5. `request_registration_otp` — OTP de registro

Inicia el flujo de registro: **no crea aún el `User contact`**, sino que guarda los datos del formulario en cache (Redis) y envía OTP para verificar el teléfono.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_registration_otp(data: str, honeypot: str = None) -> dict:
    ...
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `data` | string (JSON) | Sí | Datos completos del formulario de registro |
| `honeypot` | string | No | Debe llegar vacío |

`data` debe incluir mínimo: `phone_number`, `document`. El resto de campos se validarán al crear el contacto definitivamente.

### Reglas aplicadas

1. **OTP debe estar habilitado**.
2. **Documento no debe existir**: si ya existe un `User contact` con ese documento, lanza error.
3. **Rate limit**: por teléfono (3 req/h via cache key `pending_reg_rate:<phone>`).
4. **Cache**: los datos se guardan en `frappe.cache().set_value(f"pending_registration:<phone>", {form_data, otp_hash, attempts, created_at}, expires_in_sec=otp_expiry_minutes*60)`.

### Respuesta

```json
{
  "success": true,
  "message": "Verification code sent",
  "phone": "+57***34567",
  "expiry_minutes": 5
}
```

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.otp.request_registration_otp" \
  -H "Content-Type: application/json" \
  -d '{
    "data": "{\"full_name\":\"Ana Gómez\",\"document\":\"87654321\",\"document_type\":\"cc\",\"phone_number\":\"+573009876543\",\"email\":\"ana@example.com\"}",
    "honeypot": ""
  }'
```

---

## 6. `verify_registration_otp`

Verifica el OTP de registro y, si es válido, **crea el User contact** con los datos cacheados y genera el auth token.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_registration_otp(phone_number: str, otp_code: str, honeypot: str = None) -> dict:
    ...
```

### Parámetros

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `phone_number` | string | Sí |
| `otp_code` | string | Sí |
| `honeypot` | string | No |

### Reglas

1. Busca datos pendientes en `cache:pending_registration:<phone>`. Si no existen → "expired/not found".
2. Si `attempts >= max_attempts` → elimina y rechaza.
3. Verifica hash. Si falla, incrementa `attempts` y reescribe el cache.
4. Si pasa: `ContactService.create(form_data)` + `create_user_contact_token(name)` + limpia cache.

### Respuesta exitosa

```json
{
  "success": true,
  "auth_token": "abc... (64 chars)",
  "user_contact": {
    "name": "USER-2",
    "full_name": "Ana Gómez",
    ...
  }
}
```

---

## 7. `resend_registration_otp`

Reenvía OTP para un registro pendiente (genera uno nuevo, resetea `attempts`).

### Parámetros

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `phone_number` | string | Sí |
| `honeypot` | string | No |

### Reglas

- Verifica que exista cache de registro pendiente.
- Aplica el rate limit horario por teléfono (mismo que `request_registration_otp`).

### Respuesta

```json
{
  "success": true,
  "message": "Verification code sent",
  "phone": "+57***34567",
  "expiry_minutes": 5
}
```

---

## 8. `cancel_registration`

Cancela un registro pendiente eliminando los datos del cache.

### Parámetros

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `phone_number` | string | Sí |
| `honeypot` | string | No |

### Respuesta

```json
{
  "success": true,
  "message": "Registration cancelled"
}
```

---

## Modelo de datos en cache (registro pendiente)

Clave: `pending_registration:<digits_only_phone>`

```json
{
  "form_data": { /* campos del formulario tal cual los envió el frontend */ },
  "otp_hash": "sha256-hex",
  "attempts": 0,
  "created_at": "2026-05-18T10:30:00"
}
```

Expiración: `otp_expiry_minutes * 60` segundos (default 300 s = 5 min).

---

## Logs de DEBUG (advertencia)

El código actual contiene `frappe.log_error()` que **incluyen el OTP en claro**:

```python
# api/otp/service.py:192-196
frappe.log_error(
    title="DEBUG OTP Code",
    message=f"Document: {document}, OTP: {otp_code}, Phone: {doc.phone_number}"
)
```

> **Remover antes de producción.** Los Error Logs de Frappe son accesibles por System Manager y filtrarían los códigos OTP.

---

## Referencias cruzadas

- [../doctypes/OTP_SETTINGS.md](../doctypes/OTP_SETTINGS.md) — Configuración global y SMS Provider.
- [../doctypes/USER_CONTACT.md](../doctypes/USER_CONTACT.md) — Campos OTP del User contact.
- [CONTACTS.md](CONTACTS.md) — `create_user_contact` devuelve `requires_otp: true` cuando OTP está activo.
- [AUTH.md](AUTH.md) — Una vez obtenido el `auth_token`, se usa con el header `X-User-Contact-Token`.
