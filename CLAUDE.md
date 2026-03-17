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
├── __init__.py              # Re-exports para conveniencia
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
└── shared/                  # Utilidades compartidas
    ├── __init__.py          # Re-exporta todo
    ├── security.py          # Auth, tokens, honeypot
    ├── rate_limit.py        # Rate limiting por IP
    ├── validators.py        # Validadores genéricos
    └── exceptions.py        # Excepciones custom
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

```javascript
// Contacts domain
frappe.call({
    method: "common_configurations.api.contacts.get_user_contact_by_document",
    args: { document: "123456789" }
});

// Portals domain
frappe.call({
    method: "common_configurations.api.portals.get_portal",
    args: { portal_name: "main-portal" }
});

// Auth domain
frappe.call({
    method: "common_configurations.api.auth.get_csrf_token"
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

## Guía: Cómo Crear una Tool del Service Portal desde otra App

El Service Portal usa un sistema extensible de **Tools** (herramientas). Cada app externa puede registrar sus propios tipos de herramienta sin modificar `common_configurations`. Esta guía documenta el proceso completo.

### Arquitectura del Sistema de Tools

```
common_configurations (define la infraestructura)
├── DocType: Tool Type          → Catálogo de tipos de herramienta
├── DocType: Service Portal Tool → Child table del portal (config por instancia)
└── Angular: tool-router        → Carga dinámica de componentes

app_externa (registra sus tools)
├── Fixture: tool_type.json     → Registra tipo(s) de herramienta
├── Fixture: custom_field.json  → Agrega campos de config al Service Portal Tool
├── hooks.py                    → Declara fixtures para sync
├── install.py (opcional)       → Crea custom fields en instalación
├── API endpoint                → Backend de la herramienta
└── Angular component           → Frontend de la herramienta
```

### Paso 1: Registrar el Tool Type (Fixture)

El **Tool Type** es el catálogo que le dice al portal qué tipos de herramienta existen. Cada app registra los suyos.

**Archivo**: `tu_app/fixtures/tool_type.json`

```json
[
  {
    "doctype": "Tool Type",
    "name": "mi_herramienta",
    "tool_name": "mi_herramienta",
    "tool_label": "Mi Herramienta",
    "app_name": "tu_app",
    "icon": "IconName",
    "description": "Descripción de lo que hace la herramienta",
    "is_active": 1
  }
]
```

**Campos del Tool Type**:
- `name` / `tool_name`: Identificador único (snake_case, sin espacios)
- `tool_label`: Nombre visible para el admin
- `app_name`: Nombre de tu app Frappe (debe coincidir con el nombre del paquete)
- `icon`: Nombre del icono Lucide (Calendar, FilePlus, ClipboardList, etc.)
- `description`: Texto descriptivo
- `is_active`: 1 para activo

**Convención de nombres**: Usar snake_case consistente. Ejemplos: `meet_scheduling`, `my_appointments`, `create_logbook`, `my_logbook`.

### Paso 2: Agregar Custom Fields al Service Portal Tool (Fixture)

Cuando tu herramienta necesita configuración adicional (ej: qué recurso de calendario usar, qué disponibilidad asignar), se agregan **Custom Fields** al DocType `Service Portal Tool`.

**Archivo**: `tu_app/fixtures/custom_field.json`

```json
[
  {
    "doctype": "Custom Field",
    "name": "Service Portal Tool-mi_campo",
    "dt": "Service Portal Tool",
    "fieldname": "mi_campo",
    "fieldtype": "Link",
    "options": "Mi DocType",
    "label": "Mi Campo",
    "description": "Descripción del campo",
    "insert_after": "is_enabled",
    "depends_on": "eval:doc.tool_type=='mi_herramienta'",
    "mandatory_depends_on": "eval:doc.tool_type=='mi_herramienta'",
    "module": "Tu App"
  }
]
```

**Puntos clave**:
- `name`: Formato `{DocType}-{fieldname}` → `Service Portal Tool-mi_campo`
- `dt`: Siempre `"Service Portal Tool"`
- `depends_on`: Hace visible el campo SOLO cuando `tool_type` coincide con tu herramienta
- `mandatory_depends_on`: Lo hace obligatorio SOLO para tu tipo de herramienta
- `insert_after`: Generalmente `"is_enabled"` o después de otro campo existente

**Ejemplos reales**:

| App | Campo | Tipo | Visible cuando |
|-----|-------|------|----------------|
| meet_scheduling | `calendar_resource` | Link → Calendar Resource | `tool_type=='meet_scheduling'` |
| logbook | `logbook_availability` | Link → Logbook Availability | `tool_type=='create_logbook'` |

### Paso 3: Registrar Fixtures en hooks.py

Declarar las fixtures en `hooks.py` para que Frappe las sincronice con `bench migrate`.

```python
# hooks.py
fixtures = [
    # Roles de la app (si aplica)
    {
        "dt": "Role",
        "filters": [["name", "in", ["Mi Rol Manager", "Mi Rol User"]]],
    },
    # Tool Types registrados por esta app
    {
        "dt": "Tool Type",
        "filters": [["app_name", "=", "tu_app"]],
    },
    # Custom Fields agregados por esta app
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "Service Portal Tool-mi_campo",
            "Otro DocType-otro_campo",
        ]]],
    },
]
```

**Nota sobre filtros de Tool Type**: Usar `["app_name", "=", "tu_app"]` filtra automáticamente todos los tool types de tu app, sin necesidad de listarlos uno por uno.

### Paso 4: Crear Custom Fields en install.py (Opcional pero Recomendado)

El `install.py` crea los custom fields al instalar la app por primera vez, sin esperar a un `bench migrate`.

**Archivo**: `tu_app/install.py`

```python
import frappe

def after_install():
    install_custom_fields()

def install_custom_fields():
    """Create custom fields on Service Portal Tool if they don't exist."""
    if not frappe.db.exists("Custom Field", "Service Portal Tool-mi_campo"):
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Service Portal Tool",
            "fieldname": "mi_campo",
            "fieldtype": "Link",
            "options": "Mi DocType",
            "label": "Mi Campo",
            "description": "Descripción del campo",
            "insert_after": "is_enabled",
            "depends_on": "eval:doc.tool_type=='mi_herramienta'",
            "mandatory_depends_on": "eval:doc.tool_type=='mi_herramienta'",
            "module": "Tu App",
        }).insert(ignore_permissions=True)

    frappe.db.commit()
```

**Registrar en hooks.py**:
```python
after_install = "tu_app.install.after_install"
```

### Paso 5: Crear el API Endpoint (Backend)

El endpoint procesa la acción de la herramienta. Patrón estándar:

```python
# tu_app/api/mi_api.py

import frappe
from frappe import _
from typing import Dict, Any, Optional

@frappe.whitelist(allow_guest=True, methods=["POST"])
def mi_endpoint(
    user_contact: str,
    # ... otros parámetros
    honeypot: Optional[str] = None,
) -> Dict[str, Any]:
    from common_configurations.api.shared import (
        check_rate_limit,
        check_honeypot,
        get_current_user_contact,
    )

    # 1. Seguridad
    check_rate_limit("mi_endpoint", limit=10, seconds=60)
    check_honeypot(honeypot)

    # 2. Autenticación
    authenticated_contact = get_current_user_contact()
    if not authenticated_contact:
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)
    if authenticated_contact != user_contact:
        frappe.throw(_("Not authorized"), frappe.PermissionError)

    # 3. Validación de inputs
    # ...

    # 4. Lógica de negocio
    # ...

    # 5. Retornar resultado
    return {"name": "...", "status": "..."}
```

### Paso 6: Crear el Componente Angular (Frontend)

#### 6.1 Estructura de archivos

```
front_apps/service-portal/src/app/features/tools/mi-herramienta/
├── mi-herramienta-tool.component.ts
├── mi-herramienta-tool.component.html
└── mi-herramienta-tool.component.scss
```

**Convención**: Directorio en kebab-case, clase en PascalCase + `ToolComponent`.

#### 6.2 Componente TypeScript

```typescript
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { StateService } from '../../../core/services/state.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-mi-herramienta-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './mi-herramienta-tool.component.html',
  styleUrls: ['./mi-herramienta-tool.component.scss']
})
export class MiHerramientaToolComponent implements OnInit {
  private http = inject(HttpClient);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Estado del portal
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // Estado UI
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;

    // Leer configuración del tool (custom fields)
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'mi_herramienta');

    if (tool && (tool as any).mi_campo) {
      // Guardar config...
    }
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }

  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }
}
```

**Patrones importantes**:
- Usar `signal()` para estado reactivo (no variables mutables)
- Inyectar servicios con `inject()` (no constructor)
- Leer config del tool desde `selectedPortal().tools` con `(tool as any).mi_campo` para custom fields
- Siempre manejar estado anónimo (`isAnonymousUser()`)

#### 6.3 Template HTML (patrones comunes)

```html
<div class="mi-herramienta-tool">
  <!-- Header con botón volver -->
  <div class="tool-header">
    <button class="btn-back" (click)="goBack()">
      <app-icon name="ChevronLeft" [size]="20" [strokeWidth]="2"></app-icon>
      Volver
    </button>
    <h1>Mi Herramienta</h1>
  </div>

  <!-- Estado: Usuario no autenticado -->
  @if (isAnonymousUser()) {
    <div class="auth-required-state">
      <h3>Acceso restringido</h3>
      <p>Para usar esta herramienta necesitas iniciar sesión.</p>
      <button class="btn-primary" (click)="goToRegistration()">
        Registrarse / Iniciar sesión
      </button>
    </div>
  }

  <!-- Estado: Error -->
  @if (!isAnonymousUser() && error()) {
    <div class="alert alert-error">
      <span>{{ error() }}</span>
      <button class="close-btn" (click)="error.set(null)">&times;</button>
    </div>
  }

  <!-- Contenido principal -->
  @if (!isAnonymousUser()) {
    <!-- Tu contenido aquí -->
  }
</div>
```

#### 6.4 Estilos SCSS

Reutilizar las clases CSS estándar del portal: `.tool-header`, `.btn-back`, `.btn-primary`, `.alert`, `.alert-error`, `.section-card`, `.auth-required-state`, `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-actions`, `.spinner`.

Consultar `meet-scheduling-tool.component.scss` como referencia completa de estilos.

### Paso 7: Registrar en el Tool Router

Agregar el case de lazy loading en el switch del tool-router.

**Archivo**: `front_apps/service-portal/src/app/features/tools/tool-router/tool-router.component.ts`

```typescript
// Dentro del switch(toolType)
case 'mi_herramienta':
  const miHerramienta = await import('../mi-herramienta/mi-herramienta-tool.component');
  ComponentClass = miHerramienta.MiHerramientaToolComponent;
  break;
```

**Nota**: El tool-router usa `ViewContainerRef.createComponent()` para instanciar el componente dinámicamente. Cada componente se lazy-loadea con `import()`.

### Resumen: Checklist para nueva Tool

| # | Acción | Archivo | App |
|---|--------|---------|-----|
| 1 | Crear fixture Tool Type | `fixtures/tool_type.json` | tu_app |
| 2 | Crear fixture Custom Field (si necesita config) | `fixtures/custom_field.json` | tu_app |
| 3 | Registrar fixtures en hooks | `hooks.py` | tu_app |
| 4 | Crear custom fields en install (opcional) | `install.py` | tu_app |
| 5 | Crear API endpoint | `api/mi_api.py` | tu_app |
| 6 | Crear componente Angular (.ts, .html, .scss) | `front_apps/.../tools/mi-herramienta/` | common_configurations |
| 7 | Agregar case en tool-router | `front_apps/.../tool-router/tool-router.component.ts` | common_configurations |

### Tools Existentes (referencia)

| Tool Type | App | Custom Fields en Service Portal Tool | Componente Angular |
|-----------|-----|--------------------------------------|-------------------|
| `meet_scheduling` | meet_scheduling | `calendar_resource` (Link → Calendar Resource) | `meet-scheduling/` |
| `my_appointments` | meet_scheduling | ninguno | `my-appointments/` |
| `my_cases` | lex_app | ninguno | `my-cases/` |
| `my_logbook` | logbook | ninguno | `my-logbook/` |
| `create_logbook` | logbook | `logbook_availability` (Link → Logbook Availability) | `create-logbook/` |
| `portal_redirect` | common_configurations | ninguno | N/A (redirect) |
| `portal_quick_links` | common_configurations | ninguno | `portal-quick-links/` |

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

**Última actualización**: 2026-03-17
