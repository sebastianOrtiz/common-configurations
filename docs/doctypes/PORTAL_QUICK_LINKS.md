# DocTypes: Portal Quick Links y Portal Quick Link Item

Sistema de **grupos de enlaces rápidos** que puede mostrarse desde una herramienta del Service Portal con `tool_type = 'portal_quick_links'`.

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

### Campos

#### `label`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `reqd` | 1 |
| `in_list_view` | 1 |

Texto visible del enlace.

#### `icon`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `in_list_view` | 1 |

Icono Lucide (mismas opciones que el padre).

#### `image`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Attach Image |
| `description` | If set, this image is used instead of the icon |

#### `url`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `options` | URL |
| `reqd` | 1 |
| `in_list_view` | 1 |

URL del enlace. El tipo `options: URL` activa la validación de URL de Frappe.

#### `target`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `reqd` | 1 |
| `default` | `_blank` |
| `options` | `_blank\n_self` |
| `in_list_view` | 1 |

Comportamiento del enlace: `_blank` (nueva pestaña, default) o `_self` (misma pestaña).

#### `display_order`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 0 |

Orden de aparición ascendente.

#### `is_enabled`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 1 |
| `in_list_view` | 1 |

Si está deshabilitado, el item se **excluye** de la respuesta al frontend (filtro aplicado en `PortalService._get_quick_links_data`).

---

## Integración con Service Portal Tool

Cuando una tool tiene `tool_type = 'portal_quick_links'` y `quick_links` apuntando a un `Portal Quick Links`, el endpoint `get_portal` **inyecta automáticamente los datos del grupo** en la respuesta para evitar un segundo round-trip:

`portals/service.py:112-115`:

```python
if tool.tool_type == "portal_quick_links" and tool_data["quick_links"]:
    tool_data["quick_links_data"] = cls._get_quick_links_data(
        tool_data["quick_links"]
    )
```

El método `_get_quick_links_data` filtra `is_active=1` en el grupo y `is_enabled=1` en cada item:

```python
@classmethod
def _get_quick_links_data(cls, quick_links_name: str) -> Optional[Dict[str, Any]]:
    if not frappe.db.exists(
        "Portal Quick Links", {"name": quick_links_name, "is_active": 1}
    ):
        return None

    doc = frappe.get_doc("Portal Quick Links", quick_links_name)
    return {
        "name": doc.name,
        "link_group_name": doc.link_group_name,
        "description": doc.description,
        "icon": doc.icon,
        "image": doc.image,
        "links": [
            {
                "label": item.label,
                "icon": item.icon,
                "image": item.image,
                "url": item.url,
                "target": item.target,
                "display_order": item.display_order,
                "is_enabled": item.is_enabled,
            }
            for item in doc.links
            if item.is_enabled
        ],
    }
```

---

## Ejemplo de uso

### 1) Crear un Portal Quick Links

```json
{
  "doctype": "Portal Quick Links",
  "link_group_name": "Trámites Ciudadanos",
  "icon": "Link",
  "description": "Enlaces a trámites externos frecuentes",
  "is_active": 1,
  "links": [
    {"label": "RUT", "url": "https://muisca.dian.gov.co", "target": "_blank", "display_order": 1, "icon": "ExternalLink", "is_enabled": 1},
    {"label": "Cédula", "url": "https://www.registraduria.gov.co", "target": "_blank", "display_order": 2, "icon": "User", "is_enabled": 1}
  ]
}
```

### 2) Agregar una Tool al Service Portal

En el Service Portal correspondiente, agregar una fila a `tools[]`:

| Campo | Valor |
|-------|-------|
| `tool_type` | `portal_quick_links` |
| `quick_links` | `Trámites Ciudadanos` |
| `label` | Trámites Frecuentes |
| `icon` | Link |
| `is_enabled` | 1 |

### 3) Respuesta del endpoint `get_portal`

La tool incluirá inline el campo `quick_links_data` con los items filtrados.

---

## Referencias cruzadas

- [TOOL_TYPE.md](TOOL_TYPE.md) — tipo `portal_quick_links` (registrado por `common_configurations`).
- [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) — campo `quick_links` (Link → Portal Quick Links).
- [../api/PORTALS.md](../api/PORTALS.md) — endpoint que inyecta los datos.
