# DocType: OTP Settings (+ SMS Provider)

Documentación del sistema de **One-Time Password** por SMS usado como segundo factor (MFA) en los Service Portals que tienen `require_auth` y `enable_mfa_otp`.

---

## OTP Settings (Single DocType)

**Nombre interno:** `OTP Settings`
**Tipo:** **Single** (`issingle: 1`) — existe una sola instancia global
**Ruta JSON:** `common_configurations/common_configurations/doctype/otp_settings/otp_settings.json`
**Ruta controlador:** `common_configurations/common_configurations/doctype/otp_settings/otp_settings.py`
**Track changes:** 1

### Propósito

Configuración global del sistema OTP: si está habilitado, qué proveedor SMS usar, longitud del código, expiración, rate limits y plantilla del mensaje.

### Campos

#### `enable_otp_verification`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 0 |
| `description` | Habilitar o deshabilitar verificación OTP para autenticación de User Contact |

Master switch. Si está apagado, todos los endpoints OTP devuelven "OTP verification is not enabled". El método estático `OTPSettings.is_otp_enabled()` consulta este valor cacheado.

#### `sms_provider_link`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `SMS Provider` |
| `depends_on` | `enable_otp_verification` |
| `mandatory_depends_on` | `enable_otp_verification` |

Proveedor SMS a usar. Visible y obligatorio solo si OTP está habilitado.

#### Sección: OTP Configuration (visible si OTP habilitado)

##### `otp_length`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 6 |

Número de dígitos del código OTP. Validado por el controlador: debe estar entre **4 y 8**.

##### `otp_expiry_minutes`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 5 |

Tiempo en minutos que el código OTP es válido desde su generación. Mínimo 1 minuto (validado).

#### Sección: Rate Limiting

##### `max_otp_requests_per_hour`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 3 |

Máximo de solicitudes de OTP por documento (User Contact) en una hora.

##### `max_verification_attempts`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 5 |

Máximo de intentos incorrectos antes de bloquear la cuenta. Mínimo 1 (validado).

##### `lockout_duration_minutes`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 30 |

Tiempo en minutos que el usuario queda bloqueado después de agotar sus intentos.

#### Sección: Message Templates

##### `sms_message_template`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `default` | `Tu código de verificación es: {otp}. Válido por {minutes} minutos.` |

Plantilla del SMS. Soporta los placeholders `{otp}` y `{minutes}`.

### Permisos

| Rol | create | read | write | delete |
|-----|--------|------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 |

Solo System Manager.

### Controlador Python (`otp_settings.py`)

```python
class OTPSettings(Document):
    def validate(self) -> None:
        if self.enable_otp_verification:
            self._validate_provider_link()
            self._validate_otp_config()

    def _validate_provider_link(self) -> None:
        if not self.sms_provider_link:
            frappe.throw(_("Se debe seleccionar un SMS Provider..."))

        provider_is_active = frappe.db.get_value(
            "SMS Provider", self.sms_provider_link, "is_active"
        )
        if not provider_is_active:
            frappe.throw(_("El SMS Provider '{0}' no está activo..."))

    def _validate_otp_config(self) -> None:
        if self.otp_length and (self.otp_length < 4 or self.otp_length > 8):
            frappe.throw(_("La longitud del OTP debe estar entre 4 y 8 dígitos"))
        if self.otp_expiry_minutes and self.otp_expiry_minutes < 1:
            frappe.throw(_("El tiempo de expiración debe ser al menos 1 minuto"))
        if self.max_verification_attempts and self.max_verification_attempts < 1:
            frappe.throw(_("El máximo de intentos debe ser al menos 1"))

    @staticmethod
    def get_settings() -> "OTPSettings":
        return frappe.get_cached_doc("OTP Settings")

    @staticmethod
    def is_otp_enabled() -> bool:
        try:
            settings = OTPSettings.get_settings()
            return bool(settings.enable_otp_verification)
        except Exception:
            return False
```

Métodos relevantes:

- `get_settings()` → Devuelve el doc cacheado.
- `is_otp_enabled()` → True si OTP está activo (con fallback a False si hay error).
- `clear_cache()` → Se llama en `on_update` y `after_insert`.

---

## SMS Provider

**Nombre interno:** `SMS Provider`
**Ruta JSON:** `common_configurations/common_configurations/doctype/sms_provider/sms_provider.json`
**Auto-naming:** `field:provider_name`
**Track changes:** 1

### Propósito

Almacena las **credenciales** del proveedor SMS (Infobip por defecto, extensible a Twilio u otros). Está separado de `OTP Settings` para poder rotar/cambiar de proveedor sin perder la configuración OTP.

### Campos

#### Sección: General

| Campo | Tipo | Default | Notas |
|-------|------|---------|-------|
| `provider_name` | Data (reqd, unique) | — | Nombre descriptivo (ej. "Infobip Producción") |
| `provider_type` | Select (reqd) | — | Opciones: `Infobip` (única opción de fábrica) |
| `is_active` | Check | 1 | Si está apagado, OTP Settings rechaza vincularlo |

#### Sección: Credentials

| Campo | Tipo | Default | Notas |
|-------|------|---------|-------|
| `api_url` | Data (reqd) | — | URL base, ej. `https://XXXXX.api.infobip.com` |
| `api_key` | **Password** (reqd) | — | API Key del proveedor. Se lee con `doc.get_password("api_key")` |
| `api_secret` | **Password** | — | Auth token / secret opcional |
| `sender_id` | Data | — | Nombre o número del remitente (ej. `InfoSMS` o `+573001234567`) |

### Permisos

| Rol | create | read | write | delete |
|-----|--------|------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 |

---

## Flujo de verificación OTP

### Diagrama de flujo

```
Usuario → Service Portal → request_otp(document)
                  │
                  ▼
    OTPService.request_otp(document)
                  │
                  ├── Lookup User contact por documento
                  ├── _check_lockout(doc)       (bloqueado?)
                  ├── _check_rate_limit(doc)    (3 req/h)
                  ├── _generate_otp(length=6)   (6 dígitos aleatorios)
                  ├── _hash_otp(otp)            (SHA-256)
                  ├── _format_phone_e164(phone) (+57XXXXXXXXXX)
                  ├── sms_client.send_sms(phone, otp)
                  ├── doc.otp_hash = hash
                  ├── doc.otp_created_at = now
                  ├── doc.otp_attempts = 0
                  ├── doc.otp_requests_count += 1
                  └── return {phone: masked, expiry_minutes: 5}

Usuario → Service Portal → verify_otp(document, otp_code)
                  │
                  ▼
    OTPService.verify_otp(document, otp_code)
                  │
                  ├── _check_lockout(doc)
                  ├── Verifica que doc.otp_hash exista
                  ├── Verifica expiración (now < otp_created_at + 5min)
                  ├── compare(hash(input), stored_hash)
                  │       │
                  │       ├── INVALID: doc.otp_attempts += 1
                  │       │             si >= max: lock 30min
                  │       └── VALID: create_user_contact_token(doc.name)
                  │                   limpia otp_*
                  │                   return {auth_token, user_contact}
```

### Flujo de registro con OTP

Cuando se llama a `create_user_contact` y OTP está habilitado:

1. El servicio devuelve `{requires_otp: True, otp_settings: {...}}` SIN auth_token.
2. El frontend muestra el formulario de código OTP.
3. El frontend llama a `request_registration_otp(data)` que **NO crea aún el User contact**, sino que cachea los datos en Redis con clave `pending_registration:<phone>` por `otp_expiry_minutes * 60` segundos.
4. Al recibir `verify_registration_otp(phone, otp)`:
   - Si el OTP es válido, recupera los datos del cache y crea el `User contact` definitivamente.
   - Si falla, incrementa `attempts` y elimina el registro pendiente tras 5 intentos.

Esto evita crear contactos huérfanos en caso de teléfonos inválidos.

---

## Plantilla del SMS

Default: `Tu código de verificación es: {otp}. Válido por {minutes} minutos.`

Se evalúa en el cliente Infobip (`infobip_client.py`) sustituyendo `{otp}` por el código y `{minutes}` por `otp_expiry_minutes`.

---

## Estados y bloqueos del User Contact

El controlador OTP gestiona estos campos del `User contact` (todos con `permlevel: 1`):

- `otp_hash` — SHA-256 del OTP activo
- `otp_created_at` — para verificar expiración
- `otp_attempts` — contador de intentos fallidos
- `otp_locked_until` — bloqueo temporal
- `otp_requests_count` — para rate limit horario
- `otp_requests_reset_at` — cuándo se resetea el contador

> Ver [USER_CONTACT.md](USER_CONTACT.md#sección-otp-verification-permlevel-1) para el detalle de cada campo.

---

## DEBUG en producción — Advertencia

El código actual contiene `frappe.log_error()` con el OTP en claro:

```python
# api/otp/service.py:192-196
frappe.log_error(
    title="DEBUG OTP Code",
    message=f"Document: {document}, OTP: {otp_code}, Phone: {doc.phone_number}"
)
```

> **Esto está marcado como "REMOVE IN PRODUCTION!" en el código.** Antes de producción es necesario remover estos logs para evitar filtrar OTPs en los Error Logs de Frappe.

---

## Cliente SMS extensible

`api/otp/client_factory.py` implementa el mismo patrón Registry + Decorator que la AI factory:

```python
_PROVIDERS: dict = {}

def register_provider(name: str):
    def decorator(cls):
        _PROVIDERS[name] = cls
        return cls
    return decorator

def get_sms_client():
    settings = OTPSettings.get_settings()
    provider_doc = frappe.get_doc("SMS Provider", settings.sms_provider_link)
    client_class = _PROVIDERS.get(provider_doc.provider_type)
    return client_class(provider_doc)
```

Para agregar Twilio:

1. Crear `api/otp/twilio_client.py` con `@register_provider("Twilio")` y método `send_sms(phone, code)`.
2. Importarlo en `client_factory.get_sms_client()`.
3. Agregar "Twilio" como opción en `SMS Provider.provider_type`.

---

## Referencias cruzadas

- [USER_CONTACT.md](USER_CONTACT.md) — Campos OTP del DocType.
- [../api/OTP.md](../api/OTP.md) — Endpoints HTTP.
- [../features/USER_CONTACT_AUTH.md](../features/USER_CONTACT_AUTH.md) — Flujo de auth con OTP.
