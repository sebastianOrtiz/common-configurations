# DocTypes: AI Provider, AI Model y AI Configuration

Documentación del sistema de configuración para proveedores de Inteligencia Artificial. La app soporta de fábrica **OpenAI**, **Anthropic** y **Google** (Gemini).

---

## AI Provider (catálogo de proveedores)

**Nombre interno:** `AI Provider`
**Módulo:** Common Configurations
**Ruta JSON:** `common_configurations/common_configurations/doctype/ai_provider/ai_provider.json`
**Tipo:** Standard DocType
**Auto-naming:** `field:provider_name` (el `name` es el `provider_name`)
**Track changes:** 1

### Propósito

Catálogo de proveedores de IA disponibles. Cada registro lista los **modelos** que ese proveedor ofrece, con valores por defecto de `temperature` y `max_tokens`.

### Campos

#### Sección: General

##### `provider_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Provider Name |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |
| `description` | Nombre del proveedor de IA (ej: OpenAI, Anthropic, Google) |

##### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |
| `label` | Description |

Descripción libre.

#### Sección: Available Models

##### `models`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Table |
| `options` | `AI Model` |
| `reqd` | 1 |

Tabla hija con los modelos disponibles para el proveedor.

### Permisos

| Rol | create | read | write | delete |
|-----|--------|------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 |

### Fixtures incluidas por defecto

Fixture: `common_configurations/fixtures/ai_provider.json`. La app instala automáticamente 3 proveedores:

#### `OpenAI`

Modelos: `gpt-4.1` (default), `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`. Todos con `temperature=0.7`, `max_tokens=4096`.

#### `Anthropic`

Modelos: `claude-sonnet-4-20250514` (default), `claude-opus-4-20250514`, `claude-haiku-4-5-20251001`.

#### `Google`

Modelos: `gemini-2.5-flash` (default), `gemini-2.5-pro`.

---

## AI Model (Child DocType)

**Nombre interno:** `AI Model`
**Tipo:** Child DocType (`istable: 1`)
**Ruta JSON:** `common_configurations/common_configurations/doctype/ai_model/ai_model.json`

### Propósito

Define un modelo específico ofrecido por un `AI Provider`, con sus valores por defecto.

### Campos

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `model_name` | Data (reqd) | — | Identificador exacto del modelo (ej. `gpt-4.1`, `claude-sonnet-4-20250514`) |
| `is_default` | Check | 0 | Marcar el modelo recomendado por defecto |
| `temperature` | Float | 0.7 | Creatividad: 0.0 = determinista, 2.0 = muy creativo |
| `max_tokens` | Int | 4096 | Máximo de tokens en la respuesta |

Todos los campos tienen `in_list_view: 1`.

---

## AI Configuration (configuraciones activas)

**Nombre interno:** `AI Configuration`
**Tipo:** Standard DocType
**Ruta JSON:** `common_configurations/common_configurations/doctype/ai_configuration/ai_configuration.json`
**Auto-naming:** `field:config_name`
**Track changes:** 1

### Propósito

Cada `AI Configuration` representa una **instancia configurada** de un proveedor con sus credenciales y parámetros. Una app cliente solicita una `AI Configuration` por nombre vía `get_ai_client(config_name)` para obtener un cliente listo para usar.

Ejemplos típicos:

- "OpenAI Producción" — Provider: OpenAI, Model: gpt-4.1
- "Claude Soporte" — Provider: Anthropic, Model: claude-sonnet-4
- "Gemini Demo" — Provider: Google, Model: gemini-2.5-flash

### Campos

#### Sección: General

##### `config_name`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | Configuration Name |
| `reqd` | 1 |
| `unique` | 1 |
| `in_list_view` | 1 |

Nombre identificador. Es el `name` del documento (naming rule = field).

##### `provider`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Link |
| `options` | `AI Provider` |
| `reqd` | 1 |
| `in_list_view` | 1 |

Proveedor a usar (OpenAI / Anthropic / Google).

##### `is_active`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Check |
| `default` | 1 |
| `in_list_view` | 1 |

Si está inactiva, `get_ai_client()` lanza error.

##### `model`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `reqd` | 1 |
| `in_list_view` | 1 |

Nombre del modelo (debe coincidir con uno de los `AI Model` del proveedor, pero el campo es Data libre — el admin lo escribe manualmente).

##### `description`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |

Descripción opcional.

#### Sección: Credentials

##### `api_key_guide`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | HTML |
| `label` | API Key Guide |

HTML estático que muestra al admin cómo obtener una API key de cada proveedor.

##### `api_key`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | **Password** |
| `reqd` | 1 |

Clave API del proveedor. Encriptada en la base de datos. Se lee con `config_doc.get_password("api_key")`.

##### `api_url`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Data |
| `label` | API URL |

URL custom (opcional). Útil para Azure OpenAI o endpoints self-hosted. Si está vacío se usa la URL por defecto del proveedor.

#### Sección: Parameters

##### `temperature`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Float |
| `default` | 0.7 |
| `description` | 0.0 = determinista, 2.0 = muy creativo |

##### `max_tokens`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Int |
| `default` | 4096 |

##### `default_system_prompt`
| Atributo | Valor |
|----------|-------|
| `fieldtype` | Small Text |

Prompt de sistema por defecto. Puede ser sobrescrito en cada llamada vía `client.chat(prompt, system_prompt="otro")`.

### Permisos

| Rol | create | read | write | delete |
|-----|--------|------|-------|--------|
| **System Manager** | 1 | 1 | 1 | 1 |
| **Common Config Manager** | 1 | 1 | 1 | 1 |

---

## Cómo se usan

La capa de uso es **Python puro** (no hay endpoints whitelisted). Cualquier app del bench puede:

```python
from common_configurations.api.ai import get_ai_client

client = get_ai_client("OpenAI Producción")
response = client.chat("Traduce al inglés: Hola mundo")
print(response)  # "Hello world"
```

### Sobrescribir parámetros por llamada

```python
client = get_ai_client("Claude Soporte")
respuesta = client.chat(
    prompt="Resumen ejecutivo del caso 123",
    system_prompt="Eres un abogado experto en derecho civil colombiano.",
    temperature=0.2,
    max_tokens=512,
)
```

---

## Patrón Factory + Registry

La integración usa el patrón **factory con registry de decoradores** (`common_configurations/api/ai/client_factory.py`):

```python
_AI_PROVIDERS: dict = {}

def register_ai_provider(name: str):
    def decorator(cls):
        _AI_PROVIDERS[name] = cls
        return cls
    return decorator


class AIClient(ABC):
    """Base class for all AI provider clients."""

    def __init__(self, config_doc) -> None:
        self.config_name = config_doc.config_name
        self.model = config_doc.model
        self.api_key = config_doc.get_password("api_key")
        self.api_url = config_doc.api_url or None
        self.temperature = config_doc.temperature if config_doc.temperature is not None else 0.7
        self.max_tokens = config_doc.max_tokens or 4096
        self.default_system_prompt = config_doc.default_system_prompt or None

    @abstractmethod
    def chat(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        ...
```

Cada cliente (`openai_client.py`, `anthropic_client.py`, `google_client.py`) implementa `chat()` y se registra con un decorador:

```python
@register_ai_provider("OpenAI")
class OpenAIClient(AIClient):
    @property
    def client(self):  # Lazy init
        if self._client is None:
            from openai import OpenAI
            kwargs = {"api_key": self.api_key}
            if self.api_url:
                kwargs["base_url"] = self.api_url
            self._client = OpenAI(**kwargs)
        return self._client

    def chat(self, prompt, system_prompt=None, **kwargs):
        # ... arma messages y llama a self.client.chat.completions.create
```

### Agregar un proveedor nuevo

1. Crear `api/ai/mistral_client.py` con `@register_ai_provider("Mistral")` y método `chat()`.
2. Importarlo en `client_factory.get_ai_client()` (líneas 79-82) para que su decorador se ejecute.
3. Crear el registro `AI Provider` con `provider_name = "Mistral"`.

---

## Clientes incluidos

### OpenAIClient

Archivo: `api/ai/openai_client.py`. Usa el SDK oficial `openai`. Soporta Azure OpenAI vía `api_url`.

### AnthropicClient

Archivo: `api/ai/anthropic_client.py`. Usa el SDK oficial `anthropic`. No usa `api_url` (siempre llama a `api.anthropic.com`).

### GoogleClient

Archivo: `api/ai/google_client.py`. Cliente para Gemini.

---

## Manejo de errores

Cada cliente captura las excepciones del SDK y:

1. Registra en log Frappe (`frappe.log_error(title="OpenAI API Error", ...)`)
2. Lanza `frappe.ValidationError` con `_("Error calling OpenAI API: {0}")`

Ejemplo (`openai_client.py:54-58`):

```python
except Exception as e:
    frappe.log_error(
        title="OpenAI API Error",
        message=f"Config: {self.config_name}, Error: {e}",
    )
    frappe.throw(_("Error calling OpenAI API: {0}").format(str(e)))
```

---

## Referencias cruzadas

- [../api/AI.md](../api/AI.md) — API Python (`get_ai_client`).
- `common_configurations/api/ai/client_factory.py` — Factory.
- `common_configurations/api/ai/{openai,anthropic,google}_client.py` — Implementaciones.
