# Feature: Tool `quick_link` (Enlace Directo)

Tipo de herramienta del Service Portal que, al hacer click, **redirige inmediatamente a una URL externa** sin abrir ninguna vista interna del portal.

---

## Caso de uso

Un portal ciudadano quiere ofrecer un botón "Pagar impuestos" que lleve directo al sitio externo de la entidad recaudadora. No tiene sentido abrir una pantalla intermedia ni un panel de enlaces: un solo click debe abrir la URL.

`quick_link` resuelve esto reutilizando un [`External Link`](../doctypes/EXTERNAL_LINK.md): el botón toma label/icono/imagen/color del enlace y al pulsarlo abre su `url`.

---

## Diferencia con `portal_redirect` y `portal_quick_links`

Los tres tipos están registrados por `common_configurations` (`fixtures/tool_type.json`):

| Tool Type | Label | ¿Qué hace al hacer click? | Vista intermedia | Config |
|-----------|-------|---------------------------|------------------|--------|
| `portal_redirect` | Enlace a Portal | Navega a **otro Service Portal** de la misma app | No (cambia de portal) | `target_portal` (Link → Service Portal) |
| `portal_quick_links` | Enlaces Rápidos | Abre una **vista de panel** con varios enlaces dentro del portal | Sí (panel de quick links) | `quick_links` (Link → Portal Quick Links) |
| `quick_link` | Enlace Directo | Redirige **directamente a una URL externa** | **No** (no abre vista) | `quick_link_external` (Link → External Link) |

```
portal_redirect      [Portal A] ──click──▶ [Portal B]  (otro Service Portal interno)
portal_quick_links   [Portal]   ──click──▶ [Panel con lista de enlaces]  (vista interna)
quick_link           [Portal]   ──click──▶ https://sitio-externo.gov.co  (sin vista)
```

---

## Configuración (DocTypes implicados)

### 1. Tool Type (fixture)

`common_configurations/common_configurations/fixtures/tool_type.json`:

```json
{
    "doctype": "Tool Type",
    "name": "quick_link",
    "tool_name": "quick_link",
    "tool_label": "Enlace Directo",
    "app_name": "common_configurations",
    "icon": "ExternalLink",
    "description": "Enlace directo a una URL externa. Al hacer click redirige sin abrir vista del portal",
    "is_active": 1
}
```

### 2. Campo en Service Portal Tool

`Service Portal Tool.quick_link_external` (`service_portal_tool.json`):

| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `External Link` |
| `label` | External Link |
| `depends_on` | `eval:doc.tool_type=='quick_link'` |
| `mandatory_depends_on` | `eval:doc.tool_type=='quick_link'` |

Visible y obligatorio solo cuando `tool_type == 'quick_link'`.

### 3. External Link

El enlace en sí (URL, label, target, icon, image, color). Ver [../doctypes/EXTERNAL_LINK.md](../doctypes/EXTERNAL_LINK.md).

---

## Flujo completo

```
1. Admin crea un External Link            (title, label, url, target, icon, color)
2. Admin agrega una tool al Service Portal con:
       tool_type           = quick_link
       quick_link_external  = <External Link>
3. Frontend pide get_portal
4. Backend (service.py) resuelve el External Link y lo inyecta:
       tool.quick_link_external_data = { name, title, label, url, target, icon, image, color, description }
5. El portal pinta la tarjeta usando los datos del External Link
6. Usuario hace click → window.open / location.href según target
```

### Backend — inyección inline

`common_configurations/api/portals/service.py:133-136`:

```python
if tool.tool_type == "quick_link" and tool_data["quick_link_external"]:
    tool_data["quick_link_external_data"] = cls._get_external_link_data(
        tool_data["quick_link_external"]
    )
```

`_get_external_link_data` solo devuelve el enlace si `is_active = 1`; si no, `quick_link_external_data` queda `None` y el frontend cae al `label`/`icon` propios de la tool.

### Frontend — redirección y rendering

`front_apps/service-portal/src/app/features/portal/portal-view/portal-view.component.ts`.

Al seleccionar la tool (`selectTool`, líneas 121-131):

```typescript
// Quick link: open external URL directly without entering a tool view
if (tool.tool_type === 'quick_link' && tool.quick_link_external_data?.url) {
  const link = tool.quick_link_external_data;
  const target = link.target || '_blank';
  if (target === '_self') {
    window.location.href = link.url;
  } else {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }
  return;
}
```

> No se llama a `this.router.navigate(...)`: la tool `quick_link` nunca entra a una ruta interna `/portal/.../tool/...`.

La tarjeta usa el `External Link` asociado para su apariencia (helpers `getToolLabel`, `getToolIcon`, `getToolImage`, `getToolColor`, líneas 141-180). Para `quick_link`, **preferir** los datos del External Link y caer al valor de la tool si falta:

```typescript
getToolIcon(tool)  → quick_link_external_data.icon  ?? tool.icon ?? 'default'
getToolColor(tool) → quick_link_external_data.color ?? tool.button_color ?? portal.primary_color ?? '#667eea'
getToolLabel(tool) → quick_link_external_data.label ?? tool.label
getToolImage(tool) → quick_link_external_data.image ?? tool.tool_image
```

> `window.open(..., 'noopener,noreferrer')` evita que la pestaña externa acceda a `window.opener` (seguridad).

---

## Cómo configurarla (paso a paso)

1. **Crear el External Link** — Common Configurations > External Link > New:
   - `title`: `Pagos Impuestos` (interno, único)
   - `label`: `Pagar impuestos en línea` (visible)
   - `url`: `https://pagos.municipio.gov.co`
   - `target`: `_blank`
   - `icon`: `CreditCard` · `color`: `#0a7d2e`
   - `is_active`: ✅

2. **Agregar la tool al Service Portal** — abrir el `Service Portal`, sección Tools, nueva fila:
   - `tool_type`: `quick_link`
   - `quick_link_external`: `Pagos Impuestos` (campo que aparece al elegir `quick_link`)
   - `label`: `Pagos` (fallback; el frontend usará el label del External Link)
   - `is_enabled`: ✅
   - `display_order`: el que corresponda

3. **Guardar**. El SPA mostrará la tarjeta y al pulsarla abrirá la URL en nueva pestaña.

---

## Referencias cruzadas

- [../doctypes/EXTERNAL_LINK.md](../doctypes/EXTERNAL_LINK.md) — DocType del enlace.
- [../doctypes/SERVICE_PORTAL_TOOL.md](../doctypes/SERVICE_PORTAL_TOOL.md) — campo `quick_link_external`.
- [../doctypes/TOOL_TYPE.md](../doctypes/TOOL_TYPE.md) — catálogo de tipos.
- [../api/PORTALS.md](../api/PORTALS.md) — `quick_link_external_data` en la respuesta.
- [../frontend/tools/PORTAL_REDIRECT.md](../frontend/tools/PORTAL_REDIRECT.md) / [../frontend/tools/QUICK_LINKS.md](../frontend/tools/QUICK_LINKS.md) — tipos relacionados.
