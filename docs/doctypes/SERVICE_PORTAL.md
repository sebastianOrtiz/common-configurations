# DocType: Service Portal

DocType **principal** que configura un portal público de servicios (datos, estilos, herramientas y anuncios). El SPA Angular lee esta configuración vía el endpoint `get_portal`.

**Nombre interno:** `Service Portal`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/service_portal/service_portal.json`
**Auto-naming:** `field:portal_name` (el `name` del documento es el `portal_name`)
**Allow rename:** 1
**Index para búsqueda web:** 1

> La especificación funcional/arquitectónica histórica está en [../SERVICE_PORTAL.md](../SERVICE_PORTAL.md). Este documento detalla el DocType campo por campo, incluyendo la nueva sección **Announcements**.

---

## Campos

### Sección: General (`general_section`)

| Campo | Tipo | Label | Default | Reqd | Notas |
|-------|------|-------|---------|------|-------|
| `portal_name` | Data | Portal Name | - | ✅ | Único. Es el `name` del documento |
| `title` | Data | Title | - | ✅ | Título visible al usuario |
| `description` | Small Text | Description | - | - | Descripción del portal |
| `is_active` | Check | Is Active | `1` | - | Portal activo/inactivo |
| `is_internal` | Check | Is Internal | `0` | - | Portal interno: no aparece en la lista de portales (`get_portals` filtra `is_internal=0`); solo accesible vía `portal_redirect` |

### Sección: Security (`security_section`)

| Campo | Tipo | Label | Default | Notas |
|-------|------|-------|---------|-------|
| `require_auth` | Check | Require Authentication | `0` | Si está activo, el usuario debe autenticarse para entrar al portal |
| `enable_mfa_otp` | Check | Enable MFA OTP | `1` | `depends_on: require_auth`. Verificación en dos pasos por OTP SMS |

### Sección: Registration Settings (`configuración_de_registro_section`)

| Campo | Tipo | Label | Notas |
|-------|------|-------|-------|
| `registration_title` | Data | Registration Title | Título del formulario de registro |
| `registration_description` | Small Text | Registration Description | Instrucciones del formulario |

### Sección: Styles (`estilos_section`)

| Campo | Tipo | Label | Default | Notas |
|-------|------|-------|---------|-------|
| `primary_color` | Color | Primary Color | `#000000` | Color principal del tema |
| `secondary_color` | Color | Secondary Color | (`options: #FFFFFF`) | Color secundario |
| `logo` | Attach Image | Logo | - | Logo del portal |
| `background_image` | Attach Image | Background Image | - | Imagen de fondo |
| `custom_css` | HTML Editor | Custom CSS | (`options: CSS`) | CSS personalizado inyectado |

### Sección: Tools (`herramientas_section`)

| Campo | Tipo | Label | Options | Notas |
|-------|------|-------|---------|-------|
| `tools` | Table | Tools | `Service Portal Tool` | Herramientas/botones del portal. Ver [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) |

### Sección: Announcements (`announcements_section`) — NUEVA

Banners configurables en tres zonas del portal. Cada campo apunta a un [`Announcement Set`](ANNOUNCEMENT.md).

#### `announcement_set_left`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Announcement Set` |
| `label` | Left Announcements |
| `description` | Announcement set rendered on the LEFT side of the portal |

Set de anuncios renderizado en la **columna izquierda** (aside, vertical, sticky en desktop).

#### `announcement_set_bottom`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Announcement Set` |
| `label` | Bottom Announcements |
| `description` | Announcement set rendered BELOW the tools grid |

Set renderizado **debajo del grid de herramientas** (tira horizontal centrada).

#### `announcement_set_right`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `Announcement Set` |
| `label` | Right Announcements |
| `description` | Announcement set rendered on the RIGHT side of the portal |

Set renderizado en la **columna derecha** (aside, vertical, sticky en desktop).

#### `column_break_announcements`
Column Break (separador de layout en el formulario).

#### `announcement_rotation_seconds`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `label` | Rotation Interval (seconds) |
| `default` | `0` |
| `description` | Seconds between announcement rotation. 0 = show all stacked (no rotation) |

Intervalo de rotación **global** para las tres zonas:

- `> 0` → se muestra **un anuncio a la vez**, rotando cada N segundos (con dots de navegación).
- `0` → se muestran **todos apilados** (sin rotación).

> Detalle de comportamiento, responsive y regla de visibilidad: [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md).

---

## Orden de campos (`field_order`)

```
general_section, portal_name, title, description, is_active, is_internal,
security_section, require_auth, enable_mfa_otp,
configuración_de_registro_section, registration_title, registration_description,
estilos_section, primary_color, secondary_color, logo, background_image, custom_css,
herramientas_section, tools,
announcements_section, announcement_set_left, announcement_set_bottom,
announcement_set_right, column_break_announcements, announcement_rotation_seconds
```

---

## Permisos

| Rol | create | read | write | delete | export | report |
|-----|--------|------|-------|--------|--------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 | 1 |
| **Portal API User** | 0 | 1 | 0 | 0 | 1 | 1 |

> `Portal API User` solo tiene lectura: es el rol que usa el frontend para leer la configuración del portal.

---

## Lectura desde el frontend

El endpoint `common_configurations.api.portals.get_portal` construye explícitamente la respuesta. Los campos de anuncios se resuelven a través de `_get_announcement_set_data`, que aplica la regla de visibilidad de 3 capas + vigencia (`common_configurations/api/portals/service.py:77-88`):

```python
"announcement_rotation_seconds": getattr(
    portal, "announcement_rotation_seconds", 0
) or 0,
"announcements_left": cls._get_announcement_set_data(
    getattr(portal, "announcement_set_left", None)
),
"announcements_bottom": cls._get_announcement_set_data(
    getattr(portal, "announcement_set_bottom", None)
),
"announcements_right": cls._get_announcement_set_data(
    getattr(portal, "announcement_set_right", None)
),
```

Ver el JSON de respuesta completo en [../api/PORTALS.md](../api/PORTALS.md).

---

## Referencias cruzadas

- [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) — child table `tools`.
- [ANNOUNCEMENT.md](ANNOUNCEMENT.md) — `Announcement Set` / `Announcement` referenciados.
- [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md) — feature de anuncios.
- [../api/PORTALS.md](../api/PORTALS.md) — endpoint `get_portal`.
- [../SERVICE_PORTAL.md](../SERVICE_PORTAL.md) — documento funcional histórico.
