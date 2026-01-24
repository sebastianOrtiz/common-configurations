# Service Portal - Documentación Técnica

## 1. Objetivo

El **Service Portal** es un sistema de configuración que permite crear portales de servicios dinámicos. Cada portal puede:

1. Solicitar datos de contacto del usuario (crear `User Contact`)
2. Mostrar herramientas configurables (botones) que llevan a diferentes funcionalidades
3. Personalizarse visualmente (colores, logo, estilos)

Las herramientas disponibles se registran mediante el DocType `Tool Type`, permitiendo que diferentes apps agreguen sus propias herramientas al sistema.

---

## 2. Arquitectura

```
common_configurations
├── Tool Type              → Registro maestro de herramientas disponibles
├── Service Portal Tool    → Child table con herramientas del portal
└── Service Portal         → Configuración principal del portal

meet_scheduling (u otras apps)
├── Fixtures               → Registra Tool Type + Custom Fields
└── Custom Fields          → Campos específicos para Service Portal Tool
```

### Flujo de extensibilidad

1. **App base (`common_configurations`)**: Define los DocTypes genéricos
2. **Apps de herramientas (`meet_scheduling`, etc.)**: Registran sus `Tool Type` via fixtures y agregan campos específicos via Custom Fields

---

## 3. DocTypes

### 3.1 Tool Type

Registro maestro donde cada app registra sus herramientas disponibles.

#### Campos

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `tool_name` | Tool Name | Data | - | - | ✅ Sí | - | Identificador único (ej: meet_scheduling) |
| `tool_label` | Tool Label | Data | - | - | ✅ Sí | - | Nombre visible (ej: Agendamiento de Citas) |
| `app_name` | App Name | Data | - | - | ✅ Sí | - | Nombre de la app que provee esta herramienta |
| `icon` | Icon | Data | - | - | No | - | Nombre del icono |
| `description` | Description | Small Text | - | - | No | - | Descripción de la herramienta |
| `is_active` | Is Active | Check | - | 1 | No | - | Indica si está disponible |

#### Configuración del DocType

| Propiedad | Valor |
|-----------|-------|
| Module | Common Configurations |
| Naming Rule | By fieldname |
| Auto Name | tool_name |
| Is Submittable | No |
| Is Child Table | No |
| Quick Entry | Sí |
| Track Changes | No |

---

### 3.2 Service Portal Tool (Child Table)

Child table que define las herramientas configuradas en cada portal.

#### Campos

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `tool_type` | Tool Type | Link | Tool Type | - | ✅ Sí | - | Tipo de herramienta |
| `label` | Label | Data | - | - | ✅ Sí | tool_type.tool_label | Texto del botón |
| `tool_description` | Description | Small Text | - | - | No | tool_type.description | Descripción breve |
| `icon` | Icon | Data | - | - | No | tool_type.icon | Icono (sobreescribible) |
| `button_color` | Button Color | Color | - | - | No | - | Color del botón |
| `display_order` | Display Order | Int | - | 0 | No | - | Orden de aparición |
| `is_enabled` | Is Enabled | Check | - | 1 | No | - | Habilitado/deshabilitado |

#### Configuración del DocType

| Propiedad | Valor |
|-----------|-------|
| Module | Common Configurations |
| Naming Rule | Autoincrement |
| Is Submittable | No |
| Is Child Table | ✅ Sí |
| Quick Entry | No |
| Track Changes | No |

#### Campos con Fetch From

Los siguientes campos se auto-completan al seleccionar un `Tool Type`:

| Campo | Se obtiene de |
|-------|---------------|
| `label` | `tool_type.tool_label` |
| `tool_description` | `tool_type.description` |
| `icon` | `tool_type.icon` |

---

### 3.3 Service Portal

DocType principal que configura un portal de servicios.

#### Sección: General

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `portal_name` | Portal Name | Data | - | - | ✅ Sí | - | Nombre único identificador |
| `title` | Title | Data | - | - | ✅ Sí | - | Título visible al usuario |
| `description` | Description | Small Text | - | - | No | - | Descripción del portal |
| `is_active` | Is Active | Check | - | 1 | No | - | Portal activo/inactivo |

#### Sección: Configuración de Registro

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `request_contact_user_data` | Request Contact User Data | Check | - | 0 | No | - | Mostrar formulario de registro |
| `registration_title` | Registration Title | Data | - | - | No | - | Título del formulario |
| `registration_description` | Registration Description | Small Text | - | - | No | - | Instrucciones del formulario |

#### Sección: Estilos

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `primary_color` | Primary Color | Color | - | #000000 | No | - | Color principal |
| `secondary_color` | Secondary Color | Color | - | #FFFFFF | No | - | Color secundario |
| `logo` | Logo | Attach Image | - | - | No | - | Logo del portal |
| `background_image` | Background Image | Attach Image | - | - | No | - | Imagen de fondo |
| `custom_css` | Custom CSS | Code | CSS | - | No | - | CSS personalizado |

#### Sección: Herramientas

| Fieldname | Label | Type | Options | Default | Required | Fetch From | Description |
|-----------|-------|------|---------|---------|----------|------------|-------------|
| `tools` | Tools | Table | Service Portal Tool | - | No | - | Herramientas del portal |

#### Configuración del DocType

| Propiedad | Valor |
|-----------|-------|
| Module | Common Configurations |
| Naming Rule | By fieldname |
| Auto Name | portal_name |
| Is Submittable | No |
| Is Child Table | No |
| Quick Entry | No |
| Track Changes | Sí |

---

## 4. Extensibilidad: Agregar nuevas herramientas

Cuando una nueva app quiere registrar una herramienta, debe:

### 4.1 Crear fixture para Tool Type

```json
// mi_app/fixtures/tool_type.json
[
    {
        "doctype": "Tool Type",
        "tool_name": "mi_herramienta",
        "tool_label": "Mi Herramienta",
        "app_name": "mi_app",
        "icon": "tool",
        "description": "Descripción de mi herramienta",
        "is_active": 1
    }
]
```

### 4.2 Registrar fixture en hooks.py

```python
# mi_app/hooks.py
fixtures = [
    {
        "doctype": "Tool Type",
        "filters": [["app_name", "=", "mi_app"]]
    }
]
```

### 4.3 Agregar Custom Fields (opcional)

Si la herramienta necesita campos específicos en `Service Portal Tool`:

```json
// mi_app/fixtures/custom_field.json
[
    {
        "doctype": "Custom Field",
        "dt": "Service Portal Tool",
        "fieldname": "mi_campo_especifico",
        "fieldtype": "Link",
        "options": "Mi DocType",
        "insert_after": "tool_type",
        "depends_on": "eval:doc.tool_type=='mi_herramienta'",
        "label": "Mi Campo Específico"
    }
]
```

---

## 5. Flujo del Frontend

```
1. GET /api/resource/Service Portal/{portal_name}
   → Obtiene configuración completa del portal

2. Si request_contact_user_data = true:
   → Mostrar formulario con campos de User Contact
   → POST /api/resource/User Contact
   → Guardar referencia del usuario creado

3. Renderizar pantalla de herramientas:
   → Iterar sobre portal.tools
   → Mostrar botón por cada tool con is_enabled = true
   → Ordenar por display_order
   → Aplicar estilos (button_color, icon, etc.)

4. Al hacer clic en herramienta:
   → Según tool_type, ejecutar lógica correspondiente
   → Ejemplo meet_scheduling:
      GET /api/method/meet_scheduling.api.get_available_slots
      ?calendar_resource={tool.calendar_resource}
      &start_date=...&end_date=...
```

---

## 6. Ejemplo de uso

### Crear un portal de agendamiento médico

1. **Crear Tool Type** (automático via fixtures de meet_scheduling):
   - tool_name: `meet_scheduling`
   - tool_label: `Agendamiento de Citas`

2. **Crear Service Portal**:
   - portal_name: `clinica_salud`
   - title: `Clínica Salud - Portal de Citas`
   - request_contact_user_data: ✅
   - registration_title: `Ingresa tus datos`
   - primary_color: `#2E86AB`
   - tools:
     - tool_type: `meet_scheduling`
     - label: `Agendar cita médica`
     - calendar_resource: `Dr. García` (Custom Field)

3. **Frontend consume**:
   - Muestra formulario de registro
   - Crea User Contact
   - Muestra botón "Agendar cita médica"
   - Al hacer clic, muestra disponibilidad del Dr. García
