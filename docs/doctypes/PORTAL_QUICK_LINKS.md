# DocTypes: Portal Quick Links y Portal Quick Link Item

Sistema de **grupos de enlaces rápidos** que puede mostrarse desde una herramienta del Service Portal con `tool_type = 'portal_quick_links'`.

> **Cambio importante (2026-05-18):** `Portal Quick Link Item` fue refactorizado. Ya no contiene campos propios de enlace (`label`, `icon`, `image`, `url`, `target`); ahora apunta a un DocType **`External Link`** reutilizable. Ver la sección [Refactor: antes / después](#refactor-antes--después).

---

## Portal Quick Links (DocType padre)

**Nombre interno:** `Portal Quick Links`
**Ruta JSON:** `common_configurations/common_configurations/doctype/portal_quick_links/portal_quick_links.json`
**Auto-naming:** `field:link_group_name`
**Allow rename:** 1
**Index para búsqueda web:** 1

### Propósito

Define un **grupo nombrado** de enlaces que se mostrará como un panel en el Service Portal. Por ejemplo: "Trámites Frecuentes", "Enlaces Externos del Municipio", "Recursos del Ciudadano".

### Campos

#### `link_group_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Name |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |

Nombre del grupo. Es el `name` del documento (naming rule = field).

#### `icon`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Icon |

Icono Lucide del grupo. Opciones (incluye `ExternalLink`, `Link`, `Globe` además de los iconos estándar):

```
Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
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

Imagen que reemplaza al icono si se sube.

#### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |

Descripción del grupo (puede aparecer como subtítulo en el portal).

#### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 1 |

Si está inactivo, el grupo no se devuelve al frontend incluso si una tool lo referencia.

#### Sección: Links

##### `links`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Table |
| `options` | `Portal Quick Link Item` |

Tabla hija con los enlaces individuales del grupo.

### Permisos

| Rol | create | read | write | delete | export |
|-----|--------|------|-------|--------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 |
| **Portal API User** | 0 | 1 | 0 | 0 | 1 |

---

## Portal Quick Link Item (DocType child)

**Nombre interno:** `Portal Quick Link Item`
**Tipo:** Child DocType (`istable: 1`)
**Ruta JSON:** `common_configurations/common_configurations/doctype/portal_quick_link_item/portal_quick_link_item.json`
**Editable grid:** 1

### Campos (estado actual tras el refactor)

#### `external_link`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `External Link` |
| `label` | External Link |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | External link to show in this quick links group |

Referencia al DocType reutilizable [`External Link`](EXTERNAL_LINK.md). De ahí salen el `label`, `url`, `target`, `icon`, `image`, `color` y `description` que antes se duplicaban aquí.

#### `display_order`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 0 |
| `in_list_view` | 1 |

Orden de aparición ascendente. El ordenamiento se aplica en backend (`links.sort(key=lambda x: x.get("display_order", 0))`).

#### `is_enabled`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 1 |
| `in_list_view` | 1 |

Si está deshabilitado, el item se **excluye** de la respuesta al frontend (filtro aplicado en `PortalService._get_quick_links_data`).

---

## Refactor: antes / después

### Antes

`Portal Quick Link Item` contenía sus propios campos de enlace:

| Campo (antes) | Tipo |
|---------------|------|
| `label` | Data (reqd) |
| `icon` | Select |
| `image` | Attach Image |
| `url` | Data (URL, reqd) |
| `target` | Select (`_blank`/`_self`) |
| `display_order` | Int |
| `is_enabled` | Check |

Problema: cada item repetía label/url/icon/imagen/color. Si el mismo enlace (p. ej. "Sitio oficial") aparecía en tres grupos, se mantenía tres veces. Además era una child-table con muchos campos editados inline.

### Después

| Campo (ahora) | Tipo |
|---------------|------|
| `external_link` | Link → External Link (reqd) |
| `display_order` | Int |
| `is_enabled` | Check |

El enlace en sí (label, url, target, icon, image, color, description) vive en el DocType [`External Link`](EXTERNAL_LINK.md).

### Razón del cambio

1. **DRY** — Un enlace se define una sola vez en `External Link` y se reutiliza.
2. **Reutilización** — El mismo `External Link` puede usarse en varios grupos `Portal Quick Links` y también en la tool `quick_link`.
3. **Edición centralizada** — Cambiar la URL/icono/color de un enlace se hace en un único lugar y se refleja en todos los grupos y tools.
4. **Evitar child-de-child** — `Portal Quick Link Item` queda mínimo (solo el link + orden + flag), sin replicar estructura.

---

## Integración con Service Portal Tool

Cuando una tool tiene `tool_type = 'portal_quick_links'` y `quick_links` apuntando a un `Portal Quick Links`, el endpoint `get_portal` **inyecta automáticamente los datos del grupo** en la respuesta para evitar un segundo round-trip.

`common_configurations/api/portals/service.py:127-130`:

```python
if tool.tool_type == "portal_quick_links" and tool_data["quick_links"]:
    tool_data["quick_links_data"] = cls._get_quick_links_data(
        tool_data["quick_links"]
    )
```

El método `_get_quick_links_data` (`service.py:142-174`) ahora **resuelve cada `external_link`** a través de `_get_external_link_data`, filtrando `is_active=1` en el grupo, `is_enabled=1` en cada item y `is_active=1` en cada `External Link`:

```python
@classmethod
def _get_quick_links_data(cls, quick_links_name: str) -> Optional[Dict[str, Any]]:
    """Get Portal Quick Links with its items, resolving each linked External Link."""
    if not frappe.db.exists(
        "Portal Quick Links", {"name": quick_links_name, "is_active": 1}
    ):
        return None

    doc = frappe.get_doc("Portal Quick Links", quick_links_name)
    links = []
    for item in doc.links:
        if not item.is_enabled or not item.external_link:
            continue
        link_data = cls._get_external_link_data(item.external_link)
        if not link_data:
            continue
        links.append({
            **link_data,
            "display_order": item.display_order,
            "is_enabled": item.is_enabled,
        })

    # Sort by display_order (lowest first)
    links.sort(key=lambda x: x.get("display_order", 0))

    return {
        "name": doc.name,
        "link_group_name": doc.link_group_name,
        "description": doc.description,
        "icon": doc.icon,
        "image": doc.image,
        "links": links,
    }
```

> Cada elemento de `links` ahora trae los campos del `External Link` resuelto (`name`, `title`, `label`, `url`, `target`, `icon`, `image`, `color`, `description`) más `display_order` e `is_enabled` del item.

---

## Ejemplo de uso (flujo actualizado)

### 1) Crear los External Link

```json
{ "doctype": "External Link", "title": "RUT DIAN", "label": "RUT",
  "url": "https://muisca.dian.gov.co", "target": "_blank",
  "icon": "ExternalLink", "is_active": 1 }
```
```json
{ "doctype": "External Link", "title": "Registraduria", "label": "Cédula",
  "url": "https://www.registraduria.gov.co", "target": "_blank",
  "icon": "User", "is_active": 1 }
```

### 2) Crear un Portal Quick Links que los referencie

```json
{
  "doctype": "Portal Quick Links",
  "link_group_name": "Trámites Ciudadanos",
  "icon": "Link",
  "description": "Enlaces a trámites externos frecuentes",
  "is_active": 1,
  "links": [
    {"external_link": "RUT DIAN", "display_order": 1, "is_enabled": 1},
    {"external_link": "Registraduria", "display_order": 2, "is_enabled": 1}
  ]
}
```

### 3) Agregar una Tool al Service Portal

| Campo | Valor |
|-------|-------|
| `tool_type` | `portal_quick_links` |
| `quick_links` | `Trámites Ciudadanos` |
| `label` | Trámites Frecuentes |
| `icon` | Link |
| `is_enabled` | 1 |

### 4) Respuesta del endpoint `get_portal`

La tool incluirá inline `quick_links_data.links[]`, donde cada link es el `External Link` resuelto. Ver [../api/PORTALS.md](../api/PORTALS.md).

---

## Referencias cruzadas

- [EXTERNAL_LINK.md](EXTERNAL_LINK.md) — DocType reutilizable referenciado por cada item.
- [TOOL_TYPE.md](TOOL_TYPE.md) — tipo `portal_quick_links` (registrado por `common_configurations`).
- [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) — campo `quick_links` (Link → Portal Quick Links).
- [../api/PORTALS.md](../api/PORTALS.md) — endpoint que inyecta los datos.
