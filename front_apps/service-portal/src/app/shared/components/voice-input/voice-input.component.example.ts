/**
 * EXAMPLE: How to use the Voice Input Component
 *
 * This file shows different ways to integrate voice input into your forms
 */

import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoiceInputComponent } from './voice-input.component';

@Component({
  selector: 'app-voice-input-example',
  standalone: true,
  imports: [CommonModule, FormsModule, VoiceInputComponent],
  template: `
    <!-- EXAMPLE 1: Basic usage with textarea -->
    <div class="form-group">
      <label for="context">Contexto de la cita</label>
      <textarea
        id="context"
        [(ngModel)]="appointmentContext"
        rows="4"
        placeholder="Describe el motivo de tu cita..."
      ></textarea>

      <!-- Voice input button below textarea -->
      <app-voice-input
        [language]="'es-ES'"
        [buttonLabel]="'Dictar por voz'"
        (transcriptChange)="onVoiceTranscript($event)"
        (error)="onVoiceError($event)"
      ></app-voice-input>

      <!-- Display current value -->
      <p class="help-text">{{ appointmentContext().length }} caracteres</p>
    </div>

    <!-- EXAMPLE 2: Inline with input controls -->
    <div class="form-group">
      <label for="notes">Notas adicionales</label>
      <div class="input-with-voice">
        <textarea
          id="notes"
          [(ngModel)]="notes"
          rows="3"
          placeholder="Agrega notas adicionales..."
        ></textarea>

        <div class="voice-controls">
          <app-voice-input
            [language]="'es-ES'"
            [continuous]="true"
            [interimResults]="true"
            (transcriptChange)="onNotesVoiceTranscript($event)"
            (recordingStateChange)="onRecordingStateChange($event)"
          ></app-voice-input>

          @if (isRecording()) {
            <button type="button" (click)="clearNotes()">Limpiar</button>
          }
        </div>
      </div>
    </div>

    <!-- EXAMPLE 3: Append mode (add to existing text) -->
    <div class="form-group">
      <label for="description">Descripción del caso</label>
      <textarea
        id="description"
        [(ngModel)]="caseDescription"
        rows="6"
        placeholder="Describe los detalles del caso..."
      ></textarea>

      <div class="voice-actions">
        <app-voice-input
          [language]="'es-ES'"
          (transcriptChange)="appendToDescription($event)"
        ></app-voice-input>

        <button type="button" (click)="clearDescription()">
          Limpiar descripción
        </button>
      </div>
    </div>
  `
})
export class VoiceInputExampleComponent {
  // Example 1: Replace mode
  appointmentContext = signal<string>('');

  onVoiceTranscript(transcript: string): void {
    // Replace entire content with voice transcript
    this.appointmentContext.set(transcript);
  }

  onVoiceError(error: string): void {
    console.error('Voice input error:', error);
    // You could show a toast/snackbar here
  }

  // Example 2: Recording state tracking
  notes = signal<string>('');
  isRecording = signal<boolean>(false);

  onNotesVoiceTranscript(transcript: string): void {
    this.notes.set(transcript);
  }

  onRecordingStateChange(isRecording: boolean): void {
    this.isRecording.set(isRecording);
  }

  clearNotes(): void {
    this.notes.set('');
  }

  // Example 3: Append mode
  caseDescription = signal<string>('');

  appendToDescription(transcript: string): void {
    // Append voice transcript to existing content
    const current = this.caseDescription();
    const separator = current ? ' ' : '';
    this.caseDescription.set(current + separator + transcript);
  }

  clearDescription(): void {
    this.caseDescription.set('');
  }
}

/**
 * COMPONENT API REFERENCE
 *
 * Inputs:
 * -------
 * @Input() language: string = 'es-ES'
 *   - Language for speech recognition
 *   - Default: Spanish (Spain)
 *   - Examples: 'es-ES', 'es-MX', 'en-US', 'en-GB'
 *
 * @Input() continuous: boolean = true
 *   - Whether to continue recording until manually stopped
 *   - true: Keeps recording until you click stop
 *   - false: Stops after detecting a pause in speech
 *
 * @Input() interimResults: boolean = true
 *   - Whether to show results while still speaking
 *   - true: Updates text in real-time as you speak
 *   - false: Only shows final result after pause
 *
 * @Input() buttonLabel: string = 'Dictar'
 *   - Text to display on the button
 *   - Example: 'Dictar por voz', 'Grabar', etc.
 *
 * Outputs:
 * --------
 * @Output() transcriptChange: EventEmitter<string>
 *   - Emits the current transcript text
 *   - Updates continuously if interimResults = true
 *   - Emits final result when recording stops
 *
 * @Output() recordingStateChange: EventEmitter<boolean>
 *   - Emits true when recording starts
 *   - Emits false when recording stops
 *   - Useful for showing/hiding UI elements
 *
 * @Output() error: EventEmitter<string>
 *   - Emits error messages when something goes wrong
 *   - Examples: permission denied, no speech detected, network error
 *
 * Browser Support:
 * ---------------
 * - Chrome/Edge: Full support
 * - Safari: Full support (iOS 14.5+)
 * - Firefox: Limited support
 * - Opera: Full support
 *
 * Permissions:
 * -----------
 * - Requires microphone permission
 * - Browser will prompt user on first use
 * - Component shows error if permission denied
 *
 * Best Practices:
 * --------------
 * 1. Always provide fallback for browsers without support
 * 2. Handle errors gracefully (show user-friendly messages)
 * 3. Give visual feedback when recording (component does this automatically)
 * 4. Test with different accents and speaking speeds
 * 5. Use Spanish language setting for Spanish speakers
 */
