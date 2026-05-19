# DocTypes: Announcement, Announcement Set y Announcement Set Item

Módulo de **anuncios** del Service Portal. Permite mostrar banners (imagen, texto o HTML) en tres zonas de un portal, con rotación automática opcional y vigencia por fechas.

Tres DocTypes:

| DocType | Tipo | Rol |
|---------|------|-----|
| `Announcement` | Standard | Un anuncio individual (contenido + estilo + vigencia) |
| `Announcement Set` | Standard | Agrupa anuncios; es lo que se asigna a una zona del portal |
| `Announcement Set Item` | Child | Fila de la tabla del set: referencia a un `Announcement` + orden + flag |

> La feature completa (zonas, rotación, regla de visibilidad, responsive, paso a paso) está en [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md).

---

## 1. Announcement (DocType padre)

**Nombre interno:** `Announcement`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/announcement/announcement.json`
**Ruta controlador:** `common_configurations/common_configurations/doctype/announcement/announcement.py`
**Auto-naming:** `field:title`
**Title field:** `title`
**Track changes:** 1

### Campos

#### Sección: Basic Information (`section_basic`)

##### `title`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Title |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |
| `description` | Unique internal identifier (e.g. 'Promo Vacunación 2026') |

Identificador interno único. Es el `name` del documento.

##### `content_type`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Content Type |
| `options` | `image` / `text` / `html` |
| `default` | `image` |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | What kind of content this announcement renders |

Determina qué campo de contenido se usa y cómo lo renderiza el frontend:

- `image` → muestra `image`
- `text` → muestra `heading` + `body`
- `html` → muestra `html_content` (renderizado sanitizado)

##### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |
| `in_list_view` | 1 |
| `description` | Only active announcements are shown (global switch) |

Interruptor global del anuncio (capa 1 de la regla de visibilidad).

##### `announcement_type`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Style |
| `options` | `info` / `promo` / `alert` / `event` |
| `default` | `info` |
| `description` | Visual style for text announcements |

Estilo visual. El frontend aplica una clase CSS `type-{valor}` que pinta un borde izquierdo de color:

| Valor | Color del borde |
|-------|-----------------|
| `info` | `#2563eb` (azul) |
| `promo` | `#16a34a` (verde) |
| `alert` | `#dc2626` (rojo) |
| `event` | `#7c3aed` (morado) |

##### `valid_from`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Date |
| `label` | Valid From |
| `description` | Show from this date (optional) |

Fecha de inicio de vigencia (opcional). Si está vacía, no hay límite inferior.

##### `valid_to`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Date |
| `label` | Valid To |
| `description` | Hide after this date (optional) |

Fecha de fin de vigencia (opcional). Si está vacía, no hay límite superior.

#### Sección: Content (`section_content`)

##### `image`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Attach Image |
| `label` | Image |
| `depends_on` | `eval:doc.content_type=='image'` |
| `mandatory_depends_on` | `eval:doc.content_type=='image'` |
| `description` | Banner image for the announcement |

Imagen del banner. Visible y obligatoria solo si `content_type == 'image'`.

##### `heading`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Heading |
| `depends_on` | `eval:doc.content_type=='text'` |
| `description` | Title shown on the card |

Título de la tarjeta. Visible solo si `content_type == 'text'` (opcional).

##### `body`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Body |
| `depends_on` | `eval:doc.content_type=='text'` |
| `mandatory_depends_on` | `eval:doc.content_type=='text'` |
| `description` | Text body of the announcement |

Cuerpo de texto. Visible y obligatorio solo si `content_type == 'text'`. Se renderiza con `white-space: pre-wrap` (respeta saltos de línea).

##### `html_content`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | HTML Editor |
| `label` | HTML Content |
| `depends_on` | `eval:doc.content_type=='html'` |
| `mandatory_depends_on` | `eval:doc.content_type=='html'` |
| `description` | Custom HTML content (rendered sanitized) |

HTML personalizado. Visible y obligatorio solo si `content_type == 'html'`. El frontend lo renderiza con `DomSanitizer.bypassSecurityTrustHtml`.

#### Sección: Action (`section_action`)

##### `cta_url`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Link URL |
| `options` | `URL` |
| `description` | If set, the whole card is clickable and opens this URL |

Si se define, **toda la tarjeta del anuncio es clickeable** y abre esta URL.

##### `cta_target`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Link Target |
| `options` | `_blank` / `_self` |
| `default` | `_blank` |
| `depends_on` | `eval:doc.cta_url` |
| `description` | _blank opens in a new tab, _self redirects in the same |

Comportamiento del click: nueva pestaña (`_blank`, default) o misma pestaña (`_self`). Visible solo si hay `cta_url`.

### Validación (controlador)

`common_configurations/common_configurations/doctype/announcement/announcement.py`:

```python
class Announcement(Document):
    def validate(self):
        self._validate_date_range()

    def _validate_date_range(self):
        if self.valid_from and self.valid_to and self.valid_from > self.valid_to:
            frappe.throw(_("Valid From cannot be later than Valid To"))
```

> Si ambas fechas están definidas y `valid_from > valid_to`, el guardado falla con el mensaje "Valid From cannot be later than Valid To".

### Permisos

| Rol | create | read | write | delete | export | print | email | share | report |
|-----|--------|------|-------|--------|--------|-------|-------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

---

## 2. Announcement Set (DocType padre)

**Nombre interno:** `Announcement Set`
**Ruta JSON:** `common_configurations/common_configurations/doctype/announcement_set/announcement_set.json`
**Auto-naming:** `field:title`
**Title field:** `title`
**Track changes:** 1

Agrupa varios anuncios. Lo que se asigna a una zona del portal (`Service Portal.announcement_set_left/bottom/right`) es un `Announcement Set`, no un `Announcement` suelto.

### Campos

#### Sección: Basic Information (`section_basic`)

##### `title`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Title |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |
| `description` | Unique name for this announcement set (e.g. 'Banners Portal Ciudadano') |

Nombre único del set. Es el `name`.

##### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |
| `in_list_view` | 1 |
| `description` | Only active sets are rendered in portals |

Interruptor global del set (capa 3 de la regla de visibilidad).

##### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |
| `description` | Internal description of this set |

Descripción interna (no se muestra al ciudadano).

#### Sección: Announcements (`section_announcements`)

##### `announcements`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Table |
| `label` | Announcements |
| `options` | `Announcement Set Item` |
| `reqd` | 1 |
| `description` | Announcements shown in portals using this set |

Tabla hija con los anuncios incluidos en el set.

### Permisos

| Rol | create | read | write | delete | export |
|-----|--------|------|-------|--------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 |

---

## 3. Announcement Set Item (DocType child)

**Nombre interno:** `Announcement Set Item`
**Tipo:** Child DocType (`istable: 1`)
**Ruta JSON:** `common_configurations/common_configurations/doctype/announcement_set_item/announcement_set_item.json`
**Editable grid:** 1

### Campos

#### `announcement`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Announcement` |
| `label` | Announcement |
| `reqd` | 1 |
| `in_list_view` | 1 |
| `description` | Announcement to include in this set |

Referencia al `Announcement` a incluir.

#### `display_order`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 0 |
| `in_list_view` | 1 |

Orden de aparición/rotación ascendente. El backend ordena los items por este campo.

#### `is_enabled`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 1 |
| `in_list_view` | 1 |

Si está deshabilitado, el item se excluye (capa 2 de la regla de visibilidad). El filtro `is_enabled=1` se aplica directamente en el query del backend.

---

## Regla de visibilidad (3 capas de flags + vigencia)

Un anuncio aparece en un portal **solo si se cumplen TODAS** estas condiciones (`common_configurations/api/portals/service.py:200-277`, `_get_announcement_set_data`):

```
                 ┌─────────────────────────────────────────────┐
 Portal zone ──▶ │ Announcement Set                            │
                 │   is_active == 1            ◀── CAPA 3       │
                 └───────────────┬─────────────────────────────┘
                                 │ (si el set no está activo, NADA se muestra)
                                 ▼
                 ┌─────────────────────────────────────────────┐
                 │ Announcement Set Item                       │
                 │   is_enabled == 1          ◀── CAPA 2        │
                 └───────────────┬─────────────────────────────┘
                                 │ (items deshabilitados se saltan)
                                 ▼
                 ┌─────────────────────────────────────────────┐
                 │ Announcement                                │
                 │   is_active == 1           ◀── CAPA 1        │
                 │   AND (valid_from is empty OR valid_from <= hoy)  │
                 │   AND (valid_to   is empty OR valid_to   >= hoy)  │
                 └─────────────────────────────────────────────┘
                                 │
                                 ▼
                        Anuncio VISIBLE
```

En resumen:

```
VISIBLE  ⟺  AnnouncementSet.is_active == 1
        AND  AnnouncementSetItem.is_enabled == 1
        AND  Announcement.is_active == 1
        AND  (valid_from vacío  OR  valid_from <= hoy)
        AND  (valid_to   vacío  OR  valid_to   >= hoy)
```

Si tras aplicar el filtro no queda ningún anuncio, `_get_announcement_set_data` devuelve `None` y la zona no se renderiza.

Código del filtro de fechas (`service.py:252-256`), donde `today = frappe.utils.nowdate()`:

```python
if a.valid_from and str(a.valid_from) > today:
    continue
if a.valid_to and str(a.valid_to) < today:
    continue
```

---

## Asignación a un portal

El DocType `Service Portal` tiene una sección **Announcements** con tres campos Link → `Announcement Set` (`announcement_set_left`, `announcement_set_bottom`, `announcement_set_right`) y un Int `announcement_rotation_seconds`. Ver [SERVICE_PORTAL.md](SERVICE_PORTAL.md).

---

## Ejemplo paso a paso

### 1) Crear Announcements

```json
{ "doctype": "Announcement", "title": "Promo Vacunación 2026",
  "content_type": "image", "image": "/files/banner-vacunas.jpg",
  "announcement_type": "promo", "is_active": 1,
  "valid_from": "2026-05-01", "valid_to": "2026-06-30",
  "cta_url": "https://salud.gov.co/vacunas", "cta_target": "_blank" }
```
```json
{ "doctype": "Announcement", "title": "Aviso Mantenimiento",
  "content_type": "text", "heading": "Mantenimiento programado",
  "body": "El portal estará en mantenimiento el sábado de 2am a 4am.",
  "announcement_type": "alert", "is_active": 1 }
```

### 2) Crear un Announcement Set

```json
{
  "doctype": "Announcement Set",
  "title": "Banners Portal Ciudadano",
  "is_active": 1,
  "description": "Banners de la columna izquierda del portal ciudadano",
  "announcements": [
    {"announcement": "Promo Vacunación 2026", "display_order": 1, "is_enabled": 1},
    {"announcement": "Aviso Mantenimiento",   "display_order": 2, "is_enabled": 1}
  ]
}
```

### 3) Asignar el set a una zona del portal

En el `Service Portal`, sección Announcements:

| Campo | Valor |
|-------|-------|
| `announcement_set_left` | `Banners Portal Ciudadano` |
| `announcement_rotation_seconds` | `8` (rota cada 8s; `0` = todos apilados) |

---

## Referencias cruzadas

- [SERVICE_PORTAL.md](SERVICE_PORTAL.md) — campos `announcement_set_left/bottom/right` y `announcement_rotation_seconds`.
- [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md) — feature completa (zonas, rotación, responsive).
- [../api/PORTALS.md](../api/PORTALS.md) — `announcements_left/bottom/right` en la respuesta de `get_portal`.
