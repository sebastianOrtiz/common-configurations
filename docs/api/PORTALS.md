# API: Portals

Endpoints HTTP para que el SPA del Service Portal lea la configuración de los portales y sus herramientas.

**Base path:** `common_configurations.api.portals.*`
**Archivo:** `common_configurations/api/portals/endpoints.py`

---

## Resumen

| Endpoint | Método | Auth | Rate limit |
|----------|--------|------|------------|
| `get_portals` | GET | Guest | 30 req/min/IP |
| `get_portal` | GET | Guest | 30 req/min/IP |

---

## 1. `get_portals`

Devuelve la lista de Service Portals **activos y no internos**, con información básica para mostrar como tarjetas en el listado.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_portals():
    check_rate_limit("get_portals", limit=30, seconds=60)
    return PortalService.get_all_active()
```

### Sin parámetros.

### Filtro

```python
filters={"is_active": 1, "is_internal": 0}
```

Solo portales con `is_active = 1` Y `is_internal = 0`. Los portales internos solo se acceden por `portal_redirect` desde otra tool.

### Respuesta

```json
[
  {
    "name": "consultas-municipio",
    "portal_name": "consultas-municipio",
    "title": "Portal de Consultas",
    "description": "Agenda y consulta tus trámites",
    "logo": "/files/logo-consultas.png",
    "primary_color": "#003366",
    "require_auth": 1
  },
  {
    "name": "agendamiento_citas",
    "portal_name": "agendamiento_citas",
    ...
  }
]
```

Solo se incluyen los campos: `name`, `portal_name`, `title`, `description`, `logo`, `primary_color`, `require_auth`.

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.portals.get_portals" \
  -H "Accept: application/json"
```

---

## 2. `get_portal`

Devuelve la configuración **completa** de un portal específico, incluyendo todas sus tools (con los custom fields agregados por otras apps inyectados) y, si aplica, los datos inline de `Portal Quick Links`.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_portal(portal_name: str):
    check_rate_limit("get_portal", limit=30, seconds=60)
    if not portal_name:
        frappe.throw(_("Portal name is required"))
    portal_name = sanitize_string(portal_name, 140)
    result = PortalService.get_by_name(portal_name)
    if not result:
        frappe.throw(_("Portal not found"), frappe.DoesNotExistError)
    return result
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `portal_name` | string | Sí | El `portal_name` del Service Portal (no el `name` Frappe). Sanitizado a 140 chars |

### Respuesta

```json
{
  "name": "consultas-municipio",
  "portal_name": "consultas-municipio",
  "title": "Portal de Consultas",
  "description": "Agenda y consulta tus trámites",
  "is_active": 1,
  "registration_title": "Regístrate para continuar",
  "registration_description": "Necesitamos algunos datos básicos",
  "primary_color": "#003366",
  "secondary_color": "#FFFFFF",
  "logo": "/files/logo-consultas.png",
  "background_image": "/files/bg.jpg",
  "custom_css": ".portal-container { ... }",
  "require_auth": 1,
  "enable_mfa_otp": 1,
  "announcement_rotation_seconds": 8,
  "announcements_left": {
    "name": "Banners Portal Ciudadano",
    "title": "Banners Portal Ciudadano",
    "announcements": [
      {
        "name": "Promo Vacunación 2026",
        "content_type": "image",
        "announcement_type": "promo",
        "image": "/files/banner-vacunas.jpg",
        "heading": null,
        "body": null,
        "html_content": null,
        "cta_url": "https://salud.gov.co/vacunas",
        "cta_target": "_blank"
      }
    ]
  },
  "announcements_bottom": null,
  "announcements_right": null,
  "tools": [
    {
      "name": "abc123",
      "tool_type": "meet_scheduling",
      "label": "Agendar Cita",
      "tool_description": "Reserva tu cita médica",
      "icon": "Calendar",
      "tool_image": null,
      "button_color": "#0099CC",
      "display_order": 1,
      "is_enabled": 1,
      "calendar_resource": "CR-CARDIOLOGIA",
      "show_calendar_view": null,
      "slot_duration_minutes": null,
      "target_portal": null,
      "quick_links": null,
      "quick_link_external": null,
      "logbook_availability": null,
      "logbook_procedures_config": null,
      "pqr_type_set": null,
      "pqr_allow_anonymous": null
    },
    {
      "name": "def456",
      "tool_type": "portal_quick_links",
      "label": "Enlaces Útiles",
      "...": "...",
      "quick_links": "Trámites Ciudadanos",
      "quick_links_data": {
        "name": "Trámites Ciudadanos",
        "link_group_name": "Trámites Ciudadanos",
        "description": "Enlaces externos frecuentes",
        "icon": "Link",
        "image": null,
        "links": [
          {
            "name": "RUT DIAN",
            "title": "RUT DIAN",
            "label": "RUT",
            "url": "https://muisca.dian.gov.co",
            "target": "_blank",
            "icon": "ExternalLink",
            "image": null,
            "color": null,
            "description": null,
            "display_order": 1,
            "is_enabled": 1
          }
        ]
      }
    },
    {
      "name": "ghi789",
      "tool_type": "quick_link",
      "label": "Pagos",
      "...": "...",
      "quick_link_external": "Pagos Impuestos",
      "quick_link_external_data": {
        "name": "Pagos Impuestos",
        "title": "Pagos Impuestos",
        "label": "Pagar impuestos en línea",
        "url": "https://pagos.municipio.gov.co",
        "target": "_blank",
        "icon": "CreditCard",
        "image": null,
        "color": "#0a7d2e",
        "description": null
      }
    }
  ]
}
```

> **Cambios recientes en el response:**
> - `announcement_rotation_seconds`, `announcements_left`, `announcements_bottom`, `announcements_right` (nivel raíz). Cada zona es `null` si no hay set o ningún anuncio visible. Resueltos por `_get_announcement_set_data` aplicando la regla de visibilidad de 3 capas + vigencia.
> - En cada tool: `quick_link_external`, `pqr_type_set`, `pqr_allow_anonymous`.
> - `quick_links_data.links[]` ahora trae el **External Link resuelto** (`name`, `title`, `label`, `url`, `target`, `icon`, `image`, `color`, `description`) + `display_order`/`is_enabled` del item (antes traía `label`/`icon`/`image`/`url`/`target` propios del item).
> - Para tools `quick_link`: `quick_link_external_data` con el External Link resuelto.

### Particularidades del armado de tools

1. **Tools `portal_redirect` con destino inválido se descartan**:
   - Si `tool.target_portal` está vacío → se omite.
   - Si el portal destino no está `is_active=1` → se omite.

2. **Custom fields de apps externas** se leen con `getattr(tool, field, None)`:
   - `calendar_resource` (meet_scheduling)
   - `logbook_availability`, `logbook_procedures_config` (logbook)
   - `pqr_type_set`, `pqr_allow_anonymous` (pqr)
   - `target_portal` (interno common_configurations — `portal_redirect`)
   - `quick_links` (interno common_configurations — `portal_quick_links`)
   - `quick_link_external` (interno common_configurations — `quick_link`)
   - `show_calendar_view`, `slot_duration_minutes` (reservados para futuras tools)

3. **Quick Links inline**: si `tool_type == 'portal_quick_links'` y `quick_links` no está vacío, se llama a `_get_quick_links_data()`, que ahora **resuelve cada `external_link`** del item a través de `_get_external_link_data` (filtra `is_active=1` en grupo, `is_enabled=1` en item, `is_active=1` en cada External Link) y ordena por `display_order`. Evita un segundo round-trip.

4. **Quick Link directo inline**: si `tool_type == 'quick_link'` y `quick_link_external` no está vacío, se llama a `_get_external_link_data()` y el resultado se inyecta como `quick_link_external_data`. Ver [../features/QUICK_LINK_TOOL.md](../features/QUICK_LINK_TOOL.md).

5. **Anuncios inline**: a nivel raíz, `announcements_left/bottom/right` se resuelven con `_get_announcement_set_data()`, que aplica la regla de visibilidad: `Announcement Set.is_active` AND `Announcement Set Item.is_enabled` AND `Announcement.is_active` AND vigencia `valid_from`/`valid_to` contra `frappe.utils.nowdate()`. Si no queda ningún anuncio visible, la zona devuelve `null`. Ver [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md).

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.portals.get_portal?portal_name=consultas-municipio" \
  -H "Accept: application/json"
```

### Errores comunes

| Caso | Excepción | Status HTTP |
|------|-----------|-------------|
| `portal_name` vacío | `frappe.ValidationError` | 417 |
| Portal no encontrado o inactivo | `frappe.DoesNotExistError` | 404 |
| Rate limit excedido | `frappe.TooManyRequestsError` | 429 |

---

## Capa de servicio (`api/portals/service.py`)

`PortalService.get_by_name()` es el método más complejo. Construye explícitamente la respuesta para:

1. Filtrar campos sensibles (no se expone nada del DocType padre que no esté listado).
2. Permitir que custom fields de otras apps "viajen" al frontend sin que `common_configurations` los conozca uno por uno (vía `getattr(tool, field, None)`).
3. Aplicar reglas de negocio (descartar redirects inválidos, filtrar quick links inactivos).

```python
@classmethod
def get_by_name(cls, portal_name: str) -> Optional[Dict[str, Any]]:
    if not frappe.db.exists(
        "Service Portal", {"portal_name": portal_name, "is_active": 1}
    ):
        return None

    portal = frappe.get_doc("Service Portal", portal_name)

    result = {
        "name": portal.name,
        "portal_name": portal.portal_name,
        # ... resto de campos básicos
        "tools": [],
    }

    for tool in portal.tools:
        # Filtrar redirects inválidos
        if tool.tool_type == "portal_redirect":
            target = getattr(tool, "target_portal", None)
            if not target:
                continue
            if not frappe.db.get_value("Service Portal", target, "is_active"):
                continue

        tool_data = { ... }

        if tool.tool_type == "portal_quick_links" and tool_data["quick_links"]:
            tool_data["quick_links_data"] = cls._get_quick_links_data(
                tool_data["quick_links"]
            )

        result["tools"].append(tool_data)

    return result
```

---

## Cómo agregar soporte para una nueva tool

Si una nueva app agrega un custom field al `Service Portal Tool` (ej. `dispatcher_zone`), debe:

1. **Crear el Custom Field via fixture** (con `depends_on: eval:doc.tool_type=='mi_tool'`).
2. **Actualizar `PortalService.get_by_name()`** agregando una línea:

```python
tool_data["dispatcher_zone"] = getattr(tool, "dispatcher_zone", None)
```

> Alternativamente, el frontend Angular puede leerlo directamente con `(tool as any).dispatcher_zone` si el backend no lo expone (Frappe lo incluye automáticamente al hacer `portal.as_dict()`, pero el service.py de `common_configurations` filtra explícitamente).

---

## Referencias cruzadas

- [../doctypes/SERVICE_PORTAL_TOOL.md](../doctypes/SERVICE_PORTAL_TOOL.md) — Estructura de la child table.
- [../doctypes/TOOL_TYPE.md](../doctypes/TOOL_TYPE.md) — Catálogo extensible.
- [../doctypes/PORTAL_QUICK_LINKS.md](../doctypes/PORTAL_QUICK_LINKS.md) — Grupos de enlaces inline (ahora vía External Link).
- [../doctypes/EXTERNAL_LINK.md](../doctypes/EXTERNAL_LINK.md) — DocType reutilizable de enlace externo.
- [../doctypes/ANNOUNCEMENT.md](../doctypes/ANNOUNCEMENT.md) — Announcement / Set / Set Item.
- [../doctypes/SERVICE_PORTAL.md](../doctypes/SERVICE_PORTAL.md) — DocType `Service Portal` (sección Announcements).
- [../features/QUICK_LINK_TOOL.md](../features/QUICK_LINK_TOOL.md) — Tool `quick_link`.
- [../features/ANNOUNCEMENTS.md](../features/ANNOUNCEMENTS.md) — Módulo de anuncios.
- [../HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md) — Guía paso a paso.
