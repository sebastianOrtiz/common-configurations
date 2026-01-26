/**
 * Voice Input Component
 *
 * Reusable component for speech-to-text input using Web Speech API
 * Can be used with any textarea or input field
 */

import { Component, EventEmitter, Input, Output, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// Extend Window interface to include webkitSpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

@Component({
  selector: 'app-voice-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './voice-input.component.html',
  styleUrls: ['./voice-input.component.scss']
})
export class VoiceInputComponent implements OnDestroy {
  @Input() language: string = 'es-ES'; // Default to Spanish
  @Input() continuous: boolean = true; // Continue recording until stopped
  @Input() interimResults: boolean = true; // Show interim results while speaking
  @Input() buttonLabel: string = 'Dictar';

  @Output() transcriptChange = new EventEmitter<string>();
  @Output() recordingStateChange = new EventEmitter<boolean>();
  @Output() error = new EventEmitter<string>();

  // State signals
  protected isRecording = signal<boolean>(false);
  protected isSupported = signal<boolean>(false);
  protected currentTranscript = signal<string>('');
  protected errorMessage = signal<string | null>(null);

  private recognition: any = null;
  private finalTranscript = '';

  constructor() {
    this.checkBrowserSupport();
    if (this.isSupported()) {
      this.initializeRecognition();
    }
  }

  ngOnDestroy(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  /**
   * Check if browser supports Web Speech API
   */
  private checkBrowserSupport(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.isSupported.set(!!SpeechRecognition);
  }

  /**
   * Initialize speech recognition
   */
  private initializeRecognition(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.language;
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;

    // Event: Result received
    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          this.finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update current transcript for display
      const fullTranscript = this.finalTranscript + interimTranscript;
      this.currentTranscript.set(fullTranscript);

      // Emit the current transcript
      this.transcriptChange.emit(fullTranscript.trim());
    };

    // Event: Recognition ends
    this.recognition.onend = () => {
      this.isRecording.set(false);
      this.recordingStateChange.emit(false);

      // Emit final transcript
      if (this.finalTranscript) {
        this.transcriptChange.emit(this.finalTranscript.trim());
      }
    };

    // Event: Error occurred
    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);

      let errorMsg = 'Error al procesar el audio';

      switch (event.error) {
        case 'no-speech':
          errorMsg = 'No se detectó ningún discurso';
          break;
        case 'audio-capture':
          errorMsg = 'No se pudo capturar el audio del micrófono';
          break;
        case 'not-allowed':
          errorMsg = 'Permiso de micrófono denegado';
          break;
        case 'network':
          errorMsg = 'Error de red';
          break;
        case 'aborted':
          errorMsg = 'Grabación abortada';
          break;
      }

      this.errorMessage.set(errorMsg);
      this.error.emit(errorMsg);
      this.isRecording.set(false);
      this.recordingStateChange.emit(false);
    };

    // Event: Recognition starts
    this.recognition.onstart = () => {
      this.errorMessage.set(null);
    };
  }

  /**
   * Toggle recording
   */
  toggleRecording(): void {
    if (!this.isSupported()) {
      this.errorMessage.set('Tu navegador no soporta el reconocimiento de voz');
      this.error.emit('Browser not supported');
      return;
    }

    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  /**
   * Start recording
   */
  private startRecording(): void {
    try {
      // Reset transcripts
      this.finalTranscript = '';
      this.currentTranscript.set('');
      this.errorMessage.set(null);

      this.recognition.start();
      this.isRecording.set(true);
      this.recordingStateChange.emit(true);
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.errorMessage.set('Error al iniciar la grabación');
      this.error.emit('Failed to start recording');
    }
  }

  /**
   * Stop recording
   */
  private stopRecording(): void {
    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }

  /**
   * Clear transcript
   */
  clearTranscript(): void {
    this.finalTranscript = '';
    this.currentTranscript.set('');
    this.transcriptChange.emit('');
  }
}
