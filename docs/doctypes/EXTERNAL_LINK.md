# DocType: External Link

Entidad **reutilizable** que representa un enlace externo (URL + apariencia). Un `External Link` se crea una sola vez y se referencia desde múltiples lugares del Service Portal, evitando duplicar URLs, iconos y colores.

**Nombre interno:** `External Link`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/external_link/external_link.json`
**Auto-naming:** `field:title` (el `name` del documento es el `title`)
**Title field:** `title`
**Allow rename:** 1
**Track changes:** 1
**Sort:** `title ASC`
**Index para búsqueda web:** 1

---

## Propósito

Antes, cada lugar que necesitaba un enlace externo (los items de `Portal Quick Links`, una tool de redirección, etc.) repetía los mismos campos: `label`, `url`, `target`, `icon`, `image`, `color`. Esto producía duplicación y child-tables anidadas (child de child).

`External Link` centraliza un enlace como **entidad de primer nivel**. Hoy se usa en dos lugares:

1. **`Portal Quick Link Item`** — cada item de un grupo de enlaces rápidos apunta a un `External Link` (campo `external_link`).
2. **Tool `quick_link`** del Service Portal — el campo `quick_link_external` (en `Service Portal Tool`) apunta a un `External Link`. Al hacer click en la tool, el portal redirige directamente a su `url`.

> Ventajas: DRY (un solo lugar de verdad), reutilización (el mismo enlace en varios portales/grupos), edición centralizada (cambiar la URL una vez), y se elimina el problema de child-de-child.

---

## Campos

### Sección: Basic Information (`section_basic`)

#### `title`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Title |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |
| `description` | Unique internal identifier (e.g. 'Alcaldia Web', 'Trámite Catastro') |

Identificador interno **único**. Es el `name` del documento (naming rule `field:title`). No se muestra al ciudadano; sirve para referenciar el enlace desde otros DocTypes.

#### `label`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Label |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | Visible text shown to the citizen (e.g. 'Sitio oficial') |

Texto **visible al ciudadano** en la tarjeta/botón del portal.

#### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |
| `in_list_view` | 1 |
| `description` | Only active links can be used in portals/tools |

Interruptor global. Si está en `0`, el enlace **no se devuelve** al frontend aunque sea referenciado (el filtro se aplica en `PortalService._get_external_link_data`, que exige `is_active = 1`).

#### `url`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | URL |
| `options` | `URL` |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | External URL (include https://) |

URL externa de destino. `options: URL` activa la validación de URL de Frappe. Incluir el esquema `https://`.

#### `target`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Target |
| `reqd` | 1 |
| `default` | `_blank` |
| `options` | `_blank` / `_self` |
| `description` | _blank opens in a new tab, _self redirects in the same tab |

Comportamiento al abrir: `_blank` (nueva pestaña, default) o `_self` (misma pestaña).

### Sección: Appearance (`section_appearance`)

#### `icon`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Icon |
| `description` | Lucide icon name. Ignored if an image is attached. |

Icono Lucide. **Se ignora si hay una `image` adjunta.** Opciones (incluye la primera opción vacía, más `ExternalLink`, `Link`, `Globe`):

```
(vacío), Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
ClipboardList, ClipboardCheck, FileText, File, Folder, Mail,
MessageSquare, Phone, User, Users, UserCheck, UserPlus, Briefcase,
Clipboard, Settings, Wrench, CheckSquare, ListTodo, MapPin, BarChart,
PieChart, TrendingUp, DollarSign, CreditCard, ShoppingCart, Package,
Truck, Home, Building, Store, Heart, Star, Bell, BookOpen,
GraduationCap, Video, Mic, Camera, Image, FileCheck, FilePlus,
Download, Upload, Search, Filter, Circle, ChevronRight, LogOut,
AlertCircle, Inbox, ExternalLink, Link, Globe
```

#### `image`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Attach Image |
| `label` | Image |
| `description` | If set, this image is used instead of the icon |

Imagen que **reemplaza al icono** si se sube.

#### `color`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Color |
| `label` | Color |
| `description` | Accent color (used in cards/buttons) |

Color de acento usado en la tarjeta/botón del portal.

#### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |
| `description` | Internal description (not shown to citizens) |

Descripción **interna** (no se muestra al ciudadano).

---

## Permisos

| Rol | create | read | write | delete | export | print | email | share | report |
|-----|--------|------|-------|--------|--------|-------|-------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

> No hay rol `Portal API User` con permiso de lectura directa: el frontend nunca consulta `External Link` por sí mismo. El backend lo resuelve internamente (`ignore_permissions` vía `frappe.db.get_value`) y lo inyecta en la respuesta de `get_portal`.

---

## Dónde se usa

### 1. Portal Quick Link Item

`Portal Quick Link Item.external_link` (Link → External Link, `reqd: 1`). Cada item de un grupo `Portal Quick Links` apunta a un `External Link`. Ver [PORTAL_QUICK_LINKS.md](PORTAL_QUICK_LINKS.md).

### 2. Tool `quick_link`

`Service Portal Tool.quick_link_external` (Link → External Link). Cuando una tool tiene `tool_type = 'quick_link'`, este campo es obligatorio y define la URL a la que se redirige al hacer click. Ver [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) y [../features/QUICK_LINK_TOOL.md](../features/QUICK_LINK_TOOL.md).

### Resolución en backend

`common_configurations/api/portals/service.py:176-197` — método `_get_external_link_data`:

```python
@classmethod
def _get_external_link_data(cls, link_name: str) -> Optional[Dict[str, Any]]:
    """Get a single External Link as a dict (only if active)."""
    row = frappe.db.get_value(
        "External Link",
        {"name": link_name, "is_active": 1},
        ["name", "title", "label", "url", "target", "icon", "image", "color", "description"],
        as_dict=True,
    )
    if not row:
        return None
    return {
        "name": row.name,
        "title": row.title,
        "label": row.label,
        "url": row.url,
        "target": row.target or "_blank",
        "icon": row.icon,
        "image": row.image,
        "color": row.color,
        "description": row.description,
    }
```

Nota: si el enlace no existe o `is_active = 0`, devuelve `None` y el frontend no muestra nada para esa referencia.

---

## Ejemplo: crear un External Link

Desde **Common Configurations > External Link > New**, o vía script:

```json
{
  "doctype": "External Link",
  "title": "Alcaldia Web",
  "label": "Sitio oficial de la Alcaldía",
  "is_active": 1,
  "url": "https://www.alcaldia.gov.co",
  "target": "_blank",
  "icon": "Globe",
  "color": "#003366",
  "description": "Portal institucional principal"
}
```

Una vez creado, el `name` será `Alcaldia Web` y se puede referenciar desde:

- Un `Portal Quick Link Item` (campo `external_link = "Alcaldia Web"`).
- Una tool `quick_link` (campo `quick_link_external = "Alcaldia Web"`).

---

## Referencias cruzadas

- [PORTAL_QUICK_LINKS.md](PORTAL_QUICK_LINKS.md) — `Portal Quick Link Item` ahora apunta a `External Link`.
- [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) — campo `quick_link_external`.
- [../features/QUICK_LINK_TOOL.md](../features/QUICK_LINK_TOOL.md) — la tool `quick_link`.
- [../api/PORTALS.md](../api/PORTALS.md) — cómo viaja el enlace resuelto al frontend.
