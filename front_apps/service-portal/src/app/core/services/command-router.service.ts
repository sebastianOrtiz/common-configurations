/**
 * Command Router Service
 *
 * Turns a free-form spoken transcript into one of the currently available
 * `VoiceAction`s (see `AssistantContextService`). Hybrid interpreter:
 *
 * 1. Local rules (fast, no network): normalized keyword/verb matching plus
 *    a generic overlap match against every action's `samplePhrases`.
 * 2. AI fallback (only when no rule matched AND
 *    `SettingsService.isVoiceAssistantAIEnabled()`): calls the backend
 *    `interpret_command` method, which picks one of the action ids we send
 *    it (or null) using the LLM.
 *
 * The backend contract is fixed (do not change): args are
 * `{ transcript, portal_name, actions: <JSON string>, honeypot: '' }` and
 * the response (`response.message`) is
 * `{ action_id, args, confidence, spoken_reply }`.
 */

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';
import { SettingsService } from './settings.service';
import { StateService } from './state.service';
import { VoiceAction } from './assistant-context.service';

export interface CommandInterpretation {
  action: VoiceAction | null;
  args: { query?: string };
  spokenReply?: string | null;
}

interface InterpretCommandResponse {
  action_id: string | null;
  args: { query?: string } | null;
  confidence: 'high' | 'medium' | 'low';
  spoken_reply: string | null;
}

const INTERPRET_COMMAND_API = 'common_configurations.api.navigation.interpret_command';

/** Minimum token length considered meaningful for the generic samplePhrase overlap match. */
const MIN_TOKEN_LENGTH = 4;

/** Short Spanish function words dropped by `tokenizeLoose` (used for "abre <destino>" matching). */
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'al', 'un', 'una', 'unos', 'unas',
  'mi', 'tu', 'su', 'me', 'te', 'se', 'en', 'por', 'para', 'con', 'y', 'o', 'a',
]);

@Injectable({ providedIn: 'root' })
export class CommandRouterService {
  private frappeApi = inject(FrappeApiService);
  private settingsService = inject(SettingsService);
  private stateService = inject(StateService);

  /**
   * Resolve a transcript to an action from the given (currently available)
   * action list. Never throws — worst case resolves `{ action: null, args: {} }`.
   */
  async interpret(transcript: string, actions: VoiceAction[]): Promise<CommandInterpretation> {
    const norm = this.normalize(transcript);
    if (!norm) return { action: null, args: {} };

    const ruleMatch = this.matchRules(norm, actions);
    if (ruleMatch) return ruleMatch;

    if (this.settingsService.isVoiceAssistantAIEnabled()) {
      try {
        return await this.interpretWithAI(transcript, actions);
      } catch (err) {
        console.error('[CommandRouter] AI interpretation failed:', err);
      }
    }

    return { action: null, args: {} };
  }

  // ============================================================
  // Local rules
  // ============================================================

  private matchRules(norm: string, actions: VoiceAction[]): CommandInterpretation | null {
    // Explicit cancel/dismiss — no action, and no further matching attempted.
    if (/^(cancelar|cancela|cierra|nada|olvidalo)$/.test(norm)) {
      return { action: null, args: {} };
    }

    if (/\b(atras|volver|regresa|regresar|anterior)\b/.test(norm)) {
      const action = this.byId(actions, 'nav.back');
      if (action) return { action, args: {} };
    }

    if (/\b(inicio|portada|menu principal|pagina principal|principal)\b/.test(norm)) {
      const action = this.byId(actions, 'nav.home');
      if (action) return { action, args: {} };
    }

    if (/\b(ayuda|opciones|que puedes hacer|que puedo decir)\b/.test(norm)) {
      const action = this.byId(actions, 'help');
      if (action) return { action, args: {} };
    }

    // Authentication intent ("autenticarme", "quiero entrar", "iniciar sesión"...).
    // Checked before the generic "abre/ve a X" and "busca X" rules so phrases
    // like "quiero entrar" don't get mis-routed to a tool or a search.
    if (
      /\b(autenticar|autenticarme|identificarme|iniciar sesion|loguear|loguearme|registrarme|crear cuenta)\b/.test(norm) ||
      /^(entrar|acceder|ingresar|quiero entrar|quiero acceder|quiero ingresar)$/.test(norm)
    ) {
      const action = this.byId(actions, 'login');
      if (action) return { action, args: {} };
    }

    // "abre PQR" / "ve a mis citas" / "llevame al inicio de sesion" ...
    const openMatch = norm.match(
      /^(abrir|abre|ir a|ir|ve a|ve|vamos a|vamos|entra a|entra|llevame a|llevame|muestrame|quiero ir a|quiero ir)\s+(.+)/
    );
    if (openMatch) {
      const toolMatch = this.matchByTokenOverlap(
        openMatch[2],
        actions.filter((a) => a.id.startsWith('tool.'))
      );
      if (toolMatch) return { action: toolMatch, args: {} };
    }

    // "busca licencia de construccion" / "necesito renovar mi licencia" ...
    const searchMatch = norm.match(/^(buscar|busca|necesito|quiero|encontrar|donde)\s+(.+)/);
    if (searchMatch) {
      const action = actions.find((a) => a.builtin === 'search');
      if (action) return { action, args: { query: searchMatch[2].trim() } };
    }

    // "llename el formulario" / "ayudame con este formulario" ...
    if (
      /\b(llename|lename|llenar|llena|llenalo|llenarlo|completar|completa|completalo|formulario)\b/.test(norm) ||
      /\bayudame (a llenar|con (el|este) formulario)\b/.test(norm)
    ) {
      const action = actions.find((a) => a.builtin === 'fill_form');
      if (action) return { action, args: {} };
    }

    // Generic catch-all: overlap the transcript against every action's samplePhrases.
    const generic = this.matchBySamplePhrases(norm, actions);
    if (generic) return { action: generic, args: {} };

    return null;
  }

  private byId(actions: VoiceAction[], id: string): VoiceAction | null {
    return actions.find((a) => a.id === id) || null;
  }

  /**
   * Best action whose `description` shares the most meaningful tokens with
   * `text`. Used for "abre <tool>" style commands, where `text` is already
   * the part the citizen used to name the destination — so it uses a looser
   * threshold (stopwords only) than the generic fallback below, otherwise a
   * short tool label/acronym (e.g. "PQR") could never match.
   */
  private matchByTokenOverlap(text: string, candidates: VoiceAction[]): VoiceAction | null {
    const tokens = this.tokenizeLoose(text);
    if (!tokens.length || !candidates.length) return null;

    let best: VoiceAction | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const hay = this.normalize(candidate.description);
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore > 0 ? best : null;
  }

  /**
   * Compares the whole transcript against every registered action's
   * `samplePhrases`: an exact substring match is an instant hit; otherwise
   * requires overlapping at least 2 meaningful tokens (or all of them, for
   * single-token phrases) to count as a confident match.
   */
  private matchBySamplePhrases(norm: string, actions: VoiceAction[]): VoiceAction | null {
    const transcriptTokens = this.tokenize(norm);
    if (!transcriptTokens.length) return null;

    let best: VoiceAction | null = null;
    let bestScore = 0;

    for (const action of actions) {
      for (const phrase of action.samplePhrases) {
        const phraseNorm = this.normalize(phrase);
        if (!phraseNorm) continue;

        if (phraseNorm.length >= MIN_TOKEN_LENGTH && this.containsWholePhrase(norm, phraseNorm)) {
          return action; // exact phrase spoken — highest confidence, short-circuit
        }

        const phraseTokens = this.tokenize(phraseNorm);
        if (!phraseTokens.length) continue;

        let score = 0;
        for (const token of phraseTokens) {
          if (this.tokenMatches(token, transcriptTokens)) score++;
        }

        const required = Math.min(2, phraseTokens.length);
        if (score >= required && score > bestScore) {
          bestScore = score;
          best = action;
        }
      }
    }

    return best;
  }

  /**
   * A phrase token matches a transcript token if they're equal or (both ≥4
   * chars) one contains the other — handles plural/singular ("peticion" vs
   * "peticiones", "queja" vs "quejas") without loose substring false hits.
   */
  private tokenMatches(phraseToken: string, transcriptTokens: string[]): boolean {
    for (const t of transcriptTokens) {
      if (t === phraseToken) return true;
      if (
        phraseToken.length >= MIN_TOKEN_LENGTH &&
        t.length >= MIN_TOKEN_LENGTH &&
        (t.includes(phraseToken) || phraseToken.includes(t))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whole-word/phrase containment (not a raw substring), so "ayuda" does NOT
   * match inside "ayudame". Works for multi-word phrases ("mis citas") too.
   */
  private containsWholePhrase(haystack: string, phrase: string): boolean {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystack);
  }

  private tokenize(text: string): string[] {
    return this.normalize(text)
      .split(/\s+/)
      .filter((t) => t.length >= MIN_TOKEN_LENGTH);
  }

  /** Same tokenizer, but only drops short Spanish stopwords instead of a hard length cutoff (see `matchByTokenOverlap`). */
  private tokenizeLoose(text: string): string[] {
    return this.normalize(text)
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  }

  private normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  // ============================================================
  // AI fallback
  // ============================================================

  private async interpretWithAI(
    transcript: string,
    actions: VoiceAction[]
  ): Promise<CommandInterpretation> {
    const payloadActions = actions.map((a) => ({
      id: a.id,
      description: a.description,
      sample_phrases: a.samplePhrases,
    }));

    const response = await firstValueFrom(
      this.frappeApi.callMethod<InterpretCommandResponse>(INTERPRET_COMMAND_API, {
        transcript,
        portal_name: this.stateService.selectedPortal()?.portal_name || '',
        actions: JSON.stringify(payloadActions),
        honeypot: '',
      })
    );

    const data = response?.message;
    if (!data) return { action: null, args: {} };

    return {
      action: data.action_id ? this.byId(actions, data.action_id) : null,
      args: data.args || {},
      spokenReply: data.spoken_reply,
    };
  }
}
