# Voice Input Component

Componente reutilizable de Angular para convertir voz a texto usando la Web Speech API.

## Características

- ✅ Reconocimiento de voz en español
- ✅ Transcripción en tiempo real
- ✅ Componente standalone (no requiere módulos)
- ✅ Indicadores visuales de grabación
- ✅ Manejo automático de errores
- ✅ Compatible con Chrome, Edge, Safari
- ✅ Responsive y accesible

## Uso Básico

```typescript
import { VoiceInputComponent } from './shared/components/voice-input/voice-input.component';

@Component({
  selector: 'app-my-form',
  standalone: true,
  imports: [VoiceInputComponent, FormsModule],
  template: `
    <textarea [(ngModel)]="myText"></textarea>

    <app-voice-input
      (transcriptChange)="myText = $event"
    ></app-voice-input>
  `
})
export class MyFormComponent {
  myText = '';
}
```

## Uso Avanzado

### Con todas las opciones

```typescript
<app-voice-input
  [language]="'es-ES'"
  [continuous]="true"
  [interimResults]="true"
  [buttonLabel]="'Dictar por voz'"
  (transcriptChange)="onTranscript($event)"
  (recordingStateChange)="onRecordingChange($event)"
  (error)="onError($event)"
></app-voice-input>
```

### Modo Append (agregar al texto existente)

```typescript
onTranscript(newText: string): void {
  this.myText += (this.myText ? ' ' : '') + newText;
}
```

### Modo Replace (reemplazar texto)

```typescript
onTranscript(newText: string): void {
  this.myText = newText;
}
```

## Inputs

| Input | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `language` | string | 'es-ES' | Idioma para reconocimiento ('es-ES', 'es-MX', 'en-US') |
| `continuous` | boolean | true | Grabación continua hasta detener manualmente |
| `interimResults` | boolean | true | Mostrar resultados mientras se habla |
| `buttonLabel` | string | 'Dictar' | Texto del botón |

## Outputs

| Output | Tipo | Descripción |
|--------|------|-------------|
| `transcriptChange` | string | Texto transcrito (se actualiza continuamente) |
| `recordingStateChange` | boolean | Estado de grabación (true/false) |
| `error` | string | Mensajes de error |

## Compatibilidad de Navegadores

| Navegador | Soporte |
|-----------|---------|
| Chrome | ✅ Completo |
| Edge | ✅ Completo |
| Safari | ✅ Completo (iOS 14.5+) |
| Firefox | ⚠️ Limitado |
| Opera | ✅ Completo |

## Permisos

El componente requiere permiso de micrófono. El navegador mostrará una solicitud automáticamente la primera vez.

## Manejo de Errores

El componente maneja automáticamente los siguientes errores:

- `no-speech`: No se detectó voz
- `audio-capture`: Problema con el micrófono
- `not-allowed`: Permiso denegado
- `network`: Error de red
- `aborted`: Grabación abortada

Los errores se emiten via `(error)` y se muestran visualmente en el componente.

## Ejemplo Completo: Booking de Citas

```typescript
@Component({
  selector: 'app-appointment-booking',
  standalone: true,
  imports: [VoiceInputComponent, FormsModule],
  template: `
    <form (submit)="bookAppointment()">
      <div class="form-group">
        <label>¿Por qué necesitas la cita?</label>
        <textarea
          [(ngModel)]="appointmentContext"
          name="context"
          rows="4"
          placeholder="Describe el motivo de tu consulta..."
        ></textarea>

        <app-voice-input
          [language]="'es-ES'"
          (transcriptChange)="appointmentContext = $event"
          (error)="showError($event)"
        ></app-voice-input>
      </div>

      <button type="submit">Agendar Cita</button>
    </form>
  `
})
export class AppointmentBookingComponent {
  appointmentContext = '';

  bookAppointment(): void {
    // Submit appointment with voice-captured context
    console.log('Context:', this.appointmentContext);
  }

  showError(error: string): void {
    alert(error);
  }
}
```

## Estilos Personalizados

El componente viene con estilos predeterminados, pero puedes personalizarlos:

```scss
::ng-deep app-voice-input {
  .voice-button {
    background: your-custom-color;
    // Your custom styles
  }
}
```

## Accesibilidad

- El botón incluye `title` con descripción
- Estados visuales claros (grabando/detenido/error)
- Mensajes de error legibles
- Compatible con lectores de pantalla

## Tips de Uso

1. **Habla claramente** y a velocidad normal
2. **Espera un momento** antes de hablar después de presionar el botón
3. **En ambientes ruidosos**, acércate al micrófono
4. **Para mejores resultados**, usa Chrome o Edge
5. **Revisa la transcripción** antes de enviar (puede haber errores)

## Troubleshooting

### El componente no aparece
- Verifica que el navegador soporte Web Speech API
- Revisa la consola para errores

### No detecta mi voz
- Verifica permisos del micrófono
- Comprueba que el micrófono funciona
- Intenta hablar más alto o más cerca

### Transcripción incorrecta
- Habla más despacio y claro
- Verifica que el idioma esté configurado correctamente
- Usa palabras completas, no abreviaturas

## Licencia

MIT
