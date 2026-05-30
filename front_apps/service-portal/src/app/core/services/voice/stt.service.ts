/**
 * Speech-To-Text Service
 *
 * Thin wrapper around the browser's SpeechRecognition API.
 * Single-shot mode: starts listening, resolves with the final transcript
 * (or rejects on error/no-speech).
 *
 * Browser support: Chrome/Edge yes, Safari partial, Firefox no.
 */

import { Injectable } from '@angular/core';

// Cross-browser handle (Webkit prefix in Chrome/Edge)
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@Injectable({ providedIn: 'root' })
export class SttService {
  private getCtor(): any {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  isSupported(): boolean {
    return !!this.getCtor();
  }

  /**
   * Listen once and resolve with the final recognized text.
   *
   * @param language BCP-47 language tag (es-ES, es-CO, etc.)
   * @param onInterim optional callback for live interim transcripts (preview)
   * @returns the final recognized text, or empty string if nothing heard
   */
  listenOnce(
    language: string = 'es-ES',
    onInterim?: (text: string) => void
  ): Promise<string> {
    const Ctor = this.getCtor();
    if (!Ctor) {
      return Promise.reject(new Error('SpeechRecognition no soportado en este navegador'));
    }

    return new Promise((resolve, reject) => {
      const recognition = new Ctor();
      recognition.lang = language;
      recognition.continuous = false;
      // Always enable interim so we can fall back when isFinal never fires
      // (common with very short answers like "sí" / "no")
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let finalText = '';
      let lastInterim = '';
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        const text = (finalText || lastInterim || '').trim();
        resolve(text);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interim += transcript;
          }
        }
        if (interim) {
          lastInterim = interim;
          if (onInterim) onInterim(interim);
        }
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' and 'aborted' aren't real errors — treat as silence
        if (event.error === 'no-speech' || event.error === 'aborted') {
          finish();
        } else if (!resolved) {
          resolved = true;
          reject(new Error(`Error de reconocimiento: ${event.error}`));
        }
      };

      recognition.onend = () => finish();

      try {
        recognition.start();
      } catch (err) {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  }
}
