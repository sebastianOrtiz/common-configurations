# API: Contacts

Endpoints HTTP para gestión de **User Contacts**: registro, login por documento, actualización y descubrimiento dinámico de campos.

**Base path:** `common_configurations.api.contacts.*`
**Archivo:** `common_configurations/api/contacts/endpoints.py`

---

## Resumen

| Endpoint | Método | Auth | Rate limit |
|----------|--------|------|------------|
| `get_user_contact_by_document` | GET / POST | Guest | 30 req/min/IP |
| `create_user_contact` | POST | Guest | 20 req/min/IP |
| `update_user_contact` | POST | Guest | 20 req/min/IP |
| `get_user_contact_fields` | GET / POST | Guest | 30 req/min/IP |

> Los 4 endpoints están protegidos por **honeypot** (acepta un parámetro `honeypot` que debe llegar vacío).

---

## 1. `get_user_contact_by_document`

Busca un User Contact por su número de documento y genera un nuevo token de autenticación. Es el equivalente a "login" para un usuario ya registrado.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def get_user_contact_by_document(document: str, honeypot: str = None):
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `document` | string | Sí | Número de documento. Validado por `validate_document_number()`: longitud 4-20, solo `[a-zA-Z0-9\-]` |
| `honeypot` | string | No | Campo trampa para bots. Debe llegar **vacío** |

### Respuestas

#### Contacto encontrado + OTP deshabilitado

```json
{
  "name": "USER-1",
  "full_name": "Juan Pérez",
  "document_type": "Cedula de ciudadania",
  "document": "12345678",
  "phone_number": "+573001234567",
  "email": "juan@example.com",
  "gender": "Masculino",
  "auth_token": "7c2b... (64 chars hex)"
}
```

#### Contacto encontrado + OTP habilitado

```json
{
  "name": "USER-1",
  "full_name": "Juan Pérez",
  "document_type": "Cedula de ciudadania",
  "document": "12345678",
  "phone_number": "+573001234567",
  "email": "juan@example.com",
  "gender": "Masculino",
  "requires_otp": true,
  "otp_settings": {
    "enabled": true,
    "otp_length": 6,
    "otp_expiry_minutes": 5,
    "sms_provider": "Infobip Producción"
  }
}
```

> El frontend debe llamar a `request_otp` y luego `verify_otp` para obtener el `auth_token`.

#### Contacto no encontrado

Devuelve `null` (no es un error).

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.contacts.get_user_contact_by_document?document=12345678" \
  -H "Accept: application/json"
```

### Errores comunes

| Caso | Excepción | Mensaje |
|------|-----------|---------|
| `document` vacío | `frappe.ValidationError` | Document number is required |
| `document` < 4 chars | `frappe.ValidationError` | Document number is too short |
| `document` > 20 chars | `frappe.ValidationError` | Document number is too long |
| `document` con chars no permitidos | `frappe.ValidationError` | Document number contains invalid characters |
| Honeypot lleno | `frappe.ValidationError` | Invalid request |
| Rate limit excedido | `frappe.TooManyRequestsError` | Too many requests. Please wait... |

---

## 2. `create_user_contact`

Crea un nuevo `User contact`. Si ya existe uno con el mismo `document`, lanza error sugiriendo usar el flujo de "login".

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def create_user_contact(data, honeypot: str = None):
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `data` | dict / JSON string | Sí | Datos del contacto. Aceptado como objeto o como string JSON |
| `honeypot` | string | No | Debe llegar vacío |

### Campos del `data`

#### Obligatorios

- `full_name` — string, validado por `validate_name()` (2-140 chars, sin patrones de inyección)
- `document` — string, validado por `validate_document_number()`
- `document_type` — uno de: `Cedula de ciudadania`, `NIT`. Acepta aliases (`cc`, `cedula`, `nit`, etc.)

#### Opcionales

- `phone_number` — validado por `validate_phone()`
- `email` — validado por `validate_email()`
- `gender` — uno de: `No especifica`, `Femenino`, `Masculino`, `Otro`. Acepta aliases (`hombre`, `mujer`, `male`, `female`, etc.)

### Aliases de `document_type` aceptados

| Input (case-insensitive) | Se mapea a |
|--------------------------|------------|
| `cedula`, `cc`, `cédula`, `cedula de ciudadania`, `cédula de ciudadanía` | `Cedula de ciudadania` |
| `nit` | `NIT` |

### Aliases de `gender` aceptados

| Input | Se mapea a |
|-------|------------|
| `hombre`, `male`, `m`, `masculino` | `Masculino` |
| `mujer`, `female`, `f`, `femenino` | `Femenino` |
| `otro`, `other`, `no binario`, `non-binary` | `Otro` |
| `no especifica`, `no especificado`, `unspecified`, `n/a`, `""` | `No especifica` |

### Respuestas

#### OTP deshabilitado — Usuario creado y autenticado

```json
{
  "name": "USER-2",
  "doctype": "User contact",
  "full_name": "Ana Gómez",
  "document": "87654321",
  "document_type": "Cedula de ciudadania",
  "phone_number": "+573009876543",
  "email": "ana@example.com",
  "gender": "Femenino",
  "auth_token": "abcd... (64 chars hex)"
}
```

#### OTP habilitado — Usuario creado, pendiente de verificar OTP

```json
{
  "name": "USER-2",
  "doctype": "User contact",
  "full_name": "Ana Gómez",
  "document": "87654321",
  ...
  "requires_otp": true,
  "otp_settings": { ... }
}
```

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.contacts.create_user_contact" \
  -H "Content-Type: application/json" \
  -H "X-Frappe-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "data": {
      "full_name": "Ana Gómez",
      "document": "87654321",
      "document_type": "cc",
      "phone_number": "+573009876543",
      "email": "ana@example.com",
      "gender": "f"
    },
    "honeypot": ""
  }'
```

### Errores comunes

| Caso | Excepción | Mensaje |
|------|-----------|---------|
| Documento ya existe | `frappe.ValidationError` | Ya existe un usuario registrado con este número de documento. Por favor usa la opción 'Estoy registrado' para conectarte. |
| `full_name` < 2 chars | `frappe.ValidationError` | Nombre completo is too short |
| `full_name` con `<script` u otro patrón peligroso | `frappe.ValidationError` | Invalid characters in name |
| `email` inválido | `frappe.ValidationError` | Invalid email format |
| `phone_number` inválido | `frappe.ValidationError` | Phone number has invalid length |
| JSON malformado | `frappe.ValidationError` | Invalid data format |

---

## 3. `update_user_contact`

Actualiza un User Contact existente.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def update_user_contact(name: str, data, honeypot: str = None):
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `name` | string | Sí | ID del User contact (ej. `USER-1`). Validado con `sanitize_string(name, 140)` |
| `data` | dict / JSON string | Sí | Solo los campos a modificar |
| `honeypot` | string | No | Debe llegar vacío |

> **Atención:** este endpoint está marcado como `allow_guest=True` y **no exige `X-User-Contact-Token`**. La protección depende del rate limit y del honeypot. Para operaciones donde se requiera autenticación estricta, considera proteger el endpoint con el decorador `@require_user_contact()`.

### Respuesta

Devuelve el documento actualizado completo (vía `doc.as_dict()`).

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.contacts.update_user_contact" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "USER-1",
    "data": {
      "email": "nuevo-correo@example.com",
      "phone_number": "+573001112233"
    },
    "honeypot": ""
  }'
```

### Errores comunes

| Caso | Excepción | Mensaje |
|------|-----------|---------|
| `name` vacío | `frappe.ValidationError` | Contact ID is required |
| `name` no existe | `frappe.DoesNotExistError` | Contact not found |
| Cualquier validador falla | `frappe.ValidationError` | (mensaje específico del validador) |

---

## 4. `get_user_contact_fields`

Devuelve metadatos de los campos del DocType `User contact` para **construir formularios dinámicamente** en el frontend.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def get_user_contact_fields():
```

### Sin parámetros (más allá del rate limit).

### Respuesta

Lista de campos visibles para entrada de datos (excluye `hidden`, `read_only`, y secciones/columnas):

```json
[
  {
    "fieldname": "full_name",
    "fieldtype": "Data",
    "label": "Full Name",
    "reqd": 1,
    "options": null,
    "default": null,
    "description": null,
    "read_only": 0,
    "hidden": 0,
    "length": 500,
    "precision": null
  },
  {
    "fieldname": "document_type",
    "fieldtype": "Select",
    "label": "Document Type",
    "reqd": 1,
    "options": "Cedula de ciudadania\nNIT",
    "default": "Cedula de ciudadania",
    ...
  },
  ...
]
```

Solo se incluyen estos fieldtypes: `Data, Select, Int, Float, Currency, Date, Datetime, Time, Check, Text, Small Text, Long Text, Link, Dynamic Link, Phone, Email`.

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.contacts.get_user_contact_fields"
```

### Uso típico

El frontend Angular usa este endpoint para renderizar el formulario de registro sin tener que mantener una versión hardcoded del modelo. Si un admin agrega un custom field al DocType `User contact`, aparece automáticamente en el formulario.

---

## Capa de validación (`api/contacts/validators.py`)

Las llamadas anteriores delegan en `parse_contact_data(data)` que:

1. Si `data` es string, hace `json.loads()`.
2. Si no es dict, lanza `ValidationError`.
3. Llama a `validate_user_contact_data(data)`:
   - Aplica el validador apropiado por campo (`validate_name`, `validate_email`, etc.).
   - Normaliza `document_type` y `gender` con sus aliases.
   - Para campos custom desconocidos, aplica `sanitize_string()` si son strings (descarta tipos complejos por seguridad).

---

## Capa de servicio (`api/contacts/service.py`)

`ContactService` contiene la lógica de negocio:

- `get_by_document(document)` — Búsqueda simple.
- `get_by_name(name)` — Búsqueda por ID Frappe.
- `create(data)` — Crea, lanza error si el documento ya existe.
- `update(name, data)` — Actualiza campos.
- `authenticate(document)` — Busca por documento + genera token o solicita OTP.
- `logout(name)` — Limpia `auth_token_hash` y `token_created_at`.
- `get_fields_metadata()` — Lista campos para formularios dinámicos.

> Toda esta lógica vive en services para que pueda ser reutilizada por otras apps (ej. `meet_scheduling` puede importar `ContactService.get_by_document` directamente sin pasar por HTTP).

---

## Referencias cruzadas

- [../doctypes/USER_CONTACT.md](../doctypes/USER_CONTACT.md) — DocType.
- [AUTH.md](AUTH.md) — Endpoints de autenticación (CSRF, logout, current user).
- [OTP.md](OTP.md) — Verificación por OTP cuando está habilitado.
- [SHARED.md](SHARED.md) — Validadores y utilidades comunes.
- [../features/USER_CONTACT_AUTH.md](../features/USER_CONTACT_AUTH.md) — Flujo completo de auth.
