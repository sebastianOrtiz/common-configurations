# CLAUDE.md - Common Configurations App

## Descripción General

**Common Configurations** es una aplicación de Frappe Framework que proporciona configuraciones compartidas, componentes de UI (Service Portal), y utilidades de seguridad para otras aplicaciones del ecosistema.

**Autor**: Sebastian Ortiz Valencia (sebastianortiz989@gmail.com)
**Licencia**: MIT
**Framework**: Frappe Framework (Python + JavaScript + Angular)
**Versión Python**: >= 3.10

### Propósito

La aplicación proporciona:
1. **Service Portal**: Interfaz de usuario pública para que ciudadanos accedan a servicios (Angular SPA)
2. **User Contact**: DocType para gestionar contactos de usuarios públicos (guest users)
3. **API Compartida**: Utilidades de seguridad, validación y autenticación por token
4. **Configuraciones**: DocTypes para configurar portales y herramientas

---

## Arquitectura de DocTypes

### 1. Service Portal
**Propósito**: Configuración de un portal público de servicios.

**Campos principales**:
- `portal_name` (Data, unique): Identificador del portal
- `title` (Data): Título visible
- `description` (Text): Descripción del portal
- `is_active` (Check): Si el portal está activo
- `logo` (Attach Image): Logo del portal
- `primary_color` / `secondary_color` (Color): Colores del tema
- `registration_title` / `registration_description`: Textos para registro
- `custom_css` (Code): CSS personalizado
- `tools` (Table → Portal Tool): Herramientas disponibles

### 2. Portal Tool (Child DocType)
**Propósito**: Define una herramienta/servicio disponible en el portal.

**Campos principales**:
- `tool_type` (Select): meet-scheduling, my-appointments, my-cases
- `label` (Data): Nombre visible
- `tool_description` (Text): Descripción de la herramienta
- `icon` (Data): Icono (Material Icons)
- `button_color` (Color): Color del botón
- `display_order` (Int): Orden de visualización
- `is_enabled` (Check): Si está habilitada
- `calendar_resource` (Link): Para herramientas de agendamiento

### 3. User Contact
**Propósito**: Representa un usuario público (guest) que interactúa con el portal.

**Campos principales**:
- `full_name` (Data): Nombre completo
- `document_type` (Select): Tipo de documento (Cedula, NIT, etc.)
- `document` (Data): Número de documento
- `phone_number` (Data): Teléfono
- `email` (Data): Correo electrónico
- `gender` (Select): Género
- `auth_token_hash` (Password): Hash del token de autenticación
- `token_created_at` (Datetime): Fecha de creación del token

**Autenticación**:
- Los User Contacts se autentican mediante tokens
- El token se envía en el header `X-User-Contact-Token`
- El hash del token se almacena en `auth_token_hash`
- Los tokens expiran después de 30 días

---

## Arquitectura de la API

### Principios de Diseño

La API sigue principios SOLID y KISS:

1. **Single Responsibility**: Cada módulo tiene una sola razón para cambiar
2. **Open/Closed**: Agregar dominio = nueva carpeta, no modificar existentes
3. **Dependency Inversion**: Endpoints dependen de services, no de implementación
4. **KISS**: Solo 3-4 archivos por dominio, sin abstracciones excesivas

### Estructura de Carpetas

```
api/
├── __init__.py              # Re-exports para compatibilidad
├── contacts/                # Dominio: User Contact
│   ├── __init__.py          # Exporta endpoints públicos
│   ├── endpoints.py         # @frappe.whitelist() - Solo routing
│   ├── service.py           # Lógica de negocio (stateless)
│   └── validators.py        # Validación específica del dominio
├── portals/                 # Dominio: Service Portal
│   ├── __init__.py
│   ├── endpoints.py
│   └── service.py
├── auth/                    # Dominio: Autenticación
│   ├── __init__.py
│   ├── endpoints.py
│   └── service.py
├── shared/                  # Utilidades compartidas
│   ├── __init__.py          # Re-exporta todo
│   ├── security.py          # Auth, tokens, honeypot
│   ├── rate_limit.py        # Rate limiting por IP
│   ├── validators.py        # Validadores genéricos
│   └── exceptions.py        # Excepciones custom
├── portal_api.py            # Legacy - re-exporta endpoints
└── security.py              # Legacy - re-exporta utilidades
```

### Capas de la Arquitectura

#### 1. Endpoints (endpoints.py)
**Responsabilidad**: HTTP concerns (request/response, auth checks, rate limiting)

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def create_user_contact(data, honeypot: str = None):
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("create_contact", limit=20, seconds=60)

    # Parse and validate
    validated_data = parse_contact_data(data)

    # Delegate to service
    return ContactService.create(validated_data)
```

#### 2. Service (service.py)
**Responsabilidad**: Lógica de negocio pura, sin dependencias HTTP

```python
class ContactService:
    @classmethod
    def create(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        # Check duplicates
        if frappe.db.exists("User contact", {"document": data["document"]}):
            frappe.throw(_("Document already exists"))

        # Create document
        doc = frappe.get_doc({"doctype": "User contact", **data})
        doc.insert(ignore_permissions=True)

        # Generate token
        auth_token = create_user_contact_token(doc.name)
        frappe.db.commit()

        return {**doc.as_dict(), "auth_token": auth_token}
```

#### 3. Validators (validators.py)
**Responsabilidad**: Validación y transformación de input

```python
def validate_user_contact_data(data: Dict[str, Any]) -> Dict[str, Any]:
    validated = {}

    if "full_name" in data:
        validated["full_name"] = validate_name(data["full_name"])

    if "email" in data:
        validated["email"] = validate_email(data["email"])

    return validated
```

#### 4. Shared (shared/)
**Responsabilidad**: Utilidades reutilizables

- `rate_limit.py`: `check_rate_limit()`, `get_client_ip()`
- `security.py`: `check_honeypot()`, `create_user_contact_token()`, `get_current_user_contact()`
- `validators.py`: `sanitize_string()`, `validate_email()`, `validate_phone()`
- `exceptions.py`: `APIError`, `ValidationError`, `AuthenticationError`

### Uso de la API

#### Nuevo estilo (recomendado)
```javascript
// Importar desde el dominio
frappe.call({
    method: "common_configurations.api.contacts.get_user_contact_by_document",
    args: { document: "123456789" }
});
```

#### Estilo legacy (compatible)
```javascript
// Importar desde portal_api (re-exporta)
frappe.call({
    method: "common_configurations.api.portal_api.get_user_contact_by_document",
    args: { document: "123456789" }
});
```

### Autenticación por Token

Los endpoints protegidos requieren el header `X-User-Contact-Token`:

```javascript
frappe.call({
    method: "meet_scheduling.api.appointments.get_my_appointments",
    headers: {
        "X-User-Contact-Token": "your-auth-token-here"
    }
});
```

En el backend, usar el decorador `@require_user_contact()`:

```python
@frappe.whitelist(allow_guest=True)
@require_user_contact()
def get_my_data():
    user_contact = frappe.local.user_contact  # Disponible después de validación
    return {"user": user_contact}
```

---

## Service Portal (Angular SPA)

### Ubicación
```
front_apps/service-portal/
├── src/
│   ├── app/
│   │   ├── core/           # Servicios, guards, interceptors
│   │   ├── features/       # Componentes de páginas
│   │   └── shared/         # Componentes compartidos
│   └── assets/
└── angular.json
```

### Servicios Principales

- `FrappeApiService`: Comunicación con Frappe API
- `StateService`: Estado global (signals)
- `PortalService`: Operaciones del portal
- `MeetSchedulingService`: Operaciones de citas

### Build y Deploy

```bash
cd front_apps/service-portal
npm install
npm run build  # Output: common_configurations/public/service-portal/
```

---

## Reglas de Desarrollo

### Al crear nuevos endpoints

1. **Crear en el dominio correspondiente** (o crear nuevo dominio)
2. **Endpoint solo hace**: rate limit → honeypot → validate → delegate to service
3. **Service contiene**: lógica de negocio, queries, commits
4. **Validator contiene**: parsing, sanitización, validación de formato

### Al agregar utilidades compartidas

1. **Agregar en `api/shared/`** el módulo correspondiente
2. **Re-exportar en `api/shared/__init__.py`**
3. **Documentar** con docstrings claros

### Al crear APIs para otras apps

Otras apps (como `meet_scheduling`) deben:

```python
# Importar utilidades desde common_configurations
from common_configurations.api.shared import (
    check_rate_limit,
    check_honeypot,
    get_current_user_contact,
    sanitize_string,
)
```

---

## Convenciones de Código

### Python

- **Type hints obligatorios** en todas las funciones
- **Docstrings** en funciones públicas
- **Formato**: ruff (black compatible)

```python
def validate_email(email: str) -> Optional[str]:
    """
    Validate email format.

    Args:
        email: Email address to validate

    Returns:
        Validated email (lowercase) or None if empty

    Raises:
        frappe.ValidationError: If format is invalid
    """
    pass
```

### TypeScript/Angular

- **Signals** para estado reactivo
- **Standalone components** preferidos
- **RxJS** para operaciones asíncronas

---

## Testing

### Unit Tests (Python)
```bash
bench --site [site] run-tests --app common_configurations
```

### Angular Tests
```bash
cd front_apps/service-portal
npm test
```

---

## Seguridad

### Protecciones Implementadas

1. **Rate Limiting**: Por IP, configurable por endpoint
2. **Honeypot**: Campo oculto para detectar bots
3. **Input Sanitization**: Todos los inputs son validados
4. **Token Authentication**: SHA-256 hash, 30 días de expiración
5. **CSRF Protection**: Token requerido para POST

### Campos Sensibles

- `auth_token_hash` en User Contact tiene `permlevel: 1`
- Solo System Manager puede ver/editar tokens

---

## Contacto

**Desarrollador**: Sebastian Ortiz Valencia
**Email**: sebastianortiz989@gmail.com
**Licencia**: MIT

---

**Última actualización**: 2026-01-27
