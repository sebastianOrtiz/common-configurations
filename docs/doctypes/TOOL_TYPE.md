# DocType: Tool Type

**Nombre interno:** `Tool Type`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/tool_type/tool_type.json`
**Tipo:** Standard DocType
**Auto-naming:** `field:tool_name` (el `name` es igual al `tool_name`)
**Allow rename:** 1

---

## Propósito

`Tool Type` es el **catálogo extensible** de tipos de herramienta disponibles en el Service Portal. Cada app del ecosistema registra sus tipos vía fixture, sin tocar `common_configurations`.

Cuando un admin crea una fila en `Service Portal Tool`, el campo `tool_type` muestra las opciones registradas en este catálogo, filtradas por `is_active = 1`.

---

## Campos

### `tool_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Tool Name |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |

Identificador único en `snake_case` (ej. `meet_scheduling`, `my_appointments`, `create_logbook`). Es el `name` del documento porque el naming rule es `field:tool_name`.

### `tool_label`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Tool Label |
| `reqd` | 1 |
| `in_list_view` | 1 |

Nombre visible para los administradores en el desk (ej. "Agendamiento de Citas").

### `app_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | App Name |
| `reqd` | 1 |
| `in_list_view` | 1 |

Nombre del paquete Frappe que provee la herramienta (ej. `meet_scheduling`, `logbook`, `lex_app`). Se usa como filtro en `hooks.py` para que cada app exporte solo sus propios `Tool Type`:

```python
fixtures = [
    {
        "doctype": "Tool Type",
        "filters": [["app_name", "=", "common_configurations"]]
    }
]
```

### `icon`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Select |
| `label` | Icon |
| `translatable` | 0 |

Icono Lucide por defecto. Lista de opciones idéntica a la de `Service Portal Tool.icon` (ver [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md)).

### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |

Descripción de la herramienta.

### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `label` | Is Active |
| `default` | 1 |

Si está desactivado, el tool type no aparece en el selector al editar `Service Portal Tool`.

---

## Permisos

| Rol | create | read | write | delete | export | report |
|-----|--------|------|-------|--------|--------|--------|
| **System Manager** | 1 | 1 | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 | 1 | 1 |
| **Portal API User** | 0 | 1 | 0 | 0 | 1 | 1 |

---

## Cómo cada app registra sus Tool Types (via fixture)

Cada app crea un archivo `<app>/fixtures/tool_type.json` con la lista de tipos. Frappe los sincroniza al ejecutar `bench migrate`.

Ejemplo (`meet_scheduling/fixtures/tool_type.json`):

```json
[
  {
    "doctype": "Tool Type",
    "name": "meet_scheduling",
    "tool_name": "meet_scheduling",
    "tool_label": "Agendamiento de Citas",
    "app_name": "meet_scheduling",
    "icon": "Calendar",
    "description": "Permite agendar citas según disponibilidad de Calendar Resources",
    "is_active": 1
  }
]
```

Para que Frappe lo exporte correctamente al hacer `bench export-fixtures`, la app debe declarar el filtro en su `hooks.py`:

```python
fixtures = [
    {
        "dt": "Tool Type",
        "filters": [["app_name", "=", "meet_scheduling"]]
    }
]
```

---

## Lista completa de Tool Types existentes en el ecosistema

> Estado al momento de redactar este documento. La lista crece cuando se agregan nuevas apps.

### Definidos por `common_configurations`

Fixture: `common_configurations/fixtures/tool_type.json`

| `tool_name` | `tool_label` | Icon | Descripción |
|-------------|--------------|------|-------------|
| `portal_redirect` | Enlace a Portal | ExternalLink | Redirige al usuario a otro Service Portal. Requiere campo extra `target_portal`. |
| `portal_quick_links` | Enlaces Rápidos | Link | Muestra un panel de enlaces rápidos configurables. Requiere campo extra `quick_links`. |

### Definidos por `meet_scheduling`

Fixture: `meet_scheduling/fixtures/tool_type.json`

| `tool_name` | `tool_label` | Icon | Descripción |
|-------------|--------------|------|-------------|
| `meet_scheduling` | Agendamiento de Citas | Calendar | Permite agendar citas según disponibilidad de Calendar Resources. Requiere `calendar_resource`. |
| `my_appointments` | Mis Citas | ClipboardList | Visualiza y gestiona tus citas agendadas. Sin campos extra. |

### Definidos por `logbook`

Fixture: `logbook/fixtures/tool_type.json`

| `tool_name` | `tool_label` | Icon | Descripción |
|-------------|--------------|------|-------------|
| `my_logbook` | Mi Bitácora | ClipboardList | Visualiza y gestiona tus entradas de bitácora. Sin campos extra. |
| `create_logbook` | Crear Bitácora | FilePlus | Crea una entrada de bitácora sin agendar. Requiere `logbook_availability`. |
| `procedures` | Trámites | ClipboardCheck | Consulta y realiza trámites disponibles. Requiere `logbook_procedures_config`. |

### Definidos por `lex_app`

Fixture: `lex_app/fixtures/tool_type.json`

| `tool_name` | `tool_label` | Icon | Descripción |
|-------------|--------------|------|-------------|
| `my_cases` | Mis Casos | Briefcase | Visualiza y gestiona tus casos legales. Sin campos extra. |

---

## Resumen visual del sistema

```
+--------------------+        +------------------------+        +-----------------+
| Service Portal     |   1..N | Service Portal Tool    |  1..1  | Tool Type       |
| (DocType padre)    |------->| (child table)          |------->| (catálogo)      |
|                    |        | tool_type = Link       |        | tool_name (PK)  |
| tools[] -->        |        | label, icon, etc.      |        | app_name, icon  |
+--------------------+        | + custom fields por    |        +-----------------+
                              |   tool_type            |              ^
                              +------------------------+              |
                                                                       | fixture
                                                          +-----------------------+
                                                          | hooks.py de cada app  |
                                                          | filtra por app_name   |
                                                          +-----------------------+
```

---

## Referencias cruzadas

- [SERVICE_PORTAL_TOOL.md](SERVICE_PORTAL_TOOL.md) — DocType que usa este catálogo.
- [../SERVICE_PORTAL.md](../SERVICE_PORTAL.md) — DocType padre del Service Portal.
- [../HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md) — Guía paso a paso para registrar un nuevo `Tool Type` desde otra app.
- [../hooks.md](../hooks.md) — `fixtures` y filtros por `app_name`.
