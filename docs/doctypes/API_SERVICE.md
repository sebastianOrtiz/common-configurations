# DocTypes: API Service y API Service Key

Documentación de los DocTypes que implementan el sistema de **autenticación por API Key** para integraciones externas (chatbots de WhatsApp, apps móviles, etc.).

---

## API Service (DocType padre)

**Nombre interno:** `API Service`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/api_service/api_service.json`
**Ruta controlador:** `common_configurations/common_configurations/doctype/api_service/api_service.py`
**Auto-naming:** `format:APIS-{YYYY}-{#####}` (ej. `APIS-2026-00001`)
**Title field:** `title`
**Track changes:** 1

### Propósito

`API Service` define una **integración externa** autorizada para consumir endpoints públicos vía API Key. Por ejemplo:

- "WhatsApp Chatbot Producción"
- "Mobile App iOS"
- "CRM Integration"

Cada servicio tiene:

1. Una tabla de keys activas (`api_keys` → `API Service Key`).
2. Un rate limit propio (req/min).
3. Una lista de **endpoints habilitados** (campos Check). Cada endpoint público (`enable_lookup_contact`, `enable_register_contact`, etc.) se autoriza explícitamente.

### Campos

#### Sección: Basic Information

##### `title`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Title |
| `reqd` | 1 |
| `in_list_view` | 1 |

Nombre descriptivo (ej. "WhatsApp Chatbot").

##### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |
| `in_list_view` | 1 |

Solo los servicios activos aceptan requests. Si está apagado, `authenticate_api_key()` devuelve 401.

##### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |

Descripción del servicio.

#### Sección: Authentication

##### `api_keys`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Table |
| `options` | `API Service Key` |
| `label` | API Keys |

Tabla hija con las API keys autorizadas (rotación de keys, múltiples ambientes).

##### `rate_limit`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `label` | Rate Limit (req/min) |
| `default` | 60 |

Máximo de requests por minuto **por servicio** (suma de todas sus keys). Implementado vía `check_rate_limit(f"api_service:{service_name}", limit=rate_limit, seconds=60)`.

#### Sección: Enabled Endpoints

##### `enable_lookup_contact`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Enable Lookup Contact |
| `default` | 0 |

Si está marcado, permite usar `common_configurations.api.external.lookup_contact`. La verificación se hace en el decorador `@require_api_key("enable_lookup_contact")`.

##### `enable_register_contact`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Enable Register Contact |
| `default` | 0 |

Si está marcado, permite usar `common_configurations.api.external.register_contact`.

### Permisos

| Rol | create | read | write | delete | export |
|-----|--------|------|-------|--------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 |

Solo System Manager. Los API Service contienen credenciales sensibles.

### Controlador Python

`api_service.py`:

```python
import secrets
import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class APIService(Document):
    def validate(self):
        self._generate_keys_for_new_rows()

    def _generate_keys_for_new_rows(self):
        """Generate API keys for newly added rows that don't have one yet."""
        for key_row in self.api_keys:
            if not key_row.api_key:
                key_row.api_key = secrets.token_hex(32)
                key_row.created_at = now_datetime()
```

**Generación automática de keys:** al guardar el documento, cualquier fila de `api_keys` que no tenga `api_key` recibe automáticamente un valor `secrets.token_hex(32)` (64 chars hex = 256 bits de entropía) y un `created_at`.

---

## Custom fields que agregan otras apps

`API Service` está diseñado para ser extendido por otras apps. Cada app que ofrece endpoints externos agrega:

1. Un Section Break propio (ej. "Logbook Configuration").
2. Una o varias Checks `enable_<accion>`.
3. Campos de configuración por defecto (Link, Select, etc.) que se aplican cuando ese endpoint se invoca.

### Por `logbook`

Fixture: `apps/logbook/logbook/fixtures/custom_field.json`

| Custom Field | Tipo | Función |
|--------------|------|---------|
| `API Service-section_logbook` | Section Break | Encabezado "Logbook Configuration", `insert_after: enable_register_contact` |
| `API Service-enable_create_logbook_entry` | Check | Habilita endpoint para crear bitácoras vía API |
| `API Service-api_logbook_availability` | Link → `Logbook Availability` | Disponibilidad usada para asignación automática (visible si `enable_create_logbook_entry`) |

### Por `lex_app`

Fixture: `apps/lex_app/lex_app/fixtures/custom_field.json`

| Custom Field | Tipo | Función |
|--------------|------|---------|
| `API Service-section_case_log` | Section Break | Encabezado "Case Log Configuration", `insert_after: enable_register_contact` |
| `API Service-enable_create_case_log` | Check | Habilita endpoint para crear case logs vía API |
| `API Service-lawyer_availability` | Link → `Lawyer Availability` | Asignación automática de abogado |
| `API Service-default_case_type` | Select | Tipo de caso por defecto (Consultation, Lawsuit, ...) |
| `API Service-default_legal_area` | Select | Área legal por defecto (Civil, Criminal, ...) |

---

## API Service Key (DocType child)

**Nombre interno:** `API Service Key`
**Tipo:** Child DocType (`istable: 1`)
**Ruta JSON:** `common_configurations/common_configurations/doctype/api_service_key/api_service_key.json`
**Naming rule:** Random

### Campos

#### `key_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Key Name |
| `reqd` | 1 |
| `in_list_view` | 1 |

Nombre descriptivo (ej. "Production", "Testing", "iOS").

#### `api_key`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | API Key |
| `read_only` | 1 |
| `in_list_view` | 1 |

La key en sí (64 chars hex). Generada automáticamente por `APIService.validate()` con `secrets.token_hex(32)`.

> **Importante:** la documentación del campo indica "Copy it when created, it cannot be retrieved later". Sin embargo el campo es `Data` (no encriptado), por lo que **sí puede leerse desde el desk** si el admin accede al documento. La advertencia aplica más a integradores externos que reciben la key por correo/Slack.

#### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |
| `in_list_view` | 1 |

Una key inactiva no autentica (sirve para revocar keys sin borrarlas).

#### `created_at`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Datetime |
| `label` | Created At |
| `read_only` | 1 |

Fecha en la que se generó automáticamente la key.

### Controlador

`api_service_key.py`:

```python
from frappe.model.document import Document


class APIServiceKey(Document):
    pass
```

---

## Hash y validación

A diferencia de los tokens de User Contact (que sí se hashean), las API keys **se almacenan en claro** en la tabla `tabAPI Service Key`. Esta es una decisión consciente:

- Son keys de servicio (no de usuario), gestionadas por administradores
- Se necesitan en claro para el campo `read_only` del desk (para mostrarlas al admin que las creó)
- La protección viene del `permlevel` y la restricción de acceso solo a `System Manager`

Validación del request (`api/shared/api_key.py:81-118`):

```python
def authenticate_api_key() -> Dict[str, Any]:
    api_key = get_api_key_from_request()    # Lee X-API-Key header o ?api_key=

    if not api_key:
        frappe.throw("API key is required. Send it via X-API-Key header.",
                     frappe.AuthenticationError)

    service_info = get_api_service_from_key(api_key)
    if not service_info:
        frappe.throw("Invalid or inactive API key.", frappe.AuthenticationError)

    # Aplica rate limit por servicio
    check_rate_limit(
        f"api_service:{service_info['service_name']}",
        limit=service_info["rate_limit"],
        seconds=60,
    )

    return service_info
```

El lookup busca primero la key en `API Service Key` (con `is_active=1`) y luego asegura que el `API Service` padre esté `is_active=1`.

---

## Referencias cruzadas

- [../api/EXTERNAL.md](../api/EXTERNAL.md) — Endpoints HTTP que usan API Key.
- [../api/SHARED.md](../api/SHARED.md) — `api_key.py`: `require_api_key`, `authenticate_api_key`.
- [../features/API_KEY_SYSTEM.md](../features/API_KEY_SYSTEM.md) — Visión completa del sistema, diagramas y flujo.
