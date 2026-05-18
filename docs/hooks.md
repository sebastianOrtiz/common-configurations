# Documentación de `hooks.py`

`common_configurations/hooks.py` configura los enganches de Frappe Framework para la app: metadatos, fixtures, reglas de rutas web. La mayoría de los hooks tradicionales (`doc_events`, `scheduler_events`, `after_install`, etc.) están **comentados** porque la app no los necesita actualmente.

**Ruta:** `common_configurations/hooks.py`

---

## Metadatos básicos

```python
app_name = "common_configurations"
app_title = "Common Configurations"
app_publisher = "Sebastian Ortiz Valencia"
app_description = "Aplciacion que contiene modelos basicos del sistema de workflows"
app_email = "sebastianortiz989@gmail.com"
app_license = "mit"
```

---

## Fixtures

`hooks.py:11-24`:

```python
fixtures = [
    {
        "doctype": "Role",
        "filters": [["name", "in", ["Common Config Manager", "Portal API User"]]]
    },
    {
        "doctype": "Tool Type",
        "filters": [["app_name", "=", "common_configurations"]]
    },
    {
        "doctype": "AI Provider",
        "filters": [["name", "in", ["OpenAI", "Anthropic", "Google"]]]
    }
]
```

### 1) Roles

Archivo: `common_configurations/fixtures/role.json`

Crea dos roles propios:

#### `Common Config Manager`

- `desk_access: 1` — Puede acceder al desk Frappe.
- CRUD completo sobre `User contact`, `Tool Type`, `Service Portal`, `AI Provider`, `AI Configuration`, `Portal Quick Links`, etc.

#### `Portal API User`

- `desk_access: 0` — Sin acceso al desk.
- Lectura limitada para usuarios "puente" cuando otra app necesita permisos mínimos.

### 2) Tool Types

Archivo: `common_configurations/fixtures/tool_type.json`

Filtra por `app_name = "common_configurations"`. La app provee 2 tool types:

| `tool_name` | `tool_label` | Icon | Función |
|-------------|--------------|------|---------|
| `portal_redirect` | Enlace a Portal | ExternalLink | Redirige a otro Service Portal |
| `portal_quick_links` | Enlaces Rápidos | Link | Panel de enlaces configurables |

> Otras apps registran sus propios `Tool Type` con sus propias fixtures filtradas por su `app_name`. Ver [doctypes/TOOL_TYPE.md](doctypes/TOOL_TYPE.md).

### 3) AI Providers

Archivo: `common_configurations/fixtures/ai_provider.json`

Crea 3 proveedores con sus modelos:

- **OpenAI**: `gpt-4.1` (default), `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`
- **Anthropic**: `claude-sonnet-4-20250514` (default), `claude-opus-4-20250514`, `claude-haiku-4-5-20251001`
- **Google**: `gemini-2.5-flash` (default), `gemini-2.5-pro`

> Detalle completo en [doctypes/AI_CONFIGURATION.md](doctypes/AI_CONFIGURATION.md).

---

## Website Route Rules

`hooks.py:29-31`:

```python
website_route_rules = [
    {"from_route": "/service-portal/<path:app_path>", "to_route": "service-portal"}
]
```

Permite que el **routing del lado del cliente Angular** funcione. Cualquier ruta bajo `/service-portal/*` se sirve usando `www/service-portal.html` (que es el `index.html` del SPA), dejando que el Angular Router maneje la subruta internamente.

Ejemplos de URLs que esto habilita:

- `/service-portal/` → home del SPA
- `/service-portal/portal/consultas-municipio` → vista de un portal
- `/service-portal/portal/consultas-municipio/register` → formulario
- `/service-portal/portal/consultas-municipio/meet_scheduling` → vista de tool

Sin esta regla, Frappe devolvería 404 para todas las subrutas.

---

## Hooks comentados (no usados actualmente)

El `hooks.py` mantiene comentadas plantillas de los siguientes hooks. Si en el futuro se necesitan, basta con descomentar y rellenar:

### `before_install` / `after_install`

```python
# before_install = "common_configurations.install.before_install"
# after_install = "common_configurations.install.after_install"
```

> Actualmente la app **no tiene `install.py`**. Los roles, Tool Types y AI Providers se crean **solo via fixtures** al ejecutar `bench migrate`. Si se necesita instalación programática (por ejemplo crear custom fields, instalar dependencias adicionales), se puede agregar `install.py` y descomentar este hook.

### `doc_events`

```python
# doc_events = {
#     "*": {
#         "on_update": "method",
#         "on_cancel": "method",
#         "on_trash": "method"
#     }
# }
```

> Actualmente **NO hay `doc_events`** registrados. Toda la lógica de negocio para `User contact` ocurre en los endpoints de `api/contacts/service.py`, no en hooks del DocType.

### `scheduler_events`

```python
# scheduler_events = {
#     "all": [...],
#     "daily": [...],
#     "hourly": [...],
#     ...
# }
```

> Actualmente **NO hay tareas programadas**. Si en el futuro se necesita limpieza periódica (ej. tokens expirados, OTPs viejos, cache de registros pendientes), agregar tareas aquí.

### `auth_hooks`

```python
# auth_hooks = ["common_configurations.auth.validate"]
```

> No usado. El sistema de auth de User Contact NO se integra con el flujo de auth nativo de Frappe (es paralelo).

### Otros hooks comentados (sin uso)

- `permission_query_conditions`, `has_permission` — Permisos custom.
- `override_doctype_class`, `override_whitelisted_methods` — Sobrescritura.
- `before_request`, `after_request`, `before_job`, `after_job` — Eventos request/job.
- `user_data_fields` — Para GDPR.
- `notification_config` — Notificaciones del desk.
- `app_include_css`, `app_include_js`, `webform_include_js` — Includes en HTML.
- `add_to_apps_screen` — App tile en la pantalla principal.

---

## Cómo otras apps interactúan con `common_configurations` via hooks

Otras apps (logbook, meet_scheduling, lex_app) NO modifican el `hooks.py` de `common_configurations`. En cambio, declaran sus propios fixtures en sus respectivos `hooks.py`:

```python
# meet_scheduling/hooks.py
fixtures = [
    {
        "dt": "Tool Type",
        "filters": [["app_name", "=", "meet_scheduling"]]
    },
    {
        "dt": "Custom Field",
        "filters": [["name", "in", [
            "Service Portal Tool-calendar_resource",
        ]]]
    }
]
```

Al ejecutar `bench migrate`, Frappe combina los fixtures de todas las apps:

1. `common_configurations` instala `Tool Type` con `app_name=common_configurations`.
2. `meet_scheduling` instala `Tool Type` con `app_name=meet_scheduling` Y `Custom Fields` en `Service Portal Tool`.
3. `logbook` instala sus tools + custom fields.
4. `lex_app` instala sus tools + custom fields.

Resultado: el catálogo `Tool Type` queda poblado con todas las opciones, y `Service Portal Tool` tiene custom fields condicionados a cada `tool_type`.

---

## CLI commands custom

`commands.py` registra un comando `bench` adicional:

```python
# common_configurations/commands.py:70
commands = [build_service_portal]
```

Frappe lo carga automáticamente porque `commands` está al nivel del package raíz.

Uso:

```bash
bench build-service-portal         # ng build
bench build-service-portal --watch # ng build --watch
```

> Ver [features/SERVICE_PORTAL_FRONTEND.md](features/SERVICE_PORTAL_FRONTEND.md#build-y-deploy).

---

## Configuración no estándar

### `export_python_type_annotations`

Comentado en `hooks.py:264`:

```python
# export_python_type_annotations = True
```

Si se activa, Frappe genera type hints automáticamente para los controladores de DocType. La app no lo usa actualmente.

### `default_log_clearing_doctypes`

Comentado:

```python
# default_log_clearing_doctypes = {
#     "Logging DocType Name": 30  # days to retain logs
# }
```

No usado.

---

## Referencias cruzadas

- [INSTALL.md](INSTALL.md) — Proceso de instalación (que ejecuta las fixtures).
- [doctypes/TOOL_TYPE.md](doctypes/TOOL_TYPE.md) — Cómo las apps agregan tool types.
- [doctypes/AI_CONFIGURATION.md](doctypes/AI_CONFIGURATION.md) — AI Providers seedeados.
- [features/SERVICE_PORTAL_FRONTEND.md](features/SERVICE_PORTAL_FRONTEND.md) — `website_route_rules` y comando `bench build-service-portal`.
