# DocType: User contact

**Nombre interno:** `User contact` (con espacio y `c` minúscula)
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/user_contact/user_contact.json`
**Ruta controlador Python:** `common_configurations/common_configurations/doctype/user_contact/user_contact.py`
**Tipo:** Standard DocType
**Auto-naming:** `format:USER-{#}` (incremental, ej. `USER-1`, `USER-2`, ...)
**Title field:** `full_name`
**Search fields:** `document,full_name,phone_number`

---

## Propósito

`User contact` representa un usuario público (guest) que interactúa con el Service Portal. **NO es un `User` de Frappe**: no tiene login al desk, no consume licencias y se autentica mediante un token propio (`X-User-Contact-Token`) o mediante OTP por SMS.

Casos de uso:

- Un ciudadano que entra a un Service Portal a agendar una cita
- Un usuario que registra una bitácora desde una integración externa (chatbot)
- Un cliente que consulta el estado de sus trámites legales

Cada User contact se identifica de forma única por su número de documento.

---

## Campos (uno por uno)

### Sección: General (sin label)
Section Break `section_break_buz6` (sin label visible).

#### `full_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Full Name |
| `reqd` | 1 (obligatorio) |
| `length` | 500 |
| `in_list_view` | 1 |

Nombre completo del contacto. Validado en backend con `validate_name()` que rechaza patrones de inyección (SQL, XSS) y exige longitud entre 2 y 140 caracteres.

#### `document_type`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Document Type |
| `reqd` | 1 |
| `default` | `Cedula de ciudadania` |
| `options` | `Cedula de ciudadania\nNIT` |
| `in_list_view` | 1 |

Tipo de documento. El backend (`normalize_document_type` en `api/contacts/validators.py`) acepta los siguientes aliases case-insensitive y los mapea a la opción almacenada:

- Para "Cedula de ciudadania": `cedula`, `cc`, `cédula`, `cedula de ciudadania`, `cédula de ciudadanía`
- Para "NIT": `nit`

#### `document`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Document Number |
| `reqd` | 1 |
| `in_list_view` | 1 |

Número de documento. Validado por `validate_document_number()` con las siguientes reglas:

- Longitud entre 4 y 20 caracteres
- Solo permite caracteres alfanuméricos y guiones (`[a-zA-Z0-9\-]`)

Aunque el JSON no lo marca como `unique`, el código (`ContactService.create()`) lanza error si ya existe un `User contact` con el mismo `document`.

#### `phone_number`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Phone Number |
| `reqd` | 0 |

Teléfono (opcional pero **obligatorio si el portal usa MFA OTP**). Validado por `validate_phone()`: acepta formato internacional `+` y separadores `( ) - . espacio`. Después de limpiar separadores debe contener entre 7 y 15 dígitos.

#### `email`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Email |
| `options` | Email |
| `reqd` | 0 |

Email. Validado por `validate_email()`: regex estándar y máximo 254 caracteres. Se almacena en minúsculas.

#### `gender`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Gender |
| `default` | `No especifica` |
| `options` | `No especifica\nFemenino\nMasculino\nOtro` |

Género. `normalize_gender()` acepta aliases:

- Masculino: `hombre`, `male`, `m`, `masculino`
- Femenino: `mujer`, `female`, `f`, `femenino`
- Otro: `otro`, `other`, `no binario`, `non-binary`
- No especifica: `no especifica`, `no especificado`, `unspecified`, `n/a`, `""`

---

### Sección: Authentication (`permlevel: 1`)

Section Break `section_break_auth`, **collapsible**, `permlevel: 1`. Solo visibles para roles con `permlevel: 1`.

#### `auth_token_hash`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Token Hash |
| `no_copy` | 1 |
| `permlevel` | 1 |
| `read_only` | 1 |

Hash SHA-256 del token de autenticación activo. **Nunca contiene el token en claro**.

El flujo es: se genera un token con `secrets.token_hex(32)` (64 chars hex, 256 bits de entropía), se hashea con SHA-256 y solo el hash se guarda aquí. El token claro se envía una sola vez al cliente y se transmite en cada request via `X-User-Contact-Token`.

#### `token_created_at`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Datetime |
| `label` | Token Created At |
| `no_copy` | 1 |
| `permlevel` | 1 |
| `read_only` | 1 |

Fecha de creación del token. Se usa para calcular expiración: tokens válidos por **30 días** (constante `TOKEN_EXPIRY_DAYS` en `api/shared/security.py:24`).

---

### Sección: OTP Verification (`permlevel: 1`)

Section Break `section_break_otp`, **collapsible**, `permlevel: 1`.

#### `otp_hash`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Password |
| `label` | OTP Hash |
| `no_copy` | 1 |
| `permlevel` | 1 |
| `read_only` | 1 |

Hash SHA-256 del código OTP activo. Para usuarios ya registrados que solicitan login por OTP.

#### `otp_created_at`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Datetime |
| `label` | OTP Created At |
| `permlevel` | 1 |
| `read_only` | 1 |

Fecha y hora de creación del OTP. Se compara contra `OTP Settings.otp_expiry_minutes` (default 5 min) para invalidar OTPs expirados.

#### `otp_attempts`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `label` | OTP Attempts |
| `default` | 0 |
| `permlevel` | 1 |
| `read_only` | 1 |

Contador de intentos fallidos de verificación OTP. Al alcanzar `OTP Settings.max_verification_attempts` (default 5) se bloquea la cuenta.

#### `otp_locked_until`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Datetime |
| `label` | OTP Locked Until |
| `permlevel` | 1 |
| `read_only` | 1 |

Si está establecido, la cuenta está bloqueada hasta esa fecha. Se calcula como `now + lockout_duration_minutes` (default 30 min).

#### `otp_requests_count`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `label` | OTP Requests Count |
| `default` | 0 |
| `permlevel` | 1 |
| `read_only` | 1 |

Contador de solicitudes de OTP en la ventana de tiempo actual.

#### `otp_requests_reset_at`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Datetime |
| `label` | OTP Requests Reset At |
| `permlevel` | 1 |
| `read_only` | 1 |

Cuándo se resetea el contador de solicitudes. Se compara con `OTP Settings.max_otp_requests_per_hour` (default 3) para rate limiting por usuario.

---

## Permisos por rol

Tomados directamente del JSON (`permissions[]`):

| Rol | `permlevel` 0 (campos normales) | `permlevel` 1 (auth + OTP) |
|-----|-------------------------------|----------------------------|
| **System Manager** | create, read, write, delete, email, export, print, report, share | read, write |
| **Common Config Manager** | create, read, write, delete, email, export, print, report, share | — |
| **Portal API User** | create, read (if_owner), write, email, export, print, report | — |

> Solo **System Manager** puede ver los campos sensibles (`auth_token_hash`, `token_created_at`, `otp_hash`, etc.) gracias al `permlevel: 1` de la sección.

---

## Controlador Python

`common_configurations/common_configurations/doctype/user_contact/user_contact.py`:

```python
from frappe.model.document import Document


class Usercontact(Document):
    pass
```

> El controlador está prácticamente vacío. **Toda la lógica de negocio vive en `common_configurations.api.contacts.service.ContactService`** y en los validadores `common_configurations.api.contacts.validators`. Esto cumple con el principio de "DocTypes finos / services gruesos".

---

## Eventos doc_events

`hooks.py` actualmente **NO declara** `doc_events` para `User contact`. Toda la lógica se ejecuta desde los endpoints whitelisted.

---

## Métodos disponibles vía `ContactService`

Definidos en `common_configurations/api/contacts/service.py`:

- `ContactService.get_by_document(document)` — Búsqueda por número de documento, devuelve dict o None.
- `ContactService.get_by_name(name)` — Búsqueda por nombre Frappe (ej. `USER-1`).
- `ContactService.create(data)` — Crea el doc, opcionalmente solicita OTP si está habilitado.
- `ContactService.update(name, data)` — Actualiza un doc existente.
- `ContactService.authenticate(document)` — "Login" por documento; genera token o solicita OTP.
- `ContactService.logout(name)` — Limpia `auth_token_hash` y `token_created_at`.
- `ContactService.get_fields_metadata()` — Devuelve metadatos de campos para generar formularios dinámicos.

---

## Configuración adicional del JSON

| Propiedad | Valor |
|-----------|-------|
| `allow_rename` | 1 |
| `engine` | InnoDB |
| `index_web_pages_for_search` | 1 |
| `grid_page_length` | 50 |
| `sort_field` | `modified` |
| `sort_order` | DESC |
| `track_changes` | (no establecido en JSON) |

---

## Notas de seguridad

1. Los hashes nunca se exponen en respuestas API (los servicios filtran campos explícitamente).
2. La comparación de tokens usa `secrets.compare_digest()` (constante en tiempo) para evitar timing attacks.
3. Tras 30 días el token se invalida automáticamente y se limpia el hash del documento.
4. El logout limpia ambos campos `auth_token_hash` y `token_created_at`.

---

## Referencias cruzadas

- [api/CONTACTS.md](../api/CONTACTS.md) — Endpoints HTTP que operan sobre este DocType.
- [features/USER_CONTACT_AUTH.md](../features/USER_CONTACT_AUTH.md) — Flujo completo de autenticación por token.
- [doctypes/OTP_SETTINGS.md](OTP_SETTINGS.md) — Configuración de OTP relacionada.
- [api/SHARED.md](../api/SHARED.md) — Validadores y utilidades de seguridad.
