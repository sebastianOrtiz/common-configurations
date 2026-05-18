# API: External (autenticación por API Key)

Endpoints públicos diseñados para **integraciones externas** (chatbots de WhatsApp, apps móviles, sistemas de terceros) que **no usan el token de User Contact** sino una API Key gestionada via `API Service`.

**Base path:** `common_configurations.api.external.*`
**Archivo:** `common_configurations/api/external/endpoints.py`

---

## Modelo de autenticación

1. Un administrador crea un `API Service` (ej. "WhatsApp Chatbot") y agrega filas a `api_keys[]`.
2. Al guardar, `APIService.validate()` genera automáticamente cada `api_key` faltante con `secrets.token_hex(32)` (64 chars hex).
3. La key se entrega **una sola vez** al integrador (al admin que la creó).
4. Cada request al endpoint externo incluye el header `X-API-Key: <key>`.
5. El decorador `@require_api_key("enable_X")` valida que:
   - La key existe y pertenece a un `API Service Key` con `is_active=1`.
   - El `API Service` padre está `is_active=1`.
   - El endpoint solicitado está habilitado (`enable_lookup_contact = 1`, etc.).
6. Aplica rate limit propio del servicio (`rate_limit` campo, default 60 req/min).

---

## Resumen

| Endpoint | Método | Header | Rate limit | Check requerido |
|----------|--------|--------|------------|-----------------|
| `lookup_contact` | GET | `X-API-Key` | `API Service.rate_limit` | `enable_lookup_contact` |
| `register_contact` | POST | `X-API-Key` | `API Service.rate_limit` | `enable_register_contact` |

---

## 1. `lookup_contact`

Busca un `User contact` por número de documento. Devuelve datos básicos pero **NO genera tokens de autenticación** (es solo lectura).

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
@require_api_key("enable_lookup_contact")
def lookup_contact(document: str) -> Dict[str, Any]:
    document = validate_document_number(document)
    contact = ContactService.get_by_document(document)
    if not contact:
        return {"exists": False}
    return {
        "exists": True,
        "name": contact["name"],
        "full_name": contact["full_name"],
        "document": contact["document"],
        "document_type": contact["document_type"],
        "phone_number": contact.get("phone_number"),
        "email": contact.get("email"),
    }
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `document` | string | Sí | Número de documento. Validado igual que en `get_user_contact_by_document` (4-20 chars, `[a-zA-Z0-9\-]`) |

### Headers requeridos

| Header | Valor | Obligatorio |
|--------|-------|-------------|
| `X-API-Key` | La key generada por el `API Service` | Sí |

### Respuestas

#### Contacto existe

```json
{
  "exists": true,
  "name": "USER-1",
  "full_name": "Juan Pérez",
  "document": "12345678",
  "document_type": "Cedula de ciudadania",
  "phone_number": "+573001234567",
  "email": "juan@example.com"
}
```

#### Contacto no existe

```json
{ "exists": false }
```

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.external.lookup_contact?document=12345678" \
  -H "X-API-Key: 7c2b3a4d5e6f...secret-64-chars..." \
  -H "Accept: application/json"
```

### Errores comunes

| Caso | Excepción | Status |
|------|-----------|--------|
| Falta `X-API-Key` | `frappe.AuthenticationError` | 401 |
| Key inválida o inactiva | `frappe.AuthenticationError` | 401 |
| Service inactivo | `frappe.AuthenticationError` | 401 |
| `enable_lookup_contact = 0` | `frappe.PermissionError` | 403 |
| Rate limit del service excedido | `frappe.TooManyRequestsError` | 429 |
| `document` inválido | `frappe.ValidationError` | 417 |

---

## 2. `register_contact`

Crea un nuevo `User contact` desde una integración externa. **NO genera auth tokens** (los sistemas externos no necesitan tokens de portal). Si el contacto ya existe, devuelve los datos existentes con `is_new: false` (idempotente).

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_api_key("enable_register_contact")
def register_contact(data) -> Dict[str, Any]:
    validated_data = parse_contact_data(data)
    existing = ContactService.get_by_document(validated_data.get("document"))
    if existing:
        return {**existing, "is_new": False}

    doc = frappe.get_doc({"doctype": "User contact", **validated_data})
    doc.insert(ignore_permissions=True)
    frappe.db.commit()

    return {
        "name": doc.name,
        "full_name": doc.full_name,
        "document": doc.document,
        "document_type": doc.document_type,
        "phone_number": doc.phone_number,
        "email": doc.email,
        "is_new": True,
    }
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `data` | dict / JSON string | Sí | Datos del contacto. Mismas validaciones que `create_user_contact` |

### Campos del `data`

#### Obligatorios

- `full_name`
- `document`
- `document_type` (acepta aliases: `cc`, `cedula`, `nit`, etc.)

#### Opcionales

- `phone_number`
- `email`
- `gender` (acepta aliases: `m/f/hombre/mujer/male/female/...`)

### Headers requeridos

| Header | Valor | Obligatorio |
|--------|-------|-------------|
| `X-API-Key` | La key del API Service | Sí |
| `Content-Type` | `application/json` | Sí |

### Respuesta — Contacto nuevo

```json
{
  "name": "USER-3",
  "full_name": "Carlos Ramírez",
  "document": "99887766",
  "document_type": "Cedula de ciudadania",
  "phone_number": "+573215554433",
  "email": null,
  "is_new": true
}
```

### Respuesta — Contacto ya existía

```json
{
  "name": "USER-1",
  "full_name": "Juan Pérez",
  "document_type": "Cedula de ciudadania",
  "document": "12345678",
  "phone_number": "+573001234567",
  "email": "juan@example.com",
  "gender": "Masculino",
  "is_new": false
}
```

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.external.register_contact" \
  -H "X-API-Key: 7c2b3a4d5e6f...secret-64-chars..." \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "full_name": "Carlos Ramírez",
      "document": "99887766",
      "document_type": "cc",
      "phone_number": "+573215554433"
    }
  }'
```

### Errores comunes

| Caso | Excepción | Status |
|------|-----------|--------|
| Falta `X-API-Key` | `frappe.AuthenticationError` | 401 |
| Key inválida/inactiva | `frappe.AuthenticationError` | 401 |
| `enable_register_contact = 0` | `frappe.PermissionError` | 403 |
| Datos inválidos | `frappe.ValidationError` | 417 |
| Rate limit excedido | `frappe.TooManyRequestsError` | 429 |

---

## Normalización de campos

Igual que en `create_user_contact`, las llamadas pasan por `parse_contact_data()`:

### Aliases de `document_type`

| Input | Normalizado a |
|-------|---------------|
| `cedula`, `cc`, `cédula`, `cedula de ciudadania`, `cédula de ciudadanía` | `Cedula de ciudadania` |
| `nit` | `NIT` |

### Aliases de `gender`

| Input | Normalizado a |
|-------|---------------|
| `hombre`, `male`, `m`, `masculino` | `Masculino` |
| `mujer`, `female`, `f`, `femenino` | `Femenino` |
| `otro`, `other`, `no binario`, `non-binary` | `Otro` |
| `no especifica`, `no especificado`, `unspecified`, `n/a`, `""` | `No especifica` |

Los strings además se normalizan a Unicode NFC (precomposed) para evitar mismatches con acentos en formas descompuestas.

---

## Cómo crear un API Service y sus keys

### Paso 1: Crear el API Service en el desk

Navega a **Common Configurations → API Service → New** o crea con el siguiente código:

```python
import frappe

doc = frappe.get_doc({
    "doctype": "API Service",
    "title": "WhatsApp Chatbot",
    "description": "Integración del bot oficial",
    "is_active": 1,
    "rate_limit": 120,                  # 120 req/min
    "enable_lookup_contact": 1,
    "enable_register_contact": 1,
    "api_keys": [
        {"key_name": "Production"},
        {"key_name": "Staging"},
    ],
})
doc.insert()
```

Al guardar, `APIService.validate()` genera automáticamente las `api_key` faltantes.

### Paso 2: Copiar las keys generadas

```python
doc = frappe.get_doc("API Service", "APIS-2026-00001")
for key_row in doc.api_keys:
    print(f"{key_row.key_name}: {key_row.api_key}")
```

> Las keys se almacenan en claro (no son hasheadas como los User Contact tokens). El campo `api_key` es `read_only` desde el desk pero los administradores pueden consultarlo en cualquier momento.

### Paso 3: Entregarlas al integrador y configurar su sistema

El sistema externo agrega el header en cada request:

```
X-API-Key: 7c2b3a4d5e6f...64 chars...
```

### Paso 4: Rotar / Revocar una key

- **Revocar**: marca `is_active = 0` en la fila correspondiente (el cliente recibirá 401 en su siguiente request).
- **Rotar**: crea una nueva fila con `key_name` distinto, distribuye la nueva key al integrador, después marca la vieja como `is_active = 0`.

---

## Rate limiting por servicio

El rate limit se aplica **por API Service**, no por key ni por IP. Es decir: si un servicio tiene `rate_limit = 60` y 3 keys, todas las requests provenientes de cualquiera de las 3 keys cuentan juntas hacia ese límite de 60 req/min.

Implementación (`api/shared/api_key.py:111-116`):

```python
check_rate_limit(
    f"api_service:{service_info['service_name']}",
    limit=service_info["rate_limit"],
    seconds=60,
)
```

Si se necesita rate limit por key, se puede personalizar añadiendo lógica al decorador.

---

## Diferencia entre `register_contact` y `create_user_contact`

| Aspecto | `register_contact` (external) | `create_user_contact` (contacts) |
|---------|-------------------------------|----------------------------------|
| Auth | `X-API-Key` (servidor-servidor) | Honeypot + rate limit (público) |
| OTP | NO se ejecuta | SÍ (si está habilitado) |
| Genera auth_token | NO | SÍ (o requiere OTP) |
| Duplicados | Idempotente: devuelve existente | Lanza error |
| Caso de uso | Chatbot crea contactos automáticamente | Usuario se registra desde el portal |

---

## Custom fields agregados por otras apps

Otras apps pueden agregar campos al `API Service` para configurar permisos adicionales:

### Por `logbook`

- `enable_create_logbook_entry` (Check) — Habilita endpoint para crear bitácoras vía API
- `api_logbook_availability` (Link) — Disponibilidad por defecto

### Por `lex_app`

- `enable_create_case_log` (Check) — Habilita endpoint para crear case logs
- `lawyer_availability` (Link) — Asignación de abogado
- `default_case_type` (Select) — Tipo de caso por defecto
- `default_legal_area` (Select) — Área legal por defecto

Cada app que agrega un endpoint protegido por API Key debe declarar su Check field y referenciarlo en `@require_api_key("nombre_del_campo")`.

---

## Referencias cruzadas

- [../doctypes/API_SERVICE.md](../doctypes/API_SERVICE.md) — DocType.
- [../features/API_KEY_SYSTEM.md](../features/API_KEY_SYSTEM.md) — Visión arquitectónica.
- [SHARED.md](SHARED.md) — `api_key.py`: middleware `require_api_key`.
- [CONTACTS.md](CONTACTS.md) — Comparación con el flujo de portal público.
