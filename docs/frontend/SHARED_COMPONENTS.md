# Componentes Compartidos

Los componentes en `src/app/shared/components/` son reusables a traves de toda la app. Son **standalone** y se importan donde se necesiten.

| Componente | Selector | Archivo |
|------------|----------|---------|
| Icon | `<app-icon>` | `shared/components/icon/icon.component.ts` |
| Voice Input | `<app-voice-input>` | `shared/components/voice-input/voice-input.component.ts` |

> Modales, spinners y otros componentes "compartidos" estan inline en cada tool (no extraidos). Ver seccion 3.

---

## 1. IconComponent

Archivo: `src/app/shared/components/icon/icon.component.ts`

Wrapper sobre `lucide-angular` que expone una API simple y un catalogo curado de iconos.

### Inputs

| Input | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `name` | `string \| undefined` | (Circle) | Nombre del icono (PascalCase). Si no matchea, usa `Circle` como fallback. |
| `size` | `number` | `24` | Tamano en px |
| `strokeWidth` | `number` | `2` | Grosor del trazo |
| `customClass` | `string` | `''` | Clases CSS adicionales |

### Catalogo de iconos disponibles

Definido en `ICON_MAP` (line 24-37):

```
Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
ClipboardList, ClipboardCheck, FileText, File, Folder,
Mail, MessageSquare, Phone, User, Users,
UserCheck, UserPlus, Briefcase, Clipboard, Settings,
Wrench, CheckSquare, ListTodo, MapPin,
BarChart, PieChart, TrendingUp, DollarSign, CreditCard,
ShoppingCart, Package, Truck, Home, Building,
Store, Heart, Star, Bell, BookOpen,
GraduationCap, Video, Mic, Camera, Image,
FileCheck, FilePlus, Download, Upload, Search,
Filter, Circle, ChevronRight, ChevronLeft, LogOut, AlertCircle, Inbox,
ExternalLink, Link
```

> Si el `Tool Type` o `Portal Tool` configurado en backend especifica un icono que **no esta en este map**, se muestra el fallback (`Circle`). Para agregar uno nuevo:
>
> 1. Importar el icono de `lucide-angular` en `icon.component.ts`.
> 2. Agregarlo al objeto `ICON_MAP`.

### Implementacion del setter

```typescript
// icon.component.ts:64-69
@Input() set name(value: string | undefined) {
  this.iconComponent = (value && value in ICON_MAP)
    ? ICON_MAP[value as keyof typeof ICON_MAP]
    : Circle;
}
```

### Ejemplo de uso

```html
<app-icon name="Calendar" [size]="32" [strokeWidth]="1.5"></app-icon>

<app-icon
  [name]="tool.icon || 'Circle'"
  [size]="24"
  customClass="text-blue-500"
></app-icon>
```

### Estilos por host

```typescript
// icon.component.ts:51-61
styles: [`
  :host {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  lucide-icon {
    display: inline-flex;
  }
`]
```

---

## 2. VoiceInputComponent

Archivo: `src/app/shared/components/voice-input/voice-input.component.ts`

Componente de dictado por voz usando **Web Speech API** (`webkitSpeechRecognition` / `SpeechRecognition`). Permite a usuarios dictar texto que se emite via output.

### Inputs

| Input | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `language` | `string` | `'es-ES'` | Idioma de reconocimiento. Ej: `es-CO`, `en-US` |
| `continuous` | `boolean` | `true` | Sigue grabando hasta que el usuario detenga |
| `interimResults` | `boolean` | `true` | Muestra resultados parciales mientras se habla |
| `buttonLabel` | `string` | `'Dictar'` | Texto del boton |

### Outputs

| Output | Tipo | Cuando emite |
|--------|------|--------------|
| `transcriptChange` | `EventEmitter<string>` | Cada vez que cambia el texto reconocido (parcial o final) |
| `recordingStateChange` | `EventEmitter<boolean>` | `true` al iniciar grabacion, `false` al detener |
| `error` | `EventEmitter<string>` | Mensajes de error (microfono denegado, no soportado, etc) |

### Estados internos

```typescript
// voice-input.component.ts:37-43
protected isRecording = signal<boolean>(false);
protected isSupported = signal<boolean>(false);
protected currentTranscript = signal<string>('');
protected errorMessage = signal<string | null>(null);
```

### Inicializacion

```typescript
// voice-input.component.ts:45-50
constructor() {
  this.checkBrowserSupport();
  if (this.isSupported()) {
    this.initializeRecognition();
  }
}
```

`checkBrowserSupport()` (line 61-64) revisa `window.SpeechRecognition || window.webkitSpeechRecognition`.

### Mapeo de errores (line 116-132)

| Codigo nativo | Mensaje al usuario |
|---------------|---------------------|
| `no-speech` | "No se detecto ningun discurso" |
| `audio-capture` | "No se pudo capturar el audio del microfono" |
| `not-allowed` | "Permiso de microfono denegado" |
| `network` | "Error de red" |
| `aborted` | "Grabacion abortada" |
| (default) | "Error al procesar el audio" |

### Ejemplo de uso

```typescript
// En el componente
onVoiceTranscript(transcript: string): void {
  this.appointmentContext.set(transcript);
}
```

```html
<textarea [(ngModel)]="context" rows="4"></textarea>
<app-voice-input
  language="es-ES"
  buttonLabel="Dictar"
  (transcriptChange)="onVoiceTranscript($event)"
  (error)="onVoiceError($event)"
></app-voice-input>
```

Ver tambien `shared/components/voice-input/voice-input.component.example.ts` para tres patrones de uso (replace, recording state tracking, append).

### Tools que lo usan

| Tool | Uso |
|------|-----|
| `meet-scheduling` | Contexto de la cita (textarea) |
| `create-logbook` | Descripcion del caso |
| `procedures` | Descripcion del tramite |
| `appointment-booking` (legacy) | Contexto de la cita |

### Soporte de navegadores

- Chrome / Edge: soporte completo
- Safari: iOS 14.5+
- Firefox: limitado
- Opera: completo

El componente solo permite click si `isSupported()` es `true`; si no, emite error.

### Metodos publicos

| Metodo | Descripcion |
|--------|-------------|
| `toggleRecording()` | Alterna entre iniciar/parar |
| `clearTranscript()` | Limpia el texto reconocido y emite cadena vacia |

### Cleanup

```typescript
// voice-input.component.ts:52-56
ngOnDestroy(): void {
  if (this.recognition) {
    this.recognition.stop();
  }
}
```

---

## 3. Otros patrones reusables (NO extraidos)

### Modales

Cada tool define sus modales inline en el HTML/SCSS con clases estandar:

```html
@if (showModal()) {
  <div class="modal-overlay" (click)="closeModal()">
    <div class="modal-content" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3>Titulo</h3>
        <button class="modal-close" (click)="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        ...
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" (click)="closeModal()">Cancelar</button>
        <button class="btn-primary" (click)="confirm()">Confirmar</button>
      </div>
    </div>
  </div>
}
```

Las clases `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-actions` son reutilizadas por convencion (cada tool replica el SCSS). Ver `STYLING.md` y `meet-scheduling-tool.component.scss` como referencia.

### Spinner

Generalmente inline:

```html
@if (loading()) {
  <div class="loading-container">
    <div class="spinner"></div>
    <p>Cargando...</p>
  </div>
}
```

Cada tool define su `.spinner` en SCSS (no hay componente shared).

### Boton "Volver"

Patron repetido en cada tool:

```html
<div class="tool-header">
  <button class="btn-back" (click)="goBack()">
    <app-icon name="ChevronLeft" [size]="20" [strokeWidth]="2"></app-icon>
    Volver
  </button>
  <h1>Titulo de la tool</h1>
</div>
```

### Estado "Acceso restringido" (anonimo)

```html
@if (isAnonymousUser()) {
  <div class="auth-required-state">
    <h3>Acceso restringido</h3>
    <p>Para usar esta herramienta necesitas iniciar sesion.</p>
    <button class="btn-primary" (click)="goToRegistration()">
      Registrarse / Iniciar sesion
    </button>
  </div>
}
```

---

## 4. Notas y deuda tecnica

- **No hay componente `ModalComponent` reusable**: cada tool duplica el HTML/SCSS de modal. Considerar extraer.
- **No hay componente `SpinnerComponent`**: cada tool define su animacion CSS. Mismo caso.
- **`IconComponent` con catalogo cerrado**: agregar un icono nuevo requiere editar el componente. Es seguro (tipado) pero rigido.
- **`VoiceInputComponent` asume es-ES por default**: si el portal sirve a paises de habla hispana variada (Colombia, Mexico, etc), considerar configurar `language` por portal.
- **Sin soporte para "append mode" by default**: el componente reemplaza el transcript completo. Para apendar hay que hacerlo en el componente consumidor (ver `voice-input.component.example.ts:122-127`).
- **No hay accessibility** (a11y) explicito en `<button>` del voice-input. Falta `aria-label` reactivo a `isRecording()`.
