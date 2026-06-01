# API: Settings (módulo `common_configurations.api.settings`)

Endpoints del dominio **Settings**. Exponen únicamente los flags y la configuración pública que necesita el Service Portal frontend. **Nunca** exponen API keys, tokens ni otros datos sensibles del Singleton `Common Configurations Settings`.

- **Archivo:** `common_configurations/api/settings/endpoints.py`
- **DocType respaldo:** [Common Configurations Settings](../doctypes/COMMON_CONFIGURATIONS_SETTINGS.md)

---

## Endpoints

### `get_public_settings()` (público)

Retorna los feature flags y la configuración pública del portal. Es el endpoint que el frontend invoca al arrancar (`APP_INITIALIZER`) para inicializar el `SettingsService`.

| Atributo | Valor |
|----------|-------|
| **Path Frappe** | `common_configurations.api.settings.get_public_settings` |
| **Métodos** | `GET` |
| **Auth** | `allow_guest=True` (el ciudadano puede no estar logueado todavía) |
| **Rate limit** | `120 / 60s` por IP, vía `check_rate_limit("settings_get_public", ...)` |

#### Qué expone

```jsonc
{
  "message": {
    "voice_assistant": {
      "enabled": true,           // bool — copia de enable_voice_assistant
      "ai_enabled": false,       // bool — true SOLO si los dos flags están on Y validate_ai_configuration retorna []
      "name": "Asistente",       // string — fallback "Asistente" si está vacío
      "language": "es-ES",       // string — fallback "es-ES" si está vacío
      "gender": "female"         // "female" | "male" — fallback "female" si está vacío
    }
  }
}
```

#### Qué NO expone (intencional)

- `voice_assistant_ai_configuration` (el name de la AI Configuration vinculada)
- La `api_key` de la AI Configuration o cualquier credencial
- El `provider` o `model` configurado
- Cualquier campo del Singleton que no sea estrictamente público

#### Cálculo de `ai_enabled`

`ai_enabled` se calcula **del lado del servidor** y solo es `true` cuando:

1. `enable_voice_assistant == 1`, **y**
2. `enable_voice_assistant_ai == 1`, **y**
3. Existe un `voice_assistant_ai_configuration` configurado, **y**
4. `validate_ai_configuration(name)` retorna una lista vacía de issues.

Si alguno de estos fallos se da, `ai_enabled` es `false`. El frontend nunca tiene que adivinar si la IA es realmente usable.

#### Cacheado

- Backend: usa `frappe.get_cached_doc(...)` para leer el Singleton.
- Frontend: `SettingsService.load()` es idempotente. Se llama una vez al boot y guarda los valores en un `signal`; llamadas posteriores reusan el valor (a menos que pases `force = true`).

#### Ejemplo `curl`

```bash
curl -s 'https://<dominio>/api/method/common_configurations.api.settings.get_public_settings' \
  -H 'Accept: application/json'
```

Respuesta cuando todo está apagado (estado por defecto):

```json
{
  "message": {
    "voice_assistant": {
      "enabled": false,
      "ai_enabled": false,
      "name": "Asistente",
      "language": "es-ES",
      "gender": "female"
    }
  }
}
```

---

### `diagnose_voice_assistant_ai()` (admins)

Endpoint de diagnóstico para que un admin verifique **antes de guardar** que su `AI Configuration` es válida. Reporta cada problema por separado para facilitar el debug.

| Atributo | Valor |
|----------|-------|
| **Path Frappe** | `common_configurations.api.settings.diagnose_voice_assistant_ai` |
| **Métodos** | `GET` |
| **Auth** | Requiere usuario autenticado de Frappe con rol `System Manager` **o** `Common Config Manager`. Cualquier otro rol recibe `PermissionError`. |
| **Rate limit** | No tiene (es un endpoint administrativo) |

#### Respuesta

```jsonc
{
  "message": {
    "valid": false,
    "issues": [
      "La Configuración de IA 'Default OpenAI' no está activa",
      "La Configuración de IA 'Default OpenAI' no tiene API Key configurada"
    ]
  }
}
```

Cuando todo está correcto:

```json
{
  "message": {
    "valid": true,
    "issues": []
  }
}
```

#### Posibles issues

Combina los issues de `validate_ai_configuration(name)` (ver [doctypes/COMMON_CONFIGURATIONS_SETTINGS.md](../doctypes/COMMON_CONFIGURATIONS_SETTINGS.md#validate_ai_configurationconfig_name---liststr)) más dos chequeos previos:

| # | Condición | Issue |
|---|-----------|-------|
| A | `enable_voice_assistant_ai == 0` | `"El Modo IA está desactivado en la configuración"` |
| B | No hay `voice_assistant_ai_configuration` | `"No hay Configuración de IA seleccionada"` |
| 1 | La AI Configuration no existe | `"La Configuración de IA '{0}' no existe"` |
| 2 | `is_active = 0` | `"La Configuración de IA '{0}' no está activa"` |
| 3a | `provider` vacío | `"La Configuración de IA '{0}' no tiene Proveedor configurado"` |
| 3b | Provider inexistente o desactivado | `"El Proveedor '{0}' no existe"` / `"El Proveedor '{0}' está desactivado"` |
| 4 | `model` vacío | `"La Configuración de IA '{0}' no tiene Modelo configurado"` |
| 5 | `api_key` vacío | `"La Configuración de IA '{0}' no tiene API Key configurada"` |

#### Ejemplo `curl`

```bash
curl -s 'https://<dominio>/api/method/common_configurations.api.settings.diagnose_voice_assistant_ai' \
  -H 'Cookie: sid=<tu_sid_de_frappe>' \
  -H 'Accept: application/json'
```

---

## Integración en el frontend (Angular)

El portal carga estos settings **al arrancar** vía `provideAppInitializer`. Esto garantiza que cualquier componente puede leer `SettingsService.settings()` sincrónicamente sin tener que esperar HTTP.

### `app.config.ts`

```typescript
// src/app/app.config.ts:14
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    // Load public settings (feature flags) at boot so any component
    // can read them synchronously via SettingsService.
    provideAppInitializer(() => {
      const settings = inject(SettingsService);
      return settings.load();
    })
  ]
};
```

### `SettingsService.load()`

```typescript
// src/app/core/services/settings.service.ts:49
async load(force = false): Promise<void> {
  if (this._loaded() && !force) return;

  const response: any = await firstValueFrom(
    this.frappeApi.callMethod<PublicSettings>(
      'common_configurations.api.settings.get_public_settings',
      {},
      true
    )
  );
  const data = response?.message;
  if (data) {
    this._settings.set({
      voice_assistant: {
        ...DEFAULT_SETTINGS.voice_assistant,
        ...(data.voice_assistant || {}),
      },
    });
  }
  this._loaded.set(true);
}
```

Si el backend está inaccesible o falla, **no se rompe el boot**: los settings quedan en sus defaults (todos los flags `false`).

### Cómo lo leen los componentes

```typescript
// Cualquier componente Angular
constructor(private settings: SettingsService) {}

ngOnInit() {
  if (this.settings.isVoiceAssistantEnabled()) {
    // Mostrar botón de voz
  }
}
```

Convenciones expuestas por `SettingsService`:

| Miembro | Tipo | Qué retorna |
|---------|------|-------------|
| `settings()` | `Signal<PublicSettings>` | El objeto completo |
| `loaded()` | `Signal<boolean>` | `true` después del primer `load()` |
| `isVoiceAssistantEnabled()` | `boolean` | Atajo a `settings().voice_assistant.enabled` |
| `isVoiceAssistantAIEnabled()` | `boolean` | Atajo a `settings().voice_assistant.ai_enabled` |

---

## Filosofía: por qué un endpoint público dedicado

- El Service Portal lo consultan **invitados** (`allow_guest`); no se puede usar el endpoint privado del Singleton.
- Permite **filtrar** explícitamente lo que sale del backend, sin riesgo de que un cambio en el DocType filtre datos nuevos accidentalmente.
- Centraliza el cálculo de "¿la IA está realmente usable?" en el backend (en vez de duplicar las 5 validaciones en el frontend).
- El rate limit de 120 req/min es conservador: el frontend lo invoca una sola vez por sesión.
