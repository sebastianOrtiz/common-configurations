# How to Create a Service Portal Tool

Guia paso a paso para crear una nueva herramienta (Tool) del Service Portal desde cualquier app externa del ecosistema Frappe.

---

## Tabla de Contenido

1. [Resumen](#1-resumen)
2. [Arquitectura del Sistema de Tools](#2-arquitectura-del-sistema-de-tools)
3. [Paso 1: Registrar el Tool Type (Fixture)](#3-paso-1-registrar-el-tool-type-fixture)
4. [Paso 2: Agregar Custom Fields (Fixture)](#4-paso-2-agregar-custom-fields-fixture)
5. [Paso 3: Registrar Fixtures en hooks.py](#5-paso-3-registrar-fixtures-en-hookspy)
6. [Paso 4: Crear Custom Fields en install.py](#6-paso-4-crear-custom-fields-en-installpy)
7. [Paso 5: Crear el API Endpoint (Backend)](#7-paso-5-crear-el-api-endpoint-backend)
8. [Paso 6: Crear el Componente Angular (Frontend)](#8-paso-6-crear-el-componente-angular-frontend)
9. [Paso 7: Registrar en el Tool Router](#9-paso-7-registrar-en-el-tool-router)
10. [Checklist Rapido](#10-checklist-rapido)
11. [Tools Existentes (Referencia)](#11-tools-existentes-referencia)
12. [Ejemplos Reales](#12-ejemplos-reales)

---

## 1. Resumen

El Service Portal usa un sistema extensible de **Tools**. Cada app Frappe puede registrar sus propios tipos de herramienta sin modificar el codigo de `common_configurations`. El sistema se basa en:

- **Tool Type**: Catalogo maestro de herramientas disponibles (fixture por app)
- **Service Portal Tool**: Child table del portal donde el admin configura cada herramienta
- **Custom Fields**: Campos de configuracion especificos por tipo de herramienta
- **Angular Component**: Componente frontend que implementa la UI de la herramienta
- **Tool Router**: Switch de lazy-loading que carga el componente segun el `tool_type`

---

## 2. Arquitectura del Sistema de Tools

```
common_configurations (infraestructura base)
├── DocType: Tool Type              -> Catalogo de tipos de herramienta
├── DocType: Service Portal Tool    -> Child table del portal (config por instancia)
├── DocType: Service Portal         -> Configuracion principal del portal
└── Angular: tool-router            -> Carga dinamica de componentes

tu_app (registra sus tools)
├── Fixture: tool_type.json         -> Registra tipo(s) de herramienta
├── Fixture: custom_field.json      -> Agrega campos de config al Service Portal Tool
├── hooks.py                        -> Declara fixtures para sync con bench migrate
├── install.py (opcional)           -> Crea custom fields en instalacion
├── API endpoint                    -> Backend de la herramienta
└── Angular component (en common_configurations/front_apps)
    └── service-portal/src/app/features/tools/mi-tool/
        ├── mi-tool.component.ts
        ├── mi-tool.component.html
        └── mi-tool.component.scss
```

### Flujo completo

```
Admin configura portal:
  1. Agrega tool "mi_herramienta" al Service Portal
  2. Llena campos de config (custom fields visibles segun tool_type)

Usuario en el portal:
  1. Ve tarjeta/boton de la herramienta
  2. Click -> tool-router carga el componente Angular
  3. Componente lee config del tool (custom fields)
  4. Componente interactua con API endpoint de tu_app
  5. Resultado se muestra al usuario
```

---

## 3. Paso 1: Registrar el Tool Type (Fixture)

El **Tool Type** le dice al portal que tipos de herramienta existen. Cada app registra los suyos via fixtures.

### Archivo

`tu_app/fixtures/tool_type.json`

### Formato

```json
[
  {
    "doctype": "Tool Type",
    "name": "mi_herramienta",
    "tool_name": "mi_herramienta",
    "tool_label": "Mi Herramienta",
    "app_name": "tu_app",
    "icon": "IconName",
    "description": "Descripcion de lo que hace la herramienta",
    "is_active": 1
  }
]
```

### Campos

| Campo | Tipo | Descripcion | Ejemplo |
|-------|------|-------------|---------|
| `name` | Data | Igual que `tool_name` | `"create_logbook"` |
| `tool_name` | Data | Identificador unico, snake_case | `"create_logbook"` |
| `tool_label` | Data | Nombre visible para el admin | `"Crear Bitacora"` |
| `app_name` | Data | Nombre del paquete Frappe de tu app | `"logbook"` |
| `icon` | Data | Nombre del icono Lucide | `"FilePlus"` |
| `description` | Small Text | Texto descriptivo | `"Permite crear una entrada..."` |
| `is_active` | Check | 1 = disponible, 0 = desactivado | `1` |

### Convenciones

- **tool_name**: Siempre `snake_case`. Ejemplos: `meet_scheduling`, `my_appointments`, `create_logbook`
- **icon**: Nombres de [Lucide Icons](https://lucide.dev). Ejemplos: `Calendar`, `FilePlus`, `ClipboardList`, `ExternalLink`, `Link`
- **app_name**: Debe coincidir exactamente con el nombre del paquete Python de tu app

### Multiples tools por app

Una app puede registrar multiples Tool Types en el mismo archivo:

```json
[
  {
    "doctype": "Tool Type",
    "name": "my_logbook",
    "tool_name": "my_logbook",
    "tool_label": "Mi Bitacora",
    "app_name": "logbook",
    "icon": "ClipboardList",
    "description": "Visualiza y gestiona tus entradas de bitacora",
    "is_active": 1
  },
  {
    "doctype": "Tool Type",
    "name": "create_logbook",
    "tool_name": "create_logbook",
    "tool_label": "Crear Bitacora",
    "app_name": "logbook",
    "icon": "FilePlus",
    "description": "Permite crear una entrada de bitacora directamente",
    "is_active": 1
  }
]
```

---

## 4. Paso 2: Agregar Custom Fields (Fixture)

Cuando tu herramienta necesita configuracion adicional (ej: que recurso usar, que disponibilidad asignar), se agregan **Custom Fields** al DocType `Service Portal Tool`.

Los custom fields aparecen SOLO cuando el admin selecciona tu `tool_type`, gracias a `depends_on`.

### Archivo

`tu_app/fixtures/custom_field.json`

### Formato

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
    "description": "Descripcion del campo para el admin",
    "insert_after": "is_enabled",
    "depends_on": "eval:doc.tool_type=='mi_herramienta'",
    "mandatory_depends_on": "eval:doc.tool_type=='mi_herramienta'",
    "module": "Tu App"
  }
]
```

### Campos clave

| Campo | Descripcion | Valor |
|-------|-------------|-------|
| `name` | ID unico del custom field | `"Service Portal Tool-{fieldname}"` |
| `dt` | DocType donde se agrega | Siempre `"Service Portal Tool"` |
| `fieldname` | Nombre del campo (snake_case) | `"logbook_availability"` |
| `fieldtype` | Tipo de campo Frappe | `"Link"`, `"Data"`, `"Select"`, etc. |
| `options` | Opciones del campo (DocType para Link) | `"Logbook Availability"` |
| `label` | Etiqueta visible | `"Logbook Availability"` |
| `insert_after` | Campo despues del cual insertar | Generalmente `"is_enabled"` |
| `depends_on` | Condicion de visibilidad | `"eval:doc.tool_type=='mi_herramienta'"` |
| `mandatory_depends_on` | Condicion de obligatoriedad | `"eval:doc.tool_type=='mi_herramienta'"` |
| `module` | Modulo de tu app | `"Logbook"` |

### Importante

- `depends_on` hace que el campo sea **visible** SOLO cuando `tool_type` coincide con tu herramienta
- `mandatory_depends_on` lo hace **obligatorio** SOLO para tu tipo de herramienta
- El `name` sigue el formato `{DocType}-{fieldname}` (con guion, no underscore)
- Puedes agregar multiples custom fields en el mismo archivo JSON

### Cuando NO necesitas custom fields

Si tu herramienta no requiere configuracion adicional del admin (ej: solo muestra datos del usuario autenticado), no necesitas este paso. Ejemplos: `my_appointments`, `my_cases`, `my_logbook`.

---

## 5. Paso 3: Registrar Fixtures en hooks.py

Las fixtures se sincronizan con la base de datos al ejecutar `bench migrate`. Deben declararse en `hooks.py`.

### Archivo

`tu_app/hooks.py`

### Formato

```python
fixtures = [
    # Roles de la app (si los tienes)
    {
        "dt": "Role",
        "filters": [["name", "in", ["Mi App Manager", "Mi App User"]]],
    },
    # Tool Types registrados por esta app
    {
        "dt": "Tool Type",
        "filters": [["app_name", "=", "tu_app"]],
    },
    # Custom Fields agregados por esta app (si los tienes)
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "Service Portal Tool-mi_campo",
        ]]],
    },
]
```

### Notas

- **Tool Type**: El filtro `["app_name", "=", "tu_app"]` captura automaticamente todos los tool types de tu app sin listarlos uno a uno
- **Custom Field**: Listar explicitamente cada custom field por `name` para evitar exportar campos de otras apps
- Si tu app agrega custom fields a multiples DocTypes, listarlos todos:

```python
{
    "dt": "Custom Field",
    "filters": [["name", "in", [
        "Service Portal Tool-mi_campo",
        "Calendar Resource-otro_campo",
        "Calendar Resource-tercer_campo",
    ]]],
},
```

---

## 6. Paso 4: Crear Custom Fields en install.py

El `install.py` crea los custom fields **al instalar la app por primera vez**, sin esperar a `bench migrate`. Este paso es opcional pero recomendado.

### Archivo

`tu_app/install.py`

### Formato

```python
import frappe


def after_install():
    install_custom_fields()


def install_custom_fields():
    """Create custom fields on Service Portal Tool if they don't exist."""
    if not frappe.db.exists("Custom Field", "Service Portal Tool-mi_campo"):
        frappe.get_doc(
            {
                "doctype": "Custom Field",
                "dt": "Service Portal Tool",
                "fieldname": "mi_campo",
                "fieldtype": "Link",
                "options": "Mi DocType",
                "label": "Mi Campo",
                "description": "Descripcion del campo",
                "insert_after": "is_enabled",
                "depends_on": "eval:doc.tool_type=='mi_herramienta'",
                "mandatory_depends_on": "eval:doc.tool_type=='mi_herramienta'",
                "module": "Tu App",
            }
        ).insert(ignore_permissions=True)

    frappe.db.commit()
```

### Registrar en hooks.py

```python
# hooks.py
after_install = "tu_app.install.after_install"
```

### Cuando hay multiples custom fields

Repetir el patron `if not frappe.db.exists(...)` para cada campo. Ver `logbook/install.py` como ejemplo con 3 custom fields.

---

## 7. Paso 5: Crear el API Endpoint (Backend)

El endpoint procesa la logica de tu herramienta. Usa las utilidades compartidas de `common_configurations`.

### Archivo

`tu_app/api/mi_api.py` (o donde corresponda segun la estructura de tu app)

### Patron estandar para endpoints del portal

```python
import frappe
from frappe import _
from frappe.utils import today
from typing import Dict, Any, Optional


@frappe.whitelist(allow_guest=True, methods=["POST"])
def mi_endpoint(
    user_contact: str,
    param1: str,
    param2: str,
    honeypot: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Descripcion del endpoint.

    Requiere autenticacion via X-User-Contact-Token header.

    Args:
        user_contact: User Contact name
        param1: Descripcion del parametro
        param2: Descripcion del parametro
        honeypot: Anti-bot field (must be empty)

    Returns:
        dict: Resultado de la operacion
    """
    from common_configurations.api.shared import (
        check_rate_limit,
        check_honeypot,
        get_current_user_contact,
    )

    # 1. Seguridad
    check_rate_limit("mi_endpoint", limit=10, seconds=60)
    check_honeypot(honeypot)

    # 2. Autenticacion
    authenticated_contact = get_current_user_contact()
    if not authenticated_contact:
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)

    if authenticated_contact != user_contact:
        frappe.throw(_("Not authorized for this contact"), frappe.PermissionError)

    # 3. Validacion de inputs
    if not param1 or not param1.strip():
        frappe.throw(_("param1 is required"))

    if not frappe.db.exists("Some DocType", param2):
        frappe.throw(_("Configuration not found"))

    # 4. Logica de negocio
    try:
        doc = frappe.new_doc("Mi DocType")
        doc.user_contact = user_contact
        doc.field1 = param1.strip()
        # ... mas campos
        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        # 5. Retornar resultado
        return {
            "name": doc.name,
            "title": doc.title,
            "status": doc.status,
        }

    except Exception as e:
        frappe.log_error(f"Error in mi_endpoint: {str(e)}", "API Error")
        frappe.throw(_("Error processing request"))
```

### Utilidades compartidas disponibles

Importar desde `common_configurations.api.shared`:

| Funcion | Descripcion |
|---------|-------------|
| `check_rate_limit(key, limit, seconds)` | Rate limiting por IP |
| `check_honeypot(value)` | Validacion anti-bot |
| `get_current_user_contact()` | Obtiene User Contact del token en header |
| `sanitize_string(value)` | Sanitiza input de texto |
| `has_outgoing_email()` | Verifica si el sistema tiene email configurado |
| `send_email(recipients, subject, ...)` | Envia email con manejo de errores |

### Patron de seguridad (orden obligatorio)

1. Rate limit
2. Honeypot check
3. Token authentication
4. Input validation
5. Business logic

---

## 8. Paso 6: Crear el Componente Angular (Frontend)

Los componentes Angular de las tools viven en el proyecto del Service Portal dentro de `common_configurations`, incluso si la logica de negocio pertenece a otra app.

### Ubicacion

```
common_configurations/
  front_apps/
    service-portal/
      src/app/features/tools/
        mi-herramienta/                         <- Nueva carpeta
          mi-herramienta-tool.component.ts
          mi-herramienta-tool.component.html
          mi-herramienta-tool.component.scss
```

### Convenciones de nombres

| Elemento | Formato | Ejemplo |
|----------|---------|---------|
| Directorio | kebab-case | `create-logbook/` |
| Archivos | kebab-case + `-tool.component.{ext}` | `create-logbook-tool.component.ts` |
| Clase | PascalCase + `ToolComponent` | `CreateLogbookToolComponent` |
| Selector | `app-{kebab}-tool` | `app-create-logbook-tool` |

### 8.1 Componente TypeScript (.ts)

```typescript
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { StateService } from '../../../core/services/state.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
// Importar otros componentes compartidos segun necesidad:
// import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';

@Component({
  selector: 'app-mi-herramienta-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './mi-herramienta-tool.component.html',
  styleUrls: ['./mi-herramienta-tool.component.scss']
})
export class MiHerramientaToolComponent implements OnInit {
  // Inyeccion de dependencias
  private http = inject(HttpClient);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Estado del portal (signals del StateService)
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // Estado UI (signals locales)
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  // ... mas signals segun necesidad

  // Config leida del tool
  private miCampoConfig = '';

  ngOnInit(): void {
    // Si el usuario no esta autenticado, no hacer nada
    if (this.isAnonymousUser()) return;

    // Leer configuracion del tool (custom fields)
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'mi_herramienta');

    if (tool && (tool as any).mi_campo) {
      this.miCampoConfig = (tool as any).mi_campo;
    } else {
      this.error.set('Configuracion no encontrada');
    }
  }

  // Llamada al API
  submit(): void {
    const contact = this.userContact();
    if (!contact || !contact.name) {
      this.error.set('No se encontro informacion de contacto');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.http.post<{ message: any }>(
      '/api/method/tu_app.api.mi_api.mi_endpoint',
      {
        user_contact: contact.name,
        param1: 'valor',
        param2: this.miCampoConfig,
      }
    ).subscribe({
      next: (response) => {
        if (response?.message) {
          // Manejar respuesta exitosa
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error:', err);
        const message = err?.error?.message || err?.error?._server_messages;
        if (message) {
          try {
            const parsed = JSON.parse(message);
            this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Error');
          } catch {
            this.error.set(typeof message === 'string' ? message : 'Error');
          }
        } else {
          this.error.set('Error. Por favor intenta de nuevo.');
        }
        this.loading.set(false);
      }
    });
  }

  // Navegacion
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

### Patrones importantes del componente

| Patron | Descripcion |
|--------|-------------|
| `signal()` | Usar signals para todo el estado reactivo, NO variables mutables |
| `inject()` | Inyectar servicios con `inject()`, NO en constructor |
| `(tool as any).campo` | Acceder a custom fields del tool con cast a `any` |
| `isAnonymousUser()` | Siempre verificar si el usuario esta autenticado |
| `selectedPortal().tools` | Leer config del tool desde el portal |
| Error handling | Parsear `_server_messages` de Frappe como JSON |

### 8.2 Template HTML (.html)

Estructura base que toda tool debe seguir:

```html
<div class="mi-herramienta-tool">
  <!-- Header: Siempre presente con boton volver y titulo -->
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
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
      <h3>Acceso restringido</h3>
      <p>Para usar esta herramienta necesitas iniciar sesion o registrarte.</p>
      <button class="btn-primary" (click)="goToRegistration()">
        Registrarse / Iniciar sesion
      </button>
    </div>
  }

  <!-- Estado: Error -->
  @if (!isAnonymousUser() && error()) {
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{{ error() }}</span>
      <button class="close-btn" (click)="error.set(null)">&times;</button>
    </div>
  }

  <!-- Contenido principal: Solo si esta autenticado -->
  @if (!isAnonymousUser()) {
    <div class="form-container">
      <div class="section-card">
        <!-- Intro -->
        <div class="form-intro">
          <app-icon name="MiIcono" [size]="32" [strokeWidth]="1.5"></app-icon>
          <div>
            <h2>Titulo</h2>
            <p>Descripcion de la herramienta.</p>
          </div>
        </div>

        <!-- Campos del formulario -->
        <div class="form-group">
          <label for="campo1">Mi Campo</label>
          <!-- Inputs aqui -->
        </div>

        <!-- Boton de accion -->
        <div class="form-actions">
          <button
            class="btn-primary btn-submit"
            (click)="submit()"
            [disabled]="loading()"
          >
            @if (loading()) {
              <span class="spinner"></span>
              Procesando...
            } @else {
              <app-icon name="Check" [size]="18" [strokeWidth]="2"></app-icon>
              Enviar
            }
          </button>
        </div>
      </div>
    </div>
  }
</div>

<!-- Modal de confirmacion (opcional) -->
@if (showConfirmModal()) {
  <div class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-icon success">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2>Operacion Exitosa</h2>
        <p>Descripcion del resultado.</p>
      </div>

      <div class="modal-body">
        <!-- Detalles del resultado -->
        <div class="detail-row">
          <span class="detail-label">Campo</span>
          <span class="detail-value">Valor</span>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" (click)="closeModal()">
          Entendido
        </button>
      </div>
    </div>
  </div>
}
```

### 8.3 Estilos SCSS (.scss)

Reutilizar las clases CSS estandar del portal. Aqui estan las clases base:

```scss
.mi-herramienta-tool {
  max-width: 800px;  // Ajustar segun complejidad (800px simple, 1200px complejo)
  margin: 0 auto;
  padding: 2rem;
}

// ---- Header ----
.tool-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;

  .btn-back {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    color: #4a5568;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #f7fafc;
      border-color: #cbd5e0;
    }
  }

  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #1a202c;
    margin: 0;
  }
}

// ---- Alerts ----
.alert {
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;

  svg { width: 20px; height: 20px; flex-shrink: 0; }
  span { flex: 1; }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    opacity: 0.6;
    padding: 0;
    line-height: 1;
    &:hover { opacity: 1; }
  }
}

.alert-error {
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #feb2b2;
}

// ---- Form ----
.section-card {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.form-intro {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;

  app-icon { color: #667eea; flex-shrink: 0; margin-top: 0.25rem; }
  h2 { font-size: 1.5rem; font-weight: 700; color: #1a202c; margin: 0 0 0.25rem; }
  p { color: #718096; font-size: 0.95rem; margin: 0; line-height: 1.5; }
}

.form-group {
  margin-bottom: 1.5rem;

  label {
    display: block;
    font-weight: 600;
    color: #2d3748;
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
  }
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
}

// ---- Buttons ----
.btn-primary {
  background: #667eea;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #5568d3;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.7; cursor: not-allowed; }
}

.btn-submit { padding: 0.875rem 2rem; font-size: 1.05rem; }

// ---- Spinner ----
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

// ---- Modal ----
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-out;
  padding: 1rem;
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-content {
  background: white;
  border-radius: 1rem;
  max-width: 500px;
  width: 100%;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  text-align: center;
  padding: 2.5rem 2rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;

  .modal-icon {
    width: 64px; height: 64px;
    border-radius: 50%;
    margin: 0 auto 1rem;
    display: flex; align-items: center; justify-content: center;
    &.success { background: #f0fff4; color: #38a169; }
    svg { width: 36px; height: 36px; }
  }
  h2 { font-size: 1.5rem; font-weight: 700; color: #1a202c; margin: 0 0 0.5rem; }
  p { color: #718096; font-size: 1rem; margin: 0; }
}

.modal-body {
  padding: 2rem;

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f7fafc;
    &:last-child { border-bottom: none; }
  }
  .detail-label { font-size: 0.9rem; color: #718096; font-weight: 500; }
  .detail-value {
    font-size: 0.95rem; color: #2d3748; font-weight: 600;
    &.highlight { color: #667eea; font-size: 1rem; }
  }
}

.modal-actions {
  padding: 1.5rem 2rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: center;
}

// ---- Auth Required ----
.auth-required-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
  text-align: center;

  svg { width: 64px; height: 64px; color: #6366f1; }
  h3 { font-size: 1.5rem; font-weight: 600; color: #111827; margin: 0; }
  p { color: #6b7280; max-width: 400px; margin: 0; }
  .btn-primary { margin-top: 0.5rem; }
}

// ---- Responsive ----
@media (max-width: 768px) {
  .mi-herramienta-tool { padding: 1rem; }
  .tool-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    h1 { font-size: 1.5rem; }
  }
  .section-card { padding: 1.5rem; }
  .form-intro { flex-direction: column; text-align: center; align-items: center; }
  .form-actions { justify-content: center; }
  .btn-submit { width: 100%; }
  .modal-actions .btn-primary { width: 100%; }
}
```

### Paleta de colores del portal

| Uso | Color | Hex |
|-----|-------|-----|
| Primary / Accent | Indigo | `#667eea` |
| Primary Hover | Dark Indigo | `#5568d3` |
| Text Primary | Near Black | `#1a202c` |
| Text Secondary | Dark Gray | `#2d3748` |
| Text Muted | Medium Gray | `#718096` |
| Border | Light Gray | `#e2e8f0` |
| Background Card | White | `#ffffff` |
| Success | Green | `#38a169` |
| Success Background | Light Green | `#f0fff4` |
| Error | Red | `#c53030` |
| Error Background | Light Red | `#fff5f5` |

---

## 9. Paso 7: Registrar en el Tool Router

El Tool Router carga dinamicamente el componente Angular segun el `tool_type` de la URL.

### Archivo

```
front_apps/service-portal/src/app/features/tools/tool-router/tool-router.component.ts
```

### Agregar un case al switch

Dentro del metodo `loadToolComponent`, agregar un nuevo case:

```typescript
// Dentro del switch(toolType) { ... }

case 'mi_herramienta':
  const miHerramienta = await import('../mi-herramienta/mi-herramienta-tool.component');
  ComponentClass = miHerramienta.MiHerramientaToolComponent;
  console.log('[ToolRouter] Loaded mi_herramienta component:', ComponentClass);
  break;
```

### Patron

- `import()` usa ruta relativa desde `tool-router/` hacia tu directorio de tool
- La variable importada expone la clase del componente que se asigna a `ComponentClass`
- El `console.log` es opcional pero util para debugging
- El componente se instancia dinamicamente via `ViewContainerRef.createComponent()`

---

## 10. Checklist Rapido

Referencia rapida para crear una nueva tool:

| # | Que hacer | Archivo | App |
|---|-----------|---------|-----|
| 1 | Crear fixture Tool Type | `fixtures/tool_type.json` | tu_app |
| 2 | Crear fixture Custom Field (si necesita config) | `fixtures/custom_field.json` | tu_app |
| 3 | Registrar fixtures en hooks | `hooks.py` | tu_app |
| 4 | Crear custom fields en install (opcional) | `install.py` | tu_app |
| 5 | Crear API endpoint | `api/mi_api.py` | tu_app |
| 6 | Crear componente Angular (.ts, .html, .scss) | `front_apps/.../tools/mi-herramienta/` | common_configurations |
| 7 | Agregar case en tool-router | `front_apps/.../tool-router/tool-router.component.ts` | common_configurations |
| 8 | Build Angular | `cd front_apps/service-portal && npm run build` | common_configurations |
| 9 | Migrar BD | `bench migrate` | servidor |

---

## 11. Tools Existentes (Referencia)

| Tool Type | App | Custom Fields en Service Portal Tool | Componente Angular |
|-----------|-----|--------------------------------------|-------------------|
| `meet_scheduling` | meet_scheduling | `calendar_resource` (Link -> Calendar Resource) | `meet-scheduling/` |
| `my_appointments` | meet_scheduling | - | `my-appointments/` |
| `my_cases` | lex_app | - | `my-cases/` |
| `my_logbook` | logbook | - | `my-logbook/` |
| `create_logbook` | logbook | `logbook_availability` (Link -> Logbook Availability) | `create-logbook/` |
| `portal_redirect` | common_configurations | - | N/A (redirect) |
| `portal_quick_links` | common_configurations | - | `portal-quick-links/` |

---

## 12. Ejemplos Reales

### Ejemplo 1: meet_scheduling (con custom field)

Tool de agendamiento de citas. Necesita saber que Calendar Resource usar.

**Fixture tool_type.json:**
```json
{
  "doctype": "Tool Type",
  "name": "meet_scheduling",
  "tool_name": "meet_scheduling",
  "tool_label": "Agendamiento de Citas",
  "app_name": "meet_scheduling",
  "icon": "Calendar",
  "description": "Permite agendar citas segun disponibilidad",
  "is_active": 1
}
```

**Fixture custom_field.json:**
```json
{
  "doctype": "Custom Field",
  "name": "Service Portal Tool-calendar_resource",
  "dt": "Service Portal Tool",
  "fieldname": "calendar_resource",
  "fieldtype": "Link",
  "options": "Calendar Resource",
  "label": "Calendar Resource",
  "insert_after": "tool_type",
  "depends_on": "eval:doc.tool_type=='meet_scheduling'",
  "mandatory_depends_on": "eval:doc.tool_type=='meet_scheduling'"
}
```

**hooks.py:**
```python
fixtures = [
    {"doctype": "Tool Type", "filters": [["app_name", "=", "meet_scheduling"]]},
    {"doctype": "Custom Field", "filters": [["dt", "=", "Service Portal Tool"], ["fieldname", "=", "calendar_resource"]]},
]
```

---

### Ejemplo 2: create_logbook (con custom field)

Tool para crear una entrada de bitacora. Necesita saber que Logbook Availability usar para asignacion.

**Fixture tool_type.json:**
```json
{
  "doctype": "Tool Type",
  "name": "create_logbook",
  "tool_name": "create_logbook",
  "tool_label": "Crear Bitacora",
  "app_name": "logbook",
  "icon": "FilePlus",
  "description": "Permite crear una entrada de bitacora directamente sin agendar una cita",
  "is_active": 1
}
```

**Fixture custom_field.json:**
```json
{
  "doctype": "Custom Field",
  "name": "Service Portal Tool-logbook_availability",
  "dt": "Service Portal Tool",
  "fieldname": "logbook_availability",
  "fieldtype": "Link",
  "options": "Logbook Availability",
  "label": "Logbook Availability",
  "description": "User availability group for automatic assignment",
  "insert_after": "is_enabled",
  "depends_on": "eval:doc.tool_type=='create_logbook'",
  "mandatory_depends_on": "eval:doc.tool_type=='create_logbook'",
  "module": "Logbook"
}
```

**hooks.py:**
```python
fixtures = [
    {"dt": "Tool Type", "filters": [["app_name", "=", "logbook"]]},
    {"dt": "Custom Field", "filters": [["name", "in", ["Service Portal Tool-logbook_availability"]]]},
]
```

**Componente lee el custom field en ngOnInit:**
```typescript
const tool = portal?.tools.find(t => t.tool_type === 'create_logbook');
if (tool && (tool as any).logbook_availability) {
  this.logbookAvailability = (tool as any).logbook_availability;
}
```

---

### Ejemplo 3: my_logbook (sin custom field)

Tool de solo lectura que muestra las entradas de bitacora del usuario. No necesita configuracion adicional.

**Fixture tool_type.json:**
```json
{
  "doctype": "Tool Type",
  "name": "my_logbook",
  "tool_name": "my_logbook",
  "tool_label": "Mi Bitacora",
  "app_name": "logbook",
  "icon": "ClipboardList",
  "description": "Visualiza y gestiona tus entradas de bitacora",
  "is_active": 1
}
```

**Sin custom_field.json** necesario para este tipo.

**hooks.py** (mismo que create_logbook, comparten app):
```python
{"dt": "Tool Type", "filters": [["app_name", "=", "logbook"]]}
```
