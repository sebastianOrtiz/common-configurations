# DocType: Service Portal Tool

**Nombre interno:** `Service Portal Tool`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/service_portal_tool/service_portal_tool.json`
**Tipo:** **Child DocType** (`istable: 1`)
**Auto-naming:** Autoincrement
**Editable grid:** 1

---

## Propósito

`Service Portal Tool` es la **tabla hija** del DocType `Service Portal`. Cada fila representa una herramienta (tool) que se mostrará como un botón/tarjeta dentro de un portal.

El DocType es **extensible**: el campo `tool_type` (Link a `Tool Type`) determina qué tipo de herramienta es y, mediante **custom fields agregados por otras apps**, se pueden requerir parámetros adicionales específicos por tipo (ej. `calendar_resource` para meet_scheduling, `logbook_availability` para create_logbook, etc.).

---

## Campos base (definidos por common_configurations)

### `tool_type`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Tool Type` |
| `label` | Tool Type |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | Tipo de herramienta |

Link al catálogo `Tool Type`. Determina el comportamiento de la fila y qué custom fields son visibles.

### `target_portal`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Service Portal` |
| `label` | Portal Destino |
| `depends_on` | `eval:doc.tool_type=='portal_redirect'` |
| `mandatory_depends_on` | `eval:doc.tool_type=='portal_redirect'` |

Visible solo si `tool_type == 'portal_redirect'`. Indica a qué Service Portal redirigir cuando el usuario seleccione esta herramienta.

### `quick_links`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Portal Quick Links` |
| `label` | Quick Links |
| `depends_on` | `eval:doc.tool_type=='portal_quick_links'` |
| `mandatory_depends_on` | `eval:doc.tool_type=='portal_quick_links'` |

Visible solo si `tool_type == 'portal_quick_links'`. Grupo de enlaces rápidos a mostrar.

### `label`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Label |
| `reqd` | 1 |
| `in_list_view` | 1 |

Texto del botón visible al usuario en el portal.

### `tool_description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |
| `in_list_view` | 1 |

Descripción breve mostrada bajo el label.

### `icon`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Icon |

Icono Lucide. Sobrescribe el icono por defecto del `Tool Type`. Opciones disponibles (en orden del JSON):

```
Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
ClipboardList, ClipboardCheck, FileText, File, Folder, Mail,
MessageSquare, Phone, User, Users, UserCheck, UserPlus, Briefcase,
Clipboard, Settings, Wrench, CheckSquare, ListTodo, MapPin, BarChart,
PieChart, TrendingUp, DollarSign, CreditCard, ShoppingCart, Package,
Truck, Home, Building, Store, Heart, Star, Bell, BookOpen,
GraduationCap, Video, Mic, Camera, Image, FileCheck, FilePlus,
Download, Upload, Search, Filter, Circle, ChevronRight, LogOut,
AlertCircle, Inbox
```

### `tool_image`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Attach Image |
| `label` | Tool Image |

Imagen personalizada que **reemplaza al icono** si se sube.

### `button_color`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Color |
| `label` | Button Color |

Color del botón. Si está vacío usa el `primary_color` del Service Portal.

### `display_order`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `label` | Display Order |
| `default` | 0 |

Orden de aparición de los botones. Las tools se muestran ordenadas ascendentemente por este campo.

### `is_enabled`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Enabled |
| `default` | 1 |
| `in_list_view` | 1 |

Si está deshabilitada, no se muestra en el portal (el endpoint `get_portal` la sigue devolviendo pero el frontend la oculta).

---

## Custom fields agregados por otras apps

El sistema permite que cada app que define un `Tool Type` agregue sus propios campos al **Service Portal Tool** vía `fixtures/custom_field.json`. Estos campos suelen tener `depends_on: eval:doc.tool_type == 'mi_tool'`.

### Por `meet_scheduling`

Archivo: `apps/meet_scheduling/meet_scheduling/fixtures/custom_field.json`

| Custom Field | Tipo | Options | Visible cuando |
|--------------|------|---------|----------------|
| `Service Portal Tool-calendar_resource` | Link | `Calendar Resource` | `tool_type == 'meet_scheduling'` |

### Por `logbook`

Archivo: `apps/logbook/logbook/fixtures/custom_field.json`

| Custom Field | Tipo | Options | Visible cuando |
|--------------|------|---------|----------------|
| `Service Portal Tool-logbook_availability` | Link | `Logbook Availability` | `tool_type == 'create_logbook'` |
| `Service Portal Tool-logbook_procedures_config` | Link | `Logbook Procedures Config` | `tool_type == 'procedures'` |

### Por `lex_app`

Actualmente `lex_app` no agrega custom fields a `Service Portal Tool` (su tool `my_cases` no requiere configuración extra), pero sí registra el `Tool Type my_cases`.

---

## Sistema de `tool_type` extensible

El campo `tool_type` apunta al DocType `Tool Type`, que actúa como **catálogo extensible** registrado vía fixtures. Cuando una app quiere ofrecer una nueva herramienta:

1. Crea un fixture `tool_type.json` con un registro por cada tool.
2. (Opcional) Crea un fixture `custom_field.json` con los campos extra que necesita en `Service Portal Tool`, condicionados por `depends_on: eval:doc.tool_type=='mi_tool'`.
3. El frontend (Angular tool-router) hace `import()` dinámico del componente correspondiente.

> Ver la guía completa: [HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md).

---

## Lectura desde el frontend

El endpoint `common_configurations.api.portals.get_portal` enriquece automáticamente cada tool y **inyecta los custom fields** conocidos del ecosistema en el dict de respuesta (`portals/service.py:90-109`):

```python
tool_data = {
    "name": tool.name,
    "tool_type": tool.tool_type,
    "label": tool.label,
    "tool_description": tool.tool_description,
    "icon": tool.icon,
    "tool_image": tool.tool_image,
    "button_color": tool.button_color,
    "display_order": tool.display_order,
    "is_enabled": tool.is_enabled,
    "calendar_resource": getattr(tool, "calendar_resource", None),
    "show_calendar_view": getattr(tool, "show_calendar_view", None),
    "slot_duration_minutes": getattr(tool, "slot_duration_minutes", None),
    "target_portal": getattr(tool, "target_portal", None),
    "quick_links": getattr(tool, "quick_links", None),
    "logbook_availability": getattr(tool, "logbook_availability", None),
    "logbook_procedures_config": getattr(tool, "logbook_procedures_config", None),
}
```

> Si una app agrega un nuevo custom field, debe añadirse a este `tool_data` para que el frontend lo reciba. Alternativamente, el frontend puede leerlo con `(tool as any).mi_campo` si está presente.

---

## Permisos

Como `istable: 1`, el DocType **no tiene permisos propios**. Hereda los permisos del DocType padre (`Service Portal`).

---

## Referencias cruzadas

- [TOOL_TYPE.md](TOOL_TYPE.md) — Catálogo de tipos.
- [../SERVICE_PORTAL.md](../SERVICE_PORTAL.md) — DocType padre.
- [../HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md) — Guía paso a paso.
- [../api/PORTALS.md](../api/PORTALS.md) — Endpoint que expone las tools al frontend.
