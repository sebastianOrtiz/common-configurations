# API: AI

A diferencia de los demás dominios, **`common_configurations.api.ai` NO expone endpoints HTTP whitelisted**. Es un helper Python que cualquier app del bench puede importar para obtener un cliente de IA configurado.

**Base path:** `common_configurations.api.ai`
**Archivo:** `common_configurations/api/ai/client_factory.py`

---

## Helper público

### `get_ai_client(config_name: str) -> AIClient`

Devuelve una instancia de cliente de IA listo para usar, basado en la `AI Configuration` indicada.

```python
from common_configurations.api.ai import get_ai_client

client = get_ai_client("OpenAI Producción")
response = client.chat("Traduce al inglés: Hola mundo")
# "Hello world"
```

### Firma

```python
def get_ai_client(config_name: str) -> AIClient:
    """
    Args:
        config_name: nombre de un AI Configuration existente y activo.

    Returns:
        Instancia de AIClient (subclase específica del provider).

    Raises:
        frappe.ValidationError: si config no existe, no está activa,
                                o si el provider no tiene cliente registrado.
    """
```

### Errores comunes

| Caso | Excepción | Mensaje |
|------|-----------|---------|
| `config_name` no existe | `frappe.ValidationError` | AI Configuration '{name}' not found |
| `is_active = 0` | `frappe.ValidationError` | AI Configuration '{name}' is not active |
| Provider sin client registrado | `frappe.ValidationError` | AI provider '{name}' has no registered implementation. Available: ... |

---

## Interfaz `AIClient` (clase abstracta)

```python
class AIClient(ABC):
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
        """
        Args:
            prompt: User message.
            system_prompt: Override default system prompt.
            **kwargs: Overrides puntuales (temperature, max_tokens).

        Returns:
            Texto generado por el modelo.
        """
        ...
```

---

## Clientes incluidos

### `OpenAIClient` — provider `"OpenAI"`

Archivo: `api/ai/openai_client.py`. Usa el SDK oficial `openai`. Soporta Azure OpenAI vía `api_url` (se pasa como `base_url`).

```python
from openai import OpenAI

self._client = OpenAI(api_key=self.api_key, base_url=self.api_url)
response = self._client.chat.completions.create(
    model=self.model,
    messages=[
        {"role": "system", "content": system},
        {"role": "user", "content": prompt}
    ],
    temperature=temp,
    max_tokens=max_tokens,
)
```

### `AnthropicClient` — provider `"Anthropic"`

Archivo: `api/ai/anthropic_client.py`. Usa el SDK oficial `anthropic`.

```python
from anthropic import Anthropic

self._client = Anthropic(api_key=self.api_key)
response = self._client.messages.create(
    model=self.model,
    max_tokens=max_tokens,
    messages=[{"role": "user", "content": prompt}],
    system=system,        # si está definido
    temperature=temp,     # si está definido
)
```

### `GoogleClient` — provider `"Google"`

Archivo: `api/ai/google_client.py`. Cliente para Gemini.

---

## Patrón Factory + Registry

`api/ai/client_factory.py:18-28`:

```python
_AI_PROVIDERS: dict = {}

def register_ai_provider(name: str):
    def decorator(cls):
        _AI_PROVIDERS[name] = cls
        return cls
    return decorator
```

Cada client se registra con un decorador:

```python
@register_ai_provider("OpenAI")
class OpenAIClient(AIClient):
    ...
```

Al llamar `get_ai_client()`, primero se importan los módulos para que sus decoradores corran y poblen el registry:

```python
# api/ai/client_factory.py:79-82
from . import openai_client      # noqa: F401
from . import anthropic_client   # noqa: F401
from . import google_client      # noqa: F401
```

---

## Ejemplos de uso

### Ejemplo 1: Chat simple

```python
from common_configurations.api.ai import get_ai_client

client = get_ai_client("OpenAI Producción")
respuesta = client.chat("¿Qué es Frappe Framework?")
print(respuesta)
```

### Ejemplo 2: Override de system prompt

```python
client = get_ai_client("Claude Soporte")
respuesta = client.chat(
    prompt="Resumen ejecutivo del caso 123",
    system_prompt="Eres un abogado experto en derecho civil colombiano. Responde en máximo 3 párrafos."
)
```

### Ejemplo 3: Override de parámetros

```python
client = get_ai_client("Gemini Demo")
respuesta = client.chat(
    prompt="Traduce al inglés: Hola mundo",
    temperature=0.0,       # determinista
    max_tokens=128,        # respuesta corta
)
```

### Ejemplo 4: Uso desde un endpoint whitelist de otra app

```python
# mi_app/api/chat.py
import frappe
from common_configurations.api.ai import get_ai_client

@frappe.whitelist(methods=["POST"])
def ask_assistant(question: str, config_name: str = "OpenAI Producción"):
    client = get_ai_client(config_name)
    return {"answer": client.chat(question)}
```

---

## Agregar un proveedor nuevo

1. Crear `api/ai/mistral_client.py`:

   ```python
   from .client_factory import AIClient, register_ai_provider

   @register_ai_provider("Mistral")
   class MistralClient(AIClient):
       @property
       def client(self):
           if self._client is None:
               from mistralai import Mistral
               self._client = Mistral(api_key=self.api_key)
           return self._client

       def chat(self, prompt, system_prompt=None, **kwargs):
           system = system_prompt or self.default_system_prompt
           messages = []
           if system:
               messages.append({"role": "system", "content": system})
           messages.append({"role": "user", "content": prompt})

           response = self.client.chat.complete(
               model=self.model,
               messages=messages,
               temperature=kwargs.get("temperature", self.temperature),
               max_tokens=kwargs.get("max_tokens", self.max_tokens),
           )
           return response.choices[0].message.content
   ```

2. Importarlo en `client_factory.get_ai_client()` (líneas 79-82):

   ```python
   from . import mistral_client  # noqa: F401
   ```

3. Crear el registro `AI Provider` con `provider_name = "Mistral"`.

4. Crear `AI Configuration` con `provider = "Mistral"`.

---

## Referencias cruzadas

- [../doctypes/AI_CONFIGURATION.md](../doctypes/AI_CONFIGURATION.md) — DocTypes (AI Provider, AI Model, AI Configuration).
- `common_configurations/api/ai/client_factory.py` — Factory.
- `common_configurations/api/ai/{openai,anthropic,google}_client.py` — Implementaciones.
