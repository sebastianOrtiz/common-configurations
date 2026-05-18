# Feature: Sistema de API Key para integraciones externas

Sistema completo de autenticación servidor-a-servidor diseñado para chatbots, apps móviles, sistemas de terceros y cualquier integración externa que necesite acceder a endpoints públicos sin pasar por el flujo de portal con token de User Contact.

---

## Caso de uso

**Problema**: Un bot de WhatsApp recibe un mensaje del usuario y necesita:

1. Verificar si ya existe un User Contact con ese documento (`lookup_contact`).
2. Si no existe, registrarlo (`register_contact`).
3. Crear una bitácora a su nombre (`create_logbook_entry` de la app `logbook`).

El bot no es un usuario humano que se autentica en un portal: es un servicio. Necesita:

- Una credencial estable (no caduca en 30 días como los tokens de User Contact).
- Rate limit propio (puede generar más tráfico que un humano).
- Control granular: solo puede usar los endpoints que el admin habilite.
- Posibilidad de rotar la credencial sin interrumpir el servicio (múltiples keys activas a la vez).

**Solución**: el sistema `API Service` + `API Service Key`.

---

## Arquitectura

```
                              ┌──────────────────────────┐
                              │  Admin del bench         │
                              │  - Crea API Service      │
                              │  - Habilita endpoints    │
                              │  - Gestiona keys         │
                              └──────────┬───────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────┐
│ DocType: API Service                                       │
│ ─────────────────────────────                              │
│  title:                "WhatsApp Chatbot"                  │
│  is_active:            1                                   │
│  rate_limit:           120 req/min                         │
│  api_keys[]:                                               │
│    - { key_name: "Prod", api_key: "7c2b...", active: 1 }   │
│    - { key_name: "Staging", api_key: "8d3c...", active: 0 }│
│  enable_lookup_contact:    1   ← endpoint de common_conf   │
│  enable_register_contact:  1   ← endpoint de common_conf   │
│                                                            │
│  CUSTOM FIELDS (agregados por OTRAS apps via fixture):     │
│  enable_create_logbook_entry: 1   ← agregado por logbook   │
│  api_logbook_availability: "LB-MEDICAL"                    │
│  enable_create_case_log: 0        ← agregado por lex_app   │
└────────────────────────────────────────────────────────────┘
                                         ▲
                                         │ middleware @require_api_key
                                         │
┌────────────────────────────────────────┴───────────────────┐
│  HTTP Request                                              │
│  Header: X-API-Key: 7c2b...                                │
│  POST /api/method/common_configurations.api.external...    │
└────────────────────────────────────────────────────────────┘
```

---

## DocTypes involucrados

### `API Service` (padre)

- `title` — Nombre humano legible
- `is_active` — Master switch
- `rate_limit` — Req/min por servicio (compartido por todas sus keys)
- `description` — Notas para admins
- `api_keys[]` — Tabla de keys activas/inactivas
- `enable_lookup_contact` (Check) — Permite endpoint `lookup_contact`
- `enable_register_contact` (Check) — Permite endpoint `register_contact`
- **Custom fields agregados por otras apps**:
  - `logbook` agrega: `enable_create_logbook_entry`, `api_logbook_availability`
  - `lex_app` agrega: `enable_create_case_log`, `lawyer_availability`, `default_case_type`, `default_legal_area`

### `API Service Key` (child)

- `key_name` — Identificador humano ("Prod", "Staging", "iOS App")
- `api_key` — String hex de 64 chars generado automáticamente
- `is_active` — Permite revocar una key sin borrarla
- `created_at` — Fecha de generación

> Ver [../doctypes/API_SERVICE.md](../doctypes/API_SERVICE.md) para el detalle completo.

---

## Flujo completo

### 1) Admin crea un API Service

Desde el desk Frappe:

```
Common Configurations → API Service → New
  title: "WhatsApp Chatbot"
  is_active: 1
  rate_limit: 120
  enable_lookup_contact: 1
  enable_register_contact: 1
  api_keys:
    - key_name: "Production"
    - key_name: "Testing"
  Save
```

Al guardar, `APIService.validate()` se ejecuta:

```python
def validate(self):
    self._generate_keys_for_new_rows()

def _generate_keys_for_new_rows(self):
    for key_row in self.api_keys:
        if not key_row.api_key:
            key_row.api_key = secrets.token_hex(32)   # 64 chars hex = 256 bits
            key_row.created_at = now_datetime()
```

Resultado: cada fila de `api_keys` ahora tiene un valor en `api_key` (read-only en la UI pero visible para el admin).

### 2) Admin entrega la key al integrador

Por canal seguro (Slack interno, gestor de contraseñas, etc.).

### 3) Sistema externo hace request

```http
POST /api/method/common_configurations.api.external.lookup_contact?document=12345678
X-API-Key: 7c2b3a4d5e6f78901234567890abcdef1234567890abcdef1234567890abcdef
Accept: application/json
```

### 4) Middleware procesa

`api/shared/api_key.py:121-165`:

```python
def require_api_key(endpoint_field: str = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            service_info = authenticate_api_key()

            # Verifica que el endpoint esté habilitado en el API Service
            if endpoint_field:
                service_doc = frappe.get_doc("API Service", service_info["service_name"])
                enabled = getattr(service_doc, endpoint_field, 0)

                if not enabled:
                    frappe.throw(
                        _("This endpoint is not enabled for your API service."),
                        frappe.PermissionError,
                    )

            frappe.local.api_service = service_info
            return func(*args, **kwargs)

        return wrapper
    return decorator
```

`authenticate_api_key()` (líneas 81-118):

```python
def authenticate_api_key() -> Dict[str, Any]:
    api_key = get_api_key_from_request()  # Lee X-API-Key

    if not api_key:
        frappe.throw(_("API key is required..."), frappe.AuthenticationError)

    service_info = get_api_service_from_key(api_key)

    if not service_info:
        frappe.throw(_("Invalid or inactive API key."), frappe.AuthenticationError)

    # Rate limit por servicio
    check_rate_limit(
        f"api_service:{service_info['service_name']}",
        limit=service_info["rate_limit"],
        seconds=60,
    )

    return service_info
```

### 5) Endpoint ejecuta y responde

Dentro del endpoint, `frappe.local.api_service` está disponible:

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_api_key("enable_register_contact")
def register_contact(data):
    service = frappe.local.api_service   # { service_name, service_title, key_name, rate_limit }
    frappe.logger().info(f"Request from service: {service['service_title']}")
    # ... lógica
```

---

## Diagrama de secuencia

```
Bot/External         common_configurations           API Service       cache
─────────────        ────────────────────             ────────────      ────

POST .../register_contact ──────────────────────────────>│              │
X-API-Key: abc...           │                            │              │
                            │                            │              │
                            │ get_api_key_from_request   │              │
                            │ ───────────────────────►   │              │
                            │ ← "abc..."                 │              │
                            │                            │              │
                            │ get_api_service_from_key   │              │
                            │ ─── tabAPI Service Key ─►  │              │
                            │ ← {parent: "APIS-2026-1"}  │              │
                            │ ─── tabAPI Service ─────►  │              │
                            │ ← {name, title, rate_limit}│              │
                            │                            │              │
                            │ check_rate_limit("api_service:APIS-...", limit=60)
                            │ ─────────────────────────────────────────► │
                            │                              ← OK          │
                            │                                            │
                            │ getattr(service_doc, "enable_register_contact")
                            │ ───────────────────────►  =1               │
                            │                                            │
                            │ frappe.local.api_service = {...}           │
                            │                                            │
                            │ register_contact(data) ───────────►        │
                            │                       (lógica de negocio)  │
                            │ ◄──────────────────────────────────────────│
                            │                                            │
←──── 200 { name, is_new: true } ───────────────────────────────────────│
```

---

## Cómo otras apps EXTIENDEN el sistema

El patrón es **declarativo via fixtures**. Una app que quiere ofrecer endpoints externos:

### Paso 1: Agregar custom fields al `API Service`

`logbook/fixtures/custom_field.json`:

```json
[
  {
    "doctype": "Custom Field",
    "dt": "API Service",
    "fieldname": "section_logbook",
    "fieldtype": "Section Break",
    "label": "Logbook Configuration",
    "insert_after": "enable_register_contact",
    "module": "Logbook",
    "name": "API Service-section_logbook"
  },
  {
    "default": "0",
    "description": "Allow creating Logbook Entries via this API service",
    "doctype": "Custom Field",
    "dt": "API Service",
    "fieldname": "enable_create_logbook_entry",
    "fieldtype": "Check",
    "label": "Enable Create Logbook Entry",
    "insert_after": "section_logbook",
    "module": "Logbook",
    "name": "API Service-enable_create_logbook_entry"
  },
  {
    "depends_on": "eval:doc.enable_create_logbook_entry",
    "description": "User availability for automatic assignment",
    "doctype": "Custom Field",
    "dt": "API Service",
    "fieldname": "api_logbook_availability",
    "fieldtype": "Link",
    "options": "Logbook Availability",
    "label": "Logbook Availability",
    "insert_after": "enable_create_logbook_entry",
    "mandatory_depends_on": "eval:doc.enable_create_logbook_entry",
    "module": "Logbook",
    "name": "API Service-api_logbook_availability"
  }
]
```

### Paso 2: Declarar en hooks

```python
# logbook/hooks.py
fixtures = [
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "API Service-section_logbook",
            "API Service-enable_create_logbook_entry",
            "API Service-api_logbook_availability",
        ]]],
    },
]
```

### Paso 3: Crear el endpoint usando `@require_api_key`

```python
# logbook/api/external_endpoints.py
import frappe
from frappe import _
from common_configurations.api.shared import require_api_key

@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_api_key("enable_create_logbook_entry")
def create_logbook_entry(data):
    service = frappe.local.api_service
    service_doc = frappe.get_doc("API Service", service["service_name"])

    # Leer config desde custom fields
    availability = service_doc.api_logbook_availability

    # Lógica de negocio
    entry = frappe.get_doc({
        "doctype": "Logbook Entry",
        "availability": availability,
        # ... etc
        **data,
    })
    entry.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"name": entry.name}
```

---

## Apps actualmente extendiendo el sistema

### `logbook`

| Custom Field | Función |
|--------------|---------|
| `enable_create_logbook_entry` | Habilita endpoint para crear bitácoras vía API |
| `api_logbook_availability` | Disponibilidad por defecto para asignación |

### `lex_app`

| Custom Field | Función |
|--------------|---------|
| `enable_create_case_log` | Habilita endpoint para crear case logs |
| `lawyer_availability` | Asignación automática de abogado |
| `default_case_type` | Tipo de caso por defecto |
| `default_legal_area` | Área legal por defecto |

---

## Diferencias clave vs autenticación por token de User Contact

| Aspecto | API Key (este sistema) | User Contact Token |
|---------|------------------------|---------------------|
| **Para qué** | Sistemas externos (S2S) | Usuarios humanos en portal |
| **Cómo se genera** | Admin crea API Service | Sistema en login/registro |
| **Header** | `X-API-Key` | `X-User-Contact-Token` |
| **Expiración** | Nunca (manual via `is_active`) | 30 días auto |
| **Almacenamiento** | Plain text en `tabAPI Service Key` | SHA-256 hash en `auth_token_hash` |
| **Rate limit** | Por servicio (compartido entre keys) | Por IP (default 10-30 req/min) |
| **Permisos granulares** | Sí (Check fields `enable_X`) | No (todos los tokens son iguales) |
| **Múltiples keys activas** | Sí (rotación sin downtime) | No (1 por usuario) |
| **Rotación** | Crear nueva, marcar vieja `is_active=0` | Solo regenerar (invalida la anterior) |

---

## Referencias cruzadas

- [../doctypes/API_SERVICE.md](../doctypes/API_SERVICE.md) — DocTypes y custom fields.
- [../api/EXTERNAL.md](../api/EXTERNAL.md) — Endpoints HTTP del sistema.
- [../api/SHARED.md](../api/SHARED.md) — `api_key.py`: middleware.
- [USER_CONTACT_AUTH.md](USER_CONTACT_AUTH.md) — Sistema alternativo para usuarios humanos.
