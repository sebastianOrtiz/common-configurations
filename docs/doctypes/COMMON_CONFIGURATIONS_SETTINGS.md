# DocType: Common Configurations Settings

DocType **Singleton** (`issingle: 1`) que centraliza los feature flags y la configuración general del Service Portal. Hoy en día su responsabilidad principal es habilitar y configurar el **Asistente de Voz** (MVP y modo IA opcional).

- **Tipo:** Single (existe una sola instancia, llamada igual que el DocType)
- **Módulo:** `Common Configurations`
- **Engine:** InnoDB
- **Track changes:** Sí
- **Naming rule:** Random (irrelevante por ser Singleton)
- **Archivo JSON:** `common_configurations/common_configurations/doctype/common_configurations_settings/common_configurations_settings.json`
- **Archivo Python:** `common_configurations/common_configurations/doctype/common_configurations_settings/common_configurations_settings.py`

---

## Secciones y campos

El layout del DocType se organiza en dos secciones controladas por dependencias:

```
[Section] Voice Assistant
    ├─ enable_voice_assistant          (Check)
    ├─ voice_assistant_name            (Data, depende del flag)
    ├─ voice_assistant_gender          (Select, depende del flag)
    └─ [Column Break]
        └─ voice_assistant_language    (Select, depende del flag)

[Section] Modo Inteligente (IA)  (depende del flag)
    ├─ enable_voice_assistant_ai       (Check)
    ├─ voice_assistant_ai_configuration (Link → AI Configuration)
    └─ [Column Break]
        └─ voice_assistant_ai_help_html (HTML estático informativo)
```

### Campos del asistente de voz (MVP)

| Campo | Tipo | Default | Depende de | Descripción |
|-------|------|---------|------------|-------------|
| `enable_voice_assistant` | Check | `0` | — | Habilita el asistente de voz en el portal. Cuando está activo y el navegador soporta TTS/STT, aparece el componente flotante en los formularios que lo integran. |
| `voice_assistant_name` | Data | `"Asistente"` | `enable_voice_assistant` | Nombre con el que el asistente se presenta al usuario. Ejemplos: `Asistente`, `Nora`, `Nexa`. Se usa literalmente en el saludo inicial (`Hola, soy {nombre}...`). |
| `voice_assistant_gender` | Select (`female`/`male`) | `female` | `enable_voice_assistant` | Género preferido de la voz. El frontend elige la mejor voz disponible que coincida con el idioma **y** este género (ver `tts.service.ts`). |
| `voice_assistant_language` | Select (`es-ES`, `es-CO`, `es-MX`, `en-US`) | `es-ES` | `enable_voice_assistant` | Idioma de síntesis (TTS) y reconocimiento (STT). |

### Campos del modo IA

| Campo | Tipo | Default | Depende de | Obligatorio si | Descripción |
|-------|------|---------|------------|----------------|-------------|
| `enable_voice_assistant_ai` | Check | `0` | `enable_voice_assistant` | — | Activa el modo IA (parseo natural). Requiere una `AI Configuration` válida. **No basta con marcarlo:** además debe pasar las validaciones del controller. |
| `voice_assistant_ai_configuration` | Link → `AI Configuration` | — | `enable_voice_assistant_ai` | `enable_voice_assistant_ai` | Configuración de IA que el asistente usará (proveedor, modelo, API key). |
| `voice_assistant_ai_help_html` | HTML estático | — | `enable_voice_assistant_ai` | — | Bloque informativo sobre las validaciones que se ejecutan al guardar. No es editable por el usuario; viene fijo en el JSON. |

> El `mandatory_depends_on` de `voice_assistant_ai_configuration` está en `eval:doc.enable_voice_assistant_ai`, así que el campo solo es requerido cuando el modo IA está activo.

---

## Validaciones del controller

El controller (`common_configurations_settings.py`) implementa una única validación de alto nivel en `validate()`:

```python
def validate(self):
    self._validate_voice_assistant_ai()
```

### `_validate_voice_assistant_ai()`

Solo corre cuando `enable_voice_assistant_ai` está marcado. Si está apagado, no hace nada.

| # | Check | Mensaje de error |
|---|-------|------------------|
| 1 | El asistente de voz general (`enable_voice_assistant`) está habilitado | `"Habilita primero el Asistente de Voz antes de activar el Modo IA"` |
| 2 | Hay una `AI Configuration` seleccionada en `voice_assistant_ai_configuration` | `"Debes seleccionar una Configuración de IA para activar el Modo IA"` |
| 3 + | Llama a `validate_ai_configuration(name)` y agrega como `<br>•` cada issue retornado | `"La Configuración de IA seleccionada no es válida:<br>• <issue1><br>• <issue2>..."` |

### `validate_ai_configuration(config_name) -> List[str]`

Helper público (también usado por el endpoint `diagnose_voice_assistant_ai`). Recibe el `name` de una `AI Configuration` y retorna una lista de problemas. Lista vacía = configuración válida.

Los **cinco checks** que ejecuta, en orden:

| # | Verificación | Issue cuando falla |
|---|--------------|--------------------|
| 1 | Existe el documento `AI Configuration` con ese name | `"La Configuración de IA '{0}' no existe"` (se retorna y se cortan los siguientes checks) |
| 2 | `ai.is_active` es verdadero | `"La Configuración de IA '{0}' no está activa"` |
| 3a | `ai.provider` está definido | `"La Configuración de IA '{0}' no tiene Proveedor configurado"` |
| 3b | El `AI Provider` existe y tiene `is_active = 1` | `"El Proveedor '{0}' no existe"` o `"El Proveedor '{0}' está desactivado"` |
| 4 | `ai.model` está definido | `"La Configuración de IA '{0}' no tiene Modelo configurado"` |
| 5 | `ai.get_password("api_key", raise_exception=False)` devuelve un valor no vacío | `"La Configuración de IA '{0}' no tiene API Key configurada"` |

> El check 3a/3b son una sola "etapa lógica" del listado: si no hay provider, se reporta esa falta; si hay pero no existe el documento o está desactivado, se reporta el sub-issue correspondiente.

> Todos los issues se acumulan (no se cortan en el primero) excepto el check #1 — si la `AI Configuration` no existe, no tiene sentido seguir.

---

## Permisos

| Rol | Read | Write | Create | Delete | Print | Otros |
|-----|------|-------|--------|--------|-------|-------|
| `System Manager` | ✔ | ✔ | ✔ | ✘ | ✔ | — |
| `Common Config Manager` | ✔ | ✔ | ✔ | ✘ | ✔ | — |

> No tiene permisos públicos (solo administradores). El frontend lee los valores vía el endpoint público `get_public_settings`, que **omite** los campos sensibles como la API key.

---

## Acceso desde código

### Lectura cacheada (preferido)

Como es un Singleton, usar siempre `get_cached_doc` para evitar queries innecesarias:

```python
import frappe

settings = frappe.get_cached_doc("Common Configurations Settings")

if settings.enable_voice_assistant:
    print(f"Asistente: {settings.voice_assistant_name}")
    print(f"Idioma: {settings.voice_assistant_language}")
    print(f"Género: {settings.voice_assistant_gender}")
```

### Lectura sin cache (para escritura)

Usar `get_doc` cuando se va a modificar:

```python
settings = frappe.get_doc("Common Configurations Settings")
settings.enable_voice_assistant = 1
settings.voice_assistant_name = "Nora"
settings.save()  # dispara validate() automáticamente
```

### Lectura de un campo individual (más eficiente)

```python
enabled = frappe.db.get_single_value(
    "Common Configurations Settings",
    "enable_voice_assistant",
)
```

### Helper para validar IA desde otro código

```python
from common_configurations.common_configurations.doctype.common_configurations_settings.common_configurations_settings import (
    validate_ai_configuration,
)

issues = validate_ai_configuration("Default OpenAI")
if issues:
    for issue in issues:
        print(f"• {issue}")
```

---

## Flujo de datos hacia el frontend

```
┌────────────────────────────────────────────┐
│ Common Configurations Settings (Singleton) │
└──────────────────┬─────────────────────────┘
                   │ frappe.get_cached_doc()
                   ▼
┌────────────────────────────────────────────┐
│ get_public_settings()  (allow_guest=True)  │ ← api/settings/endpoints.py
│  - Filtra campos sensibles                 │
│  - Calcula ai_enabled efectivo             │
└──────────────────┬─────────────────────────┘
                   │ HTTP GET (JSON)
                   ▼
┌────────────────────────────────────────────┐
│ SettingsService  (Angular signal)          │ ← core/services/settings.service.ts
│  - Cargado en APP_INITIALIZER (boot)       │
│  - Expuesto como signal readonly           │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│ VoiceAssistantComponent (featureAvailable) │
└────────────────────────────────────────────┘
```

> Detalles del endpoint: ver [api/SETTINGS.md](../api/SETTINGS.md).
> Detalles del componente y el flujo completo del asistente: ver [features/VOICE_ASSISTANT.md](../features/VOICE_ASSISTANT.md).

---

## Snapshot de campos (referencia rápida)

```python
{
    "enable_voice_assistant": 0 | 1,
    "voice_assistant_name": "Asistente",
    "voice_assistant_gender": "female" | "male",
    "voice_assistant_language": "es-ES" | "es-CO" | "es-MX" | "en-US",
    "enable_voice_assistant_ai": 0 | 1,
    "voice_assistant_ai_configuration": "<name de AI Configuration>" | None,
    # voice_assistant_ai_help_html: HTML estático informativo (no persistido como dato)
}
```
