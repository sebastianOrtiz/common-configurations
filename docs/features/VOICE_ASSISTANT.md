# Feature: Asistente de Voz del Service Portal

Sistema de **asistente conversacional por voz** que guía al usuario a llenar formularios hablando. MVP funcional sin IA (transcripción voz → texto + sanitización local), con un modo IA opcional ya definido a nivel de configuración pero aún no implementado en el flujo.

> Estado actual: **MVP en producción**, integrado en el formulario de registro/login del Service Portal. Modo IA: **infraestructura lista, flujo conversacional pendiente**.

---

## 1. Visión general

### Qué hace

El asistente:

1. **Saluda** al usuario y le anticipa lo que va a hacer (`"Hola, soy <Nombre>. Te voy a hacer algunas preguntas..."`).
2. Por cada campo del formulario:
   - **Pregunta** en voz alta (`"¿Cuál es tu nombre completo?"`).
   - **Escucha** la respuesta (con feedback visual e interim transcript).
   - **Sanitiza** lo capturado (palabras-número a dígitos, símbolos hablados a símbolos reales, etc.).
   - **Confirma** lo entendido y espera "sí" o "no".
3. Al terminar, muestra un **resumen** de todas las respuestas y permite **editar** cualquier campo (con voz o botón) antes de confirmar.
4. Si el usuario confirma, el componente emite los datos y el formulario se llena automáticamente.

### Casos de uso

- Adultos mayores o personas con dificultad para escribir en pantallas táctiles.
- Personas con discapacidad visual o motriz.
- Llenar formularios largos rápido en el celular sin teclear.
- Ambientes donde teclear es incómodo (atención presencial, kioscos).

### Cómo se activa

- Un administrador habilita el flag `enable_voice_assistant` en `Common Configurations Settings`.
- El frontend lee el flag al boot (`SettingsService`) y, si está activo **y** el navegador soporta TTS/STT, muestra los botones de voz en los formularios que lo integran.
- El usuario hace clic en `🎤 Llenar con asistente de voz`, da permiso al navegador para usar el micrófono y el flujo arranca.

---

## 2. Arquitectura

### Componentes

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Backend (Frappe)                             │
│                                                                      │
│  Common Configurations Settings (Singleton)                          │
│    ├─ enable_voice_assistant, name, gender, language                 │
│    ├─ enable_voice_assistant_ai, voice_assistant_ai_configuration    │
│    └─ validate() → _validate_voice_assistant_ai()                    │
│                                                                      │
│  api/settings/endpoints.py                                           │
│    ├─ get_public_settings()       (allow_guest)                      │
│    └─ diagnose_voice_assistant_ai() (admins)                         │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ HTTP (JSON)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Frontend (Angular)                             │
│                                                                      │
│  SettingsService  (signal global cargado en APP_INITIALIZER)         │
│    └─ settings().voice_assistant.{enabled,ai_enabled,name,...}       │
│                                                                      │
│  VoiceAssistantComponent  (panel flotante con estados)               │
│    ├─ inyecta TtsService, SttService, SoundService, SettingsService  │
│    ├─ orquesta el flujo: greeting → ask → listen → confirm → review  │
│    └─ emite surveyComplete / surveyCancelled                         │
│                                                                      │
│  Componentes anfitriones (Contact Registration, etc.)                │
│    └─ generan los `VoicePrompt[]` y llaman a `startSurvey(prompts)`  │
└──────────────────────────────────────────────────────────────────────┘
```

### Servicios de voz (capa core)

| Servicio | Archivo | Responsabilidad |
|----------|---------|-----------------|
| `TtsService` | `core/services/voice/tts.service.ts` | Síntesis de voz (Web Speech API) con selección inteligente por idioma + género. |
| `SttService` | `core/services/voice/stt.service.ts` | Reconocimiento de voz (Web Speech Recognition). Maneja interim y fallback. |
| `SoundService` | `core/services/voice/sound.service.ts` | Beeps de feedback al iniciar/terminar escucha (Web Audio API). |
| `SettingsService` | `core/services/settings.service.ts` | Carga y expone los flags públicos como signal. |

### Flujo de datos

```
DocType Singleton  ─►  get_public_settings  ─►  SettingsService.load()
                                                     │
                                                     ▼
                                          signal<PublicSettings>
                                                     │
                                                     ▼
                            VoiceAssistantComponent.featureAvailable
                                                     │
                                                     ▼
                           Botón "🎤 Llenar con asistente de voz"
```

---

## 3. Cómo activarlo

### Paso a paso

1. **Habilitar el flag en el Singleton**
   - Frappe Desk → busca `Common Configurations Settings` → abre.
   - Marca **Habilitar Asistente de Voz**.
2. **Configurar la voz**
   - **Nombre del Asistente** (ej. `Asistente`, `Nora`, `Nexa`).
   - **Género de la Voz**: `female` o `male`.
   - **Idioma del Asistente**: `es-ES`, `es-CO`, `es-MX` o `en-US`.
3. (Opcional) Habilitar modo IA — ver sección [8](#8-feature-flag-de-ia-modo-aún-no-implementado).
4. **Guardar**. El controller `validate()` corre y, si activaste IA, valida la `AI Configuration`.
5. **Refrescar** el portal (Ctrl+F5). El frontend carga los settings al boot vía `APP_INITIALIZER`.
6. **Verifica**: si entras al formulario de registro y el navegador es Chrome o Edge, debes ver los botones `🎤 Llenar con asistente de voz` (registro) y `🎤 Iniciar sesión con voz` (login).

### Requisitos del navegador

| Navegador | TTS (`speechSynthesis`) | STT (`SpeechRecognition`) | Asistente funciona |
|-----------|-------------------------|----------------------------|--------------------|
| Chrome (desktop/Android) | ✔ | ✔ | ✔ |
| Edge (desktop) | ✔ | ✔ | ✔ |
| Safari (macOS/iOS) | ✔ | Parcial / cambia entre versiones | A veces (mejor evitar) |
| Firefox | ✔ | ✘ | ✘ (el botón se **oculta**) |

El componente protege el render con `featureAvailable()`, que combina el flag de settings **AND** `tts.isSupported()` **AND** `stt.isSupported()`. Si el navegador no soporta STT, el botón simplemente no aparece (no se muestra un error).

> El usuario debe **dar permiso de micrófono** al navegador la primera vez. Algunos navegadores también requieren HTTPS para activar la API.

---

## 4. Componente `VoiceAssistantComponent`

- **Selector:** `<app-voice-assistant>`
- **Standalone:** sí
- **Archivos:** `shared/components/voice-assistant/voice-assistant.component.{ts,html,scss}`

### Estados (`AssistantState`)

```typescript
// voice-assistant.component.ts:60
type AssistantState =
  | 'idle'        // Componente cerrado; no hay survey activo
  | 'greeting'    // Saludo inicial sonando
  | 'asking'      // El TTS está pronunciando una pregunta
  | 'listening'   // El micrófono está abierto capturando la respuesta
  | 'confirming'  // Se escuchó algo válido, esperando "sí/no" del usuario
  | 'reviewing'   // Resumen final con todas las respuestas, esperando confirmación
  | 'summary'     // Mensaje final ("perfecto, llenamos el formulario")
  | 'done'        // Encuesta completada; el panel se cerrará en 1.5s
  | 'error';      // Error de STT / TTS
```

El panel muestra el subtítulo del estado en el header (ver `voice-assistant.component.html:12-23`).

### API pública

#### Método: `startSurvey(prompts: VoicePrompt[]): Promise<Record<string, string>>`

Inicia una encuesta guiada. Resuelve con `{ [key]: value }` cuando termina, o rechaza si el usuario cancela.

```typescript
// voice-assistant.component.ts:136
startSurvey(prompts: VoicePrompt[]): Promise<Record<string, string>> {
  if (!this.featureAvailable()) {
    return Promise.reject(new Error('Asistente de voz no disponible'));
  }
  // ... reset estado ...
  this.open.set(true);
  return new Promise((resolve, reject) => {
    this.resolveSurvey = resolve;
    this.rejectSurvey = reject;
    void this.runGreeting();
  });
}
```

#### Outputs

| Output | Tipo | Cuándo se emite |
|--------|------|-----------------|
| `surveyComplete` | `EventEmitter<Record<string, string>>` | Cuando el usuario confirma el resumen final. Lleva el mapa `{key: value}` |
| `surveyCancelled` | `EventEmitter<void>` | Cuando el usuario cancela (X, overlay, comando "cancelar") |

#### Signal computado: `featureAvailable()`

```typescript
// voice-assistant.component.ts:88
readonly featureAvailable = computed(() => {
  return (
    this.settings.settings().voice_assistant.enabled &&
    this.tts.isSupported() &&
    this.stt.isSupported()
  );
});
```

### Interface `VoicePrompt`

```typescript
// voice-assistant.component.ts:39
export interface VoicePrompt {
  /** Field key, used in the returned map */
  key: string;
  /** Question text — spoken aloud and shown on screen */
  question: string;
  /** Optional confirmation phrase after capturing the value */
  confirmTemplate?: (value: string) => string;
  /** Optional client-side sanitizer/validator. Return null/false to mark invalid. */
  sanitize?: (value: string) => string | null;
  /**
   * If true, the user can skip this question by saying things like
   * "no tengo", "saltar", "siguiente", "no aplica", "ninguno".
   */
  optional?: boolean;
  /** Minimum length the sanitized value must have (e.g. 6 for cédula) */
  minLength?: number;
  /** Maximum length (truncates or rejects) */
  maxLength?: number;
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `key` | `string` | Nombre de la propiedad en el mapa de resultado. Suele coincidir con el `fieldname` del DocType. |
| `question` | `string` | Pregunta literal que se pronuncia y se muestra en pantalla. |
| `confirmTemplate` | `(v) => string` | Función opcional que construye la frase de confirmación. Si no se provee, se usa `"Entendí: <valor>. ¿Es correcto? Di sí para continuar o no para repetir."` |
| `sanitize` | `(v) => string \| null` | Recibe lo transcrito y devuelve el valor limpio (o `null` para marcar inválido). Si retorna `null` o cadena vacía, se re-pregunta. |
| `optional` | `boolean` | Si es `true`, frases como "no tengo", "saltar", "no aplica" omiten el campo sin guardar valor. |
| `minLength` | `number` | Longitud mínima del valor sanitizado. Si no llega, se re-pregunta con `"Esa respuesta es muy corta. Necesito al menos N caracteres."` |
| `maxLength` | `number` | Longitud máxima. Si la respuesta es más larga, **se trunca** (no se rechaza). |

### Ejemplo de uso desde un componente

Tomado de `contact-registration.component.ts`:

```typescript
// contact-registration.component.ts:21,43
import { VoiceAssistantComponent, VoicePrompt } from '.../voice-assistant/voice-assistant.component';
import { ViewChild } from '@angular/core';

@Component({
  imports: [..., VoiceAssistantComponent],
  template: `
    ...
    <button (click)="startVoiceAssistant()" *ngIf="settingsService.isVoiceAssistantEnabled()">
      🎤 Llenar con asistente de voz
    </button>
    <app-voice-assistant></app-voice-assistant>
  `,
})
export class ContactRegistrationComponent {
  @ViewChild(VoiceAssistantComponent) voiceAssistant?: VoiceAssistantComponent;

  async startVoiceAssistant(): Promise<void> {
    if (!this.voiceAssistant) return;

    const prompts: VoicePrompt[] = [
      {
        key: 'full_name',
        question: '¿Cuál es tu nombre completo?',
        optional: false,
      },
      {
        key: 'document',
        question: '¿Cuál es tu número de documento? Por favor díctalo dígito por dígito.',
        sanitize: (v) => sanitizeDigits(v),
        minLength: 6,
      },
    ];

    try {
      const answers = await this.voiceAssistant.startSurvey(prompts);
      this.formData.update((current) => ({ ...current, ...answers }));
    } catch {
      // Usuario canceló — silencioso
    }
  }
}
```

---

## 5. Comandos por voz

### Universales (funcionan en `listening` y `confirming`)

Detectados por `detectControlCommand` (`voice-assistant.component.ts:397`). El texto se normaliza (lowercase + sin tildes) antes del match.

| Comando | Regex (en minúsculas, sin tildes) | Efecto |
|---------|-----------------------------------|--------|
| **Cancelar** | `\b(cancelar\|cancela\|salir\|sal del asistente\|terminar\|abortar\|adios)\b` | Cierra el panel, aborta el flujo, emite `surveyCancelled`. |
| **Atrás** | `\b(atras\|volver\|anterior\|regresa\|regresar\|previa\|pregunta anterior\|vuelve)\b` | Retrocede al prompt anterior, borra su respuesta y la pregunta de nuevo. |
| **Repetir** | `^(repetir\|repite\|repeti\|otra vez\|de nuevo\|no entendi\|no escuche)$` | Vuelve a pronunciar la pregunta actual y a escuchar. |

> El orden importa: primero se evalúa `cancel`, luego `back`, luego `repeat`. Si nada matchea, el texto se trata como respuesta normal.

### Confirmación (estado `confirming`)

| Tipo | Regex | Acción |
|------|-------|--------|
| Sí | `\b(si\|sii+\|sip\|claro\|correcto\|confirmo\|afirmativo\|ok\|okay\|vale\|de acuerdo\|yes\|yep\|acepto)\b` | Acepta el valor capturado, avanza al siguiente prompt. |
| No | `\b(no\|nop\|negativo\|incorrecto\|repetir\|repite\|cancela\|cancelar\|otra vez\|nope)\b` | Repite la pregunta actual. |
| Ambiguo / silencio | — | Hasta 2 reintentos preguntando explícitamente; al 3er fallo, se vuelve a hacer la pregunta entera. |

### Skip (solo si el prompt tiene `optional: true`)

Detectado por `isSkipPhrase` (`voice-assistant.component.ts:439`). Match: `\b(no tengo|no aplica|ninguno|ninguna|saltar|salta|siguiente|paso|omitir|omite|no quiero|prefiero no|sin (correo|email|telefono)|no hay|nada)\b`.

Se evalúa **antes** del sanitizer, así que aunque "no tengo" sea técnicamente sanitizable como texto, salta el campo.

### Review / resumen (estado `reviewing`)

Detectado por `captureReviewResponse` (`voice-assistant.component.ts:505`).

| Voz | Acción |
|-----|--------|
| `"sí"` / `"confirmar"` / `"acepto"` / `"listo"` / `"enviar"` | Confirma todo el resumen, emite `surveyComplete`. |
| `"editar <campo>"` / `"cambiar <campo>"` / `"modificar <campo>"` | Busca por nombre normalizado (lowercase + sin tildes, match exacto o parcial) y salta a editar ese prompt. |
| `"no"` / `"cambiar"` (sin target) | Lista los campos disponibles y vuelve a escuchar. |
| `"atrás"` | Edita el último campo capturado. |
| `"cancelar"` | Cancela toda la encuesta. |

---

## 6. Servicios de voz

### `TtsService` — Síntesis de voz

`core/services/voice/tts.service.ts`. Wrapper delgado sobre `window.speechSynthesis`.

#### Método principal

```typescript
speak(text: string, language: string = 'es-ES', gender: 'female' | 'male' = 'female'): Promise<void>
```

Resuelve cuando `utter.onend` se dispara (o falla; en ese caso resuelve igual, no rechaza).

#### Selección de voz: por calidad **y** género

Como la Web Speech API **no expone el género de una voz**, se infiere por el nombre de la voz contra dos catálogos:

`FEMALE_NAMES` (extracto, `tts.service.ts:70`):
```
helena, sabina, dalia, paloma, esperanza, monica, paulina, marisol, soledad,
lucia, isabel, andrea, ximena, fernanda, gabriela, carolina, valentina,
camila, sofia, elena, laura, marina, conchita, nora, alba, sara,
samantha, victoria, karen, allison, ava, susan, zira, cortana, salli,
kimberly, kendra, joanna
```

`MALE_NAMES` (extracto, `tts.service.ts:80`):
```
pablo, jorge, raul, diego, juan, carlos, alvaro, miguel, andres, manuel,
antonio, david, javier, alberto, alejandro, ignacio, alonso, sebastian,
tomas, mateo, fernando, daniel, tom, fred, alex, mark, james, justin,
matthew, paul
```

Además, hay un fallback a patrones explícitos en el nombre: `female|woman|mujer|femenina` y `male|man|hombre|masculino`.

#### Prioridad de selección

`pickBestVoice` itera ocho tiers en orden, primero buscando voces que **coincidan con el género**, y luego los mismos tiers ignorando género:

1. `matchLang(v) && matchGender(v) && isGoogle(v)` ← idioma exacto + género + Google (top quality)
2. `matchBase(v) && matchGender(v) && isGoogle(v)` ← idioma base + género + Google
3. `matchLang(v) && matchGender(v) && isMicrosoftNatural(v)` ← Microsoft Natural/Online
4. `matchBase(v) && matchGender(v) && isMicrosoftNatural(v)`
5. `matchLang(v) && matchGender(v) && isNatural(v)` ← cualquier voz "natural/neural/premium/enhanced/wavenet/online"
6. `matchBase(v) && matchGender(v) && isNatural(v)`
7. `matchLang(v) && matchGender(v)` ← cualquier voz del idioma exacto con el género
8. `matchBase(v) && matchGender(v)`

Si nada matchea, se repite ignorando género. Si nada matchea de nuevo, el navegador usa su voz default.

> Detalle: `matchLang` exige igualdad estricta (`es-ES === es-ES`); `matchBase` solo el prefijo (`es-ES` matchea `es-MX`).

#### Fallback graceful

- `isSupported() === false` → `speak()` retorna inmediatamente.
- `utter.onerror` → resuelve la promesa (no rechaza); el flujo del asistente continúa.
- Antes de cada `speak()` se llama `synth.cancel()` para evitar acumulación de utterances.

### `SttService` — Reconocimiento de voz

`core/services/voice/stt.service.ts`. Wrapper sobre `window.SpeechRecognition` (o `webkitSpeechRecognition`).

#### Método principal

```typescript
listenOnce(language: string = 'es-ES', onInterim?: (text: string) => void): Promise<string>
```

Resuelve con el texto final (o el último interim si nunca llegó un `isFinal`). Rechaza solo en errores reales; `no-speech` y `aborted` se tratan como silencio (resuelve cadena vacía).

#### Configuración interna

- `continuous: false` — single-shot, una sola captura.
- `interimResults: true` — **importante**: permite el fallback cuando `isFinal` nunca se dispara, algo muy común con respuestas cortas como "sí" o "no".
- `maxAlternatives: 1`

#### Mecanismo de fallback

```typescript
// stt.service.ts:61
const finish = () => {
  if (resolved) return;
  resolved = true;
  const text = (finalText || lastInterim || '').trim();
  resolve(text);
};
```

Cuando `recognition.onend` se dispara y nunca llegó un `isFinal`, se usa `lastInterim`. Esto es crítico para que "sí" y "no" funcionen — sin él, el asistente se quedaba "escuchando para siempre" en respuestas cortas.

#### Errores no fatales

```typescript
// stt.service.ts:84
recognition.onerror = (event: any) => {
  if (event.error === 'no-speech' || event.error === 'aborted') {
    finish();  // silencio normal, no es error
  } else if (!resolved) {
    reject(new Error(`Error de reconocimiento: ${event.error}`));
  }
};
```

### `SoundService` — Beeps

`core/services/voice/sound.service.ts`. Web Audio API sin archivos.

| Método | Frecuencia | Duración | Uso |
|--------|------------|----------|-----|
| `beepStart()` | 880 Hz (A5) | 100ms | "El micrófono se abrió, habla" |
| `beepEnd()` | 660 Hz (E5) | 80ms | "El micrófono se cerró, estoy procesando" |
| `beep(freq, durationMs, volume)` | configurable | configurable | Uso libre |

Implementación: oscilador `sine` con rampa de gain in/out de 10ms para evitar clicks. Falla silenciosamente si no hay `AudioContext` (audio es no-crítico).

---

## 7. Sanitizers (módulo compartido)

Los sanitizers son funciones puras que reciben el texto crudo del STT (con palabras, espacios, tildes, acentos) y devuelven el valor normalizado para guardar en el formulario — o `null` si no se pudo interpretar (en cuyo caso el asistente repite la pregunta).

Viven en `core/services/voice/sanitizers.ts` para que cualquier feature pueda importarlos sin tener que duplicar la lógica de números-palabra, normalización de tildes, símbolos de email, etc. Se aplican vía la prop `sanitize` de cada `VoicePrompt`.

**API exportada:**

| Función | Para qué |
|---|---|
| `normalizeText(s)` | Lowercase + strip diacríticos + trim |
| `sanitizeText(v, minLength?)` | Texto libre, valida longitud mínima |
| `sanitizeDigits(v, allowPlus?)` | Dígitos (palabras-número en español + filtrado de ruido) |
| `sanitizeEmail(v)` | Correo electrónico (arroba/punto/guion/etc.) |
| `sanitizeSelectMatch(v, options[])` | Match exacto/parcial contra una lista normalizada |

> Antes vivían inline en `contact-registration.component.ts`. Tras la Fase C se extrajeron al módulo compartido para que **Bitácora**, **PQR**, registro y futuras tools usen la misma implementación.

### `sanitizeDigits(input: string, allowPlus = false): string | null`

Convierte palabras-número en español a dígitos, después borra todo lo que no es dígito (excepto `+` si `allowPlus = true`).

#### Conversiones

| Palabra(s) | Dígito |
|------------|--------|
| `cero` | `0` |
| `uno` / `una` / `un` | `1` |
| `dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve` | `2`–`9` |
| `diez`, `once`, `doce`, `trece`, `catorce`, `quince` | `10`–`15` |
| `dieciséis`/`dieciseis`, `diecisiete`, `dieciocho`, `diecinueve` | `16`–`19` |
| `veinte` | `20` |
| `veintiún`/`veintiuno`/`veintiuna`...`veintinueve` | `21`–`29` |
| `treinta`, `cuarenta`, `cincuenta`, `sesenta`, `setenta`, `ochenta`, `noventa` | `30`–`90` |
| `y` / `guion` / `guion bajo` / `menos` | (eliminado, son conectores) |
| `más` / `mas` | `+` |

> El orden de las reglas importa: las palabras compuestas más largas se procesan antes (ej. `diecinueve` antes que `nueve`), si no `nueve` consumiría parte de `diecinueve`.

#### Ejemplos

| Input hablado | `sanitizeDigits(input)` |
|---------------|------------------------|
| `"uno dos tres cuatro"` | `"1234"` |
| `"diecinueve"` | `"19"` |
| `"veintidós cero ocho"` | `"2208"` |
| `"mil cincuenta y dos"` | `"502"` ⚠️ (no soporta "mil/cien", solo 0–99) |
| `"cinco cero cinco guion diez"` | `"50510"` |
| `"tres cuatro 56 78"` | `"345678"` (los dígitos hablados quedan) |
| `"hola"` | `null` (después del replace queda cadena vacía) |
| `"más 57 uno dos"`, `allowPlus=true` | `"+5712"` |

> Solo soporta números hasta 99 hablados. Los documentos colombianos (6–10 dígitos) se dictan "dígito por dígito" (`"uno dos tres ..."`), por eso la pregunta es explícita: *"Por favor díctalo dígito por dígito."*

### `sanitizeEmail(input: string): string | null`

Sanea un correo dictado por voz.

| Operación | Detalle |
|-----------|---------|
| Lowercase | `Andrés@dom.co` → `andrés@dom.co` |
| Strip diacríticos | `andrés` → `andres` |
| `arroba` / `at` / `en` | `@` |
| `punto` / `dot` | `.` |
| `guion bajo` / `guion abajo` / `underscore` | `_` |
| `guion` / `menos` | `-` |
| `más` / `mas` | `+` |
| Cualquier whitespace | eliminado |

#### Ejemplos

| Input hablado | `sanitizeEmail(input)` |
|---------------|------------------------|
| `"juan arroba gmail punto com"` | `"juan@gmail.com"` |
| `"andrés guion lópez arroba ejemplo punto co"` | `"andres-lopez@ejemplo.co"` |
| `"maría guion bajo gómez at gmail dot com"` | `"maria_gomez@gmail.com"` |
| `"juan punto perez+test arroba dominio punto org"` | `"juan.perez+test@dominio.org"` |

### `sanitizeSelectMatch(input: string, options: string[]): string | null`

Para campos tipo `Select`, el asistente construye la pregunta listando opciones (`"Las opciones son: Cédula de ciudadanía, NIT, Pasaporte..."`) y usa este sanitizer para hacer match tolerante a tildes y mayúsculas.

Estrategia:

1. **Match exacto** (sobre versiones normalizadas con `normalizeText`).
2. **Match parcial bidireccional**: el target contiene la opción **o** la opción contiene el target. Esto permite que `"cedula"` matchee `"Cédula de ciudadanía"`.

Devuelve la opción **original** (con tildes y mayúsculas correctas), no la versión normalizada, así el backend recibe el valor exacto del Select.

### `VoicePromptBuilder` — fábrica de prompts

`core/services/voice/voice-prompt-builder.service.ts` envuelve los sanitizers en una API declarativa para no tener que armar `VoicePrompt` a mano cada vez. Es la forma recomendada de crear prompts desde cualquier feature.

```typescript
import { VoicePromptBuilder } from '../../../core/services/voice/voice-prompt-builder.service';

private builder = inject(VoicePromptBuilder);

const prompts = [
  this.builder.text({ key: 'user_context', label: 'caso o necesidad', minLength: 10 }),
  this.builder.digits({ key: 'document', label: 'documento', minLength: 6 }),
  this.builder.email({ key: 'email' }),
  this.builder.select({ key: 'doc_type', label: 'tipo de documento',
                        options: ['Cédula', 'NIT', 'Pasaporte'] }),
  this.builder.yesNo({ key: 'accept', question: '¿Aceptas los términos?' }),
];
```

| Método | Sanitizer subyacente | Pregunta por defecto |
|---|---|---|
| `text({ key, label, question?, optional?, minLength?, maxLength? })` | `sanitizeText` | `"Por favor dictá <label>."` o `question` |
| `digits({ key, label, optional?, minLength?, maxLength?, allowPlus? })` | `sanitizeDigits` | `"¿Cuál es tu <label>? Por favor díctalo dígito por dígito."` |
| `email({ key, label?, optional? })` | `sanitizeEmail` | `"¿Cuál es tu correo electrónico? Puedes decir arroba, punto y guion."` |
| `select({ key, label, options[], optional? })` | `sanitizeSelectMatch` | `"Selecciona tu <label>. Las opciones son: ..."` |
| `yesNo({ key, question, optional? })` | regex sí/no (interno) | `question` |
| `fromField(field, extra?)` | auto-detecta según el `DocField` de Frappe (Select → select, Email → email, document/cédula → digits 6+, teléfono → digits 7+ con `+`, fallback → text) | derivada del label |

Todos los métodos generan un `confirmTemplate` apropiado (read-back del valor capturado), que la lectura puede sobreescribir mutando el `VoicePrompt` devuelto si necesita un tono específico.

### Validación `minLength` / `maxLength`

Aplicada en `applySanitizer` después de que el sanitizer corre (`voice-assistant.component.ts:265`):

- `sanitized.length < minLength` → guarda el mensaje en `_lastValidationError` (ej. `"Esa respuesta es muy corta. Necesito al menos 6 caracteres."`) y retorna `null` → se re-pregunta con ese mensaje específico.
- `sanitized.length > maxLength` → **trunca** (no rechaza). Esto evita loops cuando el STT añade ruido al final.

---

## 8. Feature flag de IA (modo aún no implementado)

El Singleton expone un segundo flag, `enable_voice_assistant_ai`, con su `voice_assistant_ai_configuration` asociada (un Link a `AI Configuration`). La intención futura es que cuando esté activo, el asistente:

- Permita al usuario **hablar libremente** ("hola, soy Juan Pérez, cédula 79..."), parsee con IA y rellene varios campos a la vez.
- Maneje correcciones naturales ("ah no, espera, son 80...").
- Conversación más fluida sin preguntas rígidas.

### Estado actual

- **Backend:** todas las validaciones funcionan (`_validate_voice_assistant_ai`, `validate_ai_configuration` con sus 5 checks, endpoint de diagnóstico).
- **Endpoint público:** ya calcula `ai_enabled` correctamente combinando los flags + las validaciones.
- **Frontend:** `SettingsService.isVoiceAssistantAIEnabled()` ya devuelve el booleano correcto.
- **VoiceAssistantComponent:** **NO consume todavía** la flag `ai_enabled`. El flujo siempre es el MVP guiado prompt-por-prompt.

### Recursos disponibles cuando se implemente la Fase B

El flag está disponible en cualquier componente:

```typescript
if (this.settings.isVoiceAssistantAIEnabled()) {
  // futuro: modo libre con LLM
} else {
  // MVP actual: encuesta guiada
}
```

Ver detalles de validación en [doctypes/COMMON_CONFIGURATIONS_SETTINGS.md](../doctypes/COMMON_CONFIGURATIONS_SETTINGS.md#validate_ai_configurationconfig_name---liststr).

---

## 9. Cancelación cooperativa

### El problema

`SpeechSynthesisUtterance` y `SpeechRecognition` son **asíncronos y poco cooperativos** con `Promise.cancel()`. Si el usuario cierra el panel mientras el TTS está hablando o el STT está escuchando, sin más, la promesa `say()` o `listenOnce()` puede seguir resolviendo después y el código encadenado seguiría ejecutándose (siguiente pregunta, siguiente captura...) aunque el panel ya esté cerrado.

### La solución: flag `aborted` + checks después de cada `await`

```typescript
// voice-assistant.component.ts:108
private aborted = false;

private async runGreeting(): Promise<void> {
  if (this.aborted) return;       // ← check inicial
  this.state.set('greeting');
  await this.say(/* ... */);
  if (this.aborted) return;       // ← check después del await
  await this.askCurrent();
}
```

El patrón se repite en `askCurrent`, `startListening`, `captureConfirmation`, `finish`, `captureReviewResponse`. **Todas las funciones async del flujo verifican `this.aborted` después de cada operación awaiteable.**

### `cancel()` orquesta el shutdown

```typescript
// voice-assistant.component.ts:625
protected cancel(): void {
  // 1. Stop any pending async work in the survey flow
  this.aborted = true;
  // 2. Cancel any speech currently playing
  this.tts.cancel();
  // 3. Close panel and reset visible state
  this.open.set(false);
  this.state.set('idle');
  this.interimText.set('');
  this.capturedValue.set('');
  // 4. Notify caller and clear promise handles
  this.surveyCancelled.emit();
  this.rejectSurvey?.(new Error('Cancelado por el usuario'));
  this.resolveSurvey = null;
  this.rejectSurvey = null;
}
```

Por qué cada paso es necesario:

1. **`aborted = true`** primero — para que cualquier `await` que esté terminando y vaya a ejecutar el siguiente paso, se corte.
2. **`tts.cancel()`** — corta el audio actual. Sin esto, el asistente seguía pronunciando la pregunta por un par de segundos después de cerrar el panel.
3. **Reset visual** — `open=false` cierra el panel inmediatamente.
4. **`rejectSurvey(...)`** — el caller (componente anfitrión) recibe la rejection y limpia su estado.

### Inicio limpio

Cada llamada a `startSurvey` resetea `this.aborted = false`, así que cancelar una encuesta no impide arrancar otra.

---

## 10. UX details

### Feedback auditivo

- **Beep alto (880 Hz)** justo antes de abrir el micrófono → "habla ahora".
- **Beep bajo (660 Hz)** justo después de cerrar el micrófono → "estoy procesando".
- Los beeps usan Web Audio API, no archivos, así que no añaden peso al bundle.

### Feedback visual

| Durante | Indicador |
|---------|-----------|
| `listening` | Círculo grande con icono `Mic` + animación de pulso (`@keyframes vaPulse`) + hint "Habla ahora..." → reemplazado por el interim transcript en tiempo real cuando llega. |
| `confirming` | Caja `Tu respuesta: <valor>` + mini-mic con pulso + "Escuchando... di sí o no". El indicador mini comunica que el mic sigue abierto. |
| Cualquier estado activo | Barra de progreso superior (`width` proporcional a `currentIndex / total`) y texto "Pregunta N de M". |
| `error` | Caja rosada con icono `AlertCircle` y botón "Reintentar". |
| `done` | Icono `CheckSquare` verde con "¡Listo! Llenamos el formulario con tus respuestas." |

### Pantalla de review/resumen (`state === 'reviewing'`)

`voice-assistant.component.html:106-136`:

- Lista de respuestas capturadas con `label` (extraído de la pregunta) y `value`.
- Botón **Editar** por fila → llama a `editField(key)` → reinicia ese prompt.
- Botones **Cancelar** y **Confirmar y llenar** persistentes.
- Mientras tanto, el componente está **escuchando**: el usuario puede decir `"sí"`, `"editar nombre"`, etc.

### Botones de control persistentes

En `listening`, `confirming` o `asking`, una barra inferior siempre visible muestra:

- **Atrás** (solo si `currentIndex > 0`).
- **Repetir**.
- Hint en gris claro: *"También puedes decir 'atrás', 'repetir' o 'cancelar'"*.

Esto da una salida no-verbal a usuarios que se atascan o que prefieren tocar la pantalla.

### Responsive

`voice-assistant.component.scss:25`:

```scss
@media (max-width: 480px) {
  right: 0.75rem;
  bottom: 0.75rem;
  left: 0.75rem;
  width: auto;
}
```

En móvil el panel toma todo el ancho con márgenes laterales mínimos. Se mantiene fijo abajo (`position: fixed; bottom`).

### Tag "opcional"

Cuando un prompt tiene `optional: true`, la pregunta muestra una píldora gris `OPCIONAL` y un hint:

> *"Puedes decir 'no tengo' o 'saltar' para omitir esta pregunta."*

En `listening`, además aparece un botón **Saltar pregunta** que llama a `skipCurrent()`.

---

## 11. Integraciones existentes (casos de uso reales)

El asistente está integrado en tres puntos del portal. Todos siguen el mismo patrón: importar `VoiceAssistantComponent` + `VoicePromptBuilder`, exponer un `isVoiceAssistantAvailable` (gate por feature flag) y un método `startVoiceAssistant()` que arma los prompts con el builder y mergea las respuestas al state local.

### 11.1 Contact Registration (registro + login)

[`features/portal/contact-registration/contact-registration.component.ts`](../../front_apps/service-portal/src/app/features/portal/contact-registration/contact-registration.component.ts)

- **Botón "Llenar con asistente de voz"** (paso de registro) → `startVoiceAssistant()`. Construye prompts dinámicos a partir de los `DocFields` del Contact, con detección heurística por nombre/tipo.
- **Botón "Iniciar sesión con voz"** (paso de login) → `startVoiceLoginAssistant()`. Un solo prompt (`document`), tras capturarlo dispara `onConnect()` automáticamente (con OTP si aplica).

Hoy la construcción de prompts dinámicos sigue siendo inline (se mantiene por compatibilidad con la heurística sobre `DocField`), pero **se puede migrar a `builder.fromField(f)`** que cubre los mismos casos:

```typescript
const prompts = visibleFields.map((f) => this.builder.fromField(f));
```

Cuando se haga la migración, el detector queda centralizado en `VoicePromptBuilder.fromField()`.

### 11.2 Create Logbook Tool (Bitácora)

[`features/tools/create-logbook/create-logbook-tool.component.ts`](../../front_apps/service-portal/src/app/features/tools/create-logbook/create-logbook-tool.component.ts)

Formulario de un solo campo (`user_context`: texto largo, mínimo 10 caracteres). El asistente lo dicta como texto libre y al final el contenido se asigna a la señal `userContext`:

```typescript
async startVoiceAssistant(): Promise<void> {
  const prompt = this.builder.text({
    key: 'user_context',
    label: 'caso o necesidad',
    question: 'Cuéntame con detalle el caso o necesidad que quieres registrar en tu bitácora.',
    minLength: 10,
  });

  const answers = await this.voiceAssistant.startSurvey([prompt]);
  if (answers['user_context']) this.userContext.set(answers['user_context']);
}
```

### 11.3 PQR Tool (Peticiones, Quejas y Reclamos)

[`features/tools/pqr/pqr-tool.component.ts`](../../front_apps/service-portal/src/app/features/tools/pqr/pqr-tool.component.ts)

Dos campos requeridos: `subject` (resumen corto) y `description` (detalles). El asistente solo aparece después de que el usuario selecciona el tipo de PQR (vista `form`), porque la pregunta del asistente personaliza el label del tipo seleccionado:

```typescript
async startVoiceAssistant(): Promise<void> {
  const typeLabel = this.selectedType()?.label?.toLowerCase() || 'PQR';

  const prompts = [
    this.builder.text({
      key: 'subject',
      label: 'asunto',
      question: `¿Cuál es el asunto de tu ${typeLabel}? Resúmelo en una frase corta.`,
      minLength: 3,
      maxLength: 200,
    }),
    this.builder.text({
      key: 'description',
      label: 'descripción',
      question: 'Cuéntame los detalles del caso. Sé tan específico como quieras...',
      minLength: 10,
    }),
  ];

  const answers = await this.voiceAssistant.startSurvey(prompts);
  if (answers['subject']) this.subject.set(answers['subject']);
  if (answers['description']) this.description.set(answers['description']);
}
```

### Patrón común para integrar el asistente en una nueva tool

1. Importar `VoiceAssistantComponent`, `VoicePromptBuilder` y `SettingsService`.
2. Añadir un `@ViewChild(VoiceAssistantComponent)` para invocar `startSurvey()`.
3. Exponer `isVoiceAssistantAvailable` como gate del botón en el template.
4. Crear `startVoiceAssistant()` que arma los prompts con el builder y mergea las respuestas en los signals locales.
5. En el template, añadir un botón con la clase `btn-voice-assistant` (estilo gradient azul, consistente con las demás tools) y el componente `<app-voice-assistant>` flotante al final.

> No se necesita registrar nada en módulos: tanto el builder como el `VoiceAssistantComponent` son standalone, `providedIn: 'root'` o se importan directamente en `imports`.

---

## 12. Limitaciones conocidas

| Limitación | Causa | Mitigación |
|------------|-------|-----------|
| Solo Chrome/Edge para STT | API `SpeechRecognition` no estandarizada | El botón se oculta automáticamente en Firefox / Safari móvil. |
| No tiene modo IA aún | Fase B no implementada | El flag y la validación ya existen. Falta el flujo conversacional. |
| Aún no en agendamiento de citas | Quedó fuera del scope de la Fase C inicial | Cubierto: registro/login, bitácora, PQR. Pendiente: `meet-scheduling-tool`. |
| Sin memoria entre sesiones | El asistente no guarda nada local | Cada arranque es greenfield. Si el usuario recarga, vuelve a presentarse. |
| `sanitizeDigits` no soporta "cien/mil" | Solo 0–99 hablados | Para documentos se pide "dígito por dígito" explícitamente. |
| Reconocimiento confuso con nombres propios | El STT es genérico, no entrenado para nombres | El usuario puede decir "no" en la confirmación y reintentar. |
| El usuario debe permitir el micrófono | Política de los navegadores | Sin permiso, el STT falla y se muestra error → reintentar. |
| Requiere HTTPS | Web Speech API exige contexto seguro | El portal en producción ya corre sobre HTTPS. |
| TTS puede sonar "robótico" según el SO | Depende de las voces instaladas en el dispositivo | El catálogo `FEMALE_NAMES`/`MALE_NAMES` prioriza Google y Microsoft Natural, que son las más realistas. |

---

## Referencias rápidas a archivos

| Archivo | Líneas relevantes |
|---------|-------------------|
| `common_configurations/common_configurations/doctype/common_configurations_settings/common_configurations_settings.json` | Layout y campos del Singleton |
| `common_configurations/common_configurations/doctype/common_configurations_settings/common_configurations_settings.py:14` | `_validate_voice_assistant_ai` |
| `common_configurations/common_configurations/doctype/common_configurations_settings/common_configurations_settings.py:41` | `validate_ai_configuration` (5 checks) |
| `common_configurations/api/settings/endpoints.py:15` | `get_public_settings` |
| `common_configurations/api/settings/endpoints.py:58` | `diagnose_voice_assistant_ai` |
| `front_apps/service-portal/src/app/core/services/settings.service.ts` | `SettingsService` completo |
| `front_apps/service-portal/src/app/core/services/voice/tts.service.ts` | `TtsService`, catálogos de voces |
| `front_apps/service-portal/src/app/core/services/voice/stt.service.ts` | `SttService` con fallback interim |
| `front_apps/service-portal/src/app/core/services/voice/sound.service.ts` | `SoundService` (Web Audio API) |
| `front_apps/service-portal/src/app/core/services/voice/voice-prompt.types.ts` | Interface `VoicePrompt` (compartida) |
| `front_apps/service-portal/src/app/core/services/voice/sanitizers.ts` | Sanitizers compartidos (`sanitizeDigits`, `sanitizeEmail`, `sanitizeSelectMatch`, `sanitizeText`, `normalizeText`) |
| `front_apps/service-portal/src/app/core/services/voice/voice-prompt-builder.service.ts` | `VoicePromptBuilder` (fábrica de prompts) |
| `front_apps/service-portal/src/app/shared/components/voice-assistant/voice-assistant.component.ts` | Componente principal |
| `front_apps/service-portal/src/app/shared/components/voice-assistant/voice-assistant.component.html` | Template (estados visuales) |
| `front_apps/service-portal/src/app/shared/components/voice-assistant/voice-assistant.component.scss` | Estilos del panel flotante |
| `front_apps/service-portal/src/app/features/portal/contact-registration/contact-registration.component.ts` | Integración registro + login |
| `front_apps/service-portal/src/app/features/tools/create-logbook/create-logbook-tool.component.ts` | Integración Bitácora |
| `front_apps/service-portal/src/app/features/tools/pqr/pqr-tool.component.ts` | Integración PQR |
| `front_apps/service-portal/src/app/app.config.ts:21` | `provideAppInitializer` que llama `settings.load()` |
