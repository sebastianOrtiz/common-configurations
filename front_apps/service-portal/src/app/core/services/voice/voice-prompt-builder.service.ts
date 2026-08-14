/**
 * Voice Prompt Builder
 *
 * Helper service that constructs `VoicePrompt` objects for the voice
 * assistant out of common patterns:
 *
 * - Free text (with optional length validation)
 * - Spanish digits (cédula, teléfono)
 * - Email
 * - Select (matches against an option list, normalized for accents)
 * - Yes/no (Check fields)
 *
 * Plus a generic `fromField(field)` that picks the right strategy based
 * on the field's name/type/options — convenient for dynamic forms.
 *
 * Centralizing this here keeps all voice tools (registration, PQR,
 * logbook, etc.) consistent and avoids duplicating sanitizer logic.
 */

import { Injectable } from '@angular/core';
import {
  normalizeText,
  sanitizeDigits,
  sanitizeEmail,
  sanitizeSelectMatch,
  sanitizeText,
} from './sanitizers';
import { VoicePrompt } from './voice-prompt.types';

export interface SimpleField {
  fieldname: string;
  label?: string;
  fieldtype?: string;
  options?: string;
  reqd?: number | boolean;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class VoicePromptBuilder {
  /**
   * Build a prompt for a free-text field. Validates non-empty (and
   * optionally minLength). Confirms by reading back the value.
   */
  text(opts: {
    key: string;
    label: string;
    question?: string;
    optional?: boolean;
    minLength?: number;
    maxLength?: number;
  }): VoicePrompt {
    const label = opts.label;
    return {
      key: opts.key,
      question: opts.question || `Por favor dictá ${label.toLowerCase()}.`,
      sanitize: (v) => sanitizeText(v, opts.minLength),
      optional: opts.optional,
      minLength: opts.minLength,
      maxLength: opts.maxLength,
      confirmTemplate: (val) =>
        `Entendí "${this.shorten(val)}". ¿Es correcto? Di sí o no.`,
    };
  }

  /**
   * Build a prompt for a digits-only field (document number, phone, etc.)
   * Converts Spanish number words to digits.
   */
  digits(opts: {
    key: string;
    label: string;
    question?: string;
    optional?: boolean;
    minLength?: number;
    maxLength?: number;
    allowPlus?: boolean;
  }): VoicePrompt {
    const label = opts.label;
    return {
      key: opts.key,
      question:
        opts.question ||
        `¿Cuál es tu ${label.toLowerCase()}? Por favor díctalo dígito por dígito.`,
      sanitize: (v) => sanitizeDigits(v, !!opts.allowPlus),
      optional: opts.optional,
      minLength: opts.minLength,
      maxLength: opts.maxLength,
      confirmTemplate: (val) => `Entendí ${val}. ¿Es correcto? Di sí o no.`,
    };
  }

  /**
   * Build a prompt for an email field.
   */
  email(opts: { key: string; label?: string; optional?: boolean }): VoicePrompt {
    return {
      key: opts.key,
      question:
        '¿Cuál es tu correo electrónico? Puedes decir arroba, punto y guion para los símbolos.',
      sanitize: (v) => sanitizeEmail(v),
      optional: opts.optional,
      minLength: 5,
      confirmTemplate: (val) => `Entendí ${val}. ¿Es correcto? Di sí o no.`,
    };
  }

  /**
   * Build a prompt for a Select field with explicit options.
   */
  select(opts: {
    key: string;
    label: string;
    options: string[];
    optional?: boolean;
  }): VoicePrompt {
    return {
      key: opts.key,
      question: `Selecciona tu ${opts.label.toLowerCase()}. Las opciones son: ${opts.options.join(', ')}.`,
      sanitize: (v) => sanitizeSelectMatch(v, opts.options),
      optional: opts.optional,
      confirmTemplate: (val) => `Seleccionaste ${val}. ¿Es correcto? Di sí o no.`,
    };
  }

  /**
   * Build a yes/no prompt (returns "1" / "0" as captured value).
   *
   * Binary prompts auto-skip the read-back confirmation step — re-confirming
   * a yes/no with another yes/no would be ambiguous for the user.
   */
  yesNo(opts: {
    key: string;
    question: string;
    optional?: boolean;
  }): VoicePrompt {
    // We normalize (lowercase + strip diacritics) before matching, so the
    // regex itself stays ASCII — `\b` word boundaries don't work reliably
    // around accented chars like "í" in "sí".
    const yesRe = /\b(si|sii+|sip|claro|correcto|confirmo|afirmativo|ok|okay|vale|dale|listo|enviar|acepto|yes)\b/;
    const noRe = /\b(no|nop|nope|negativo|incorrecto|para|cancela)\b/;
    return {
      key: opts.key,
      question: opts.question,
      sanitize: (v) => {
        const norm = normalizeText(v);
        if (yesRe.test(norm)) return '1';
        if (noRe.test(norm)) return '0';
        return null;
      },
      optional: opts.optional,
      skipConfirmation: true,
    };
  }

  /**
   * Auto-build a prompt from a Frappe DocField descriptor. Picks the
   * right strategy based on fieldname/fieldtype/options.
   *
   * @param field Frappe DocField (only a subset of properties needed)
   * @param extra optional overrides per fieldname
   */
  fromField(
    field: SimpleField,
    extra: Partial<{ minLength: number; maxLength: number }> = {}
  ): VoicePrompt {
    const label = field.label || field.fieldname;
    const optional = !field.reqd;
    const labelLow = label.toLowerCase();

    // 1. Select with options
    if (field.fieldtype === 'Select' && field.options) {
      const options = (field.options as string)
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean);
      return this.select({ key: field.fieldname, label, options, optional });
    }

    // 2. Email (fieldtype === Email OR options=Email OR label mentions correo)
    const looksLikeEmail =
      field.fieldtype === 'Email' ||
      field.options === 'Email' ||
      /correo|email/.test(labelLow);
    if (looksLikeEmail) {
      return this.email({ key: field.fieldname, label, optional });
    }

    // 3. Document number
    if (field.fieldname === 'document' || /documento|c[eé]dula/.test(labelLow)) {
      return this.digits({
        key: field.fieldname,
        label,
        minLength: extra.minLength ?? 6,
        optional,
      });
    }

    // 4. Phone number
    if (/tel[eé]fono|phone|m[oó]vil|celular/.test(labelLow)) {
      return this.digits({
        key: field.fieldname,
        label,
        minLength: extra.minLength ?? 7,
        allowPlus: true,
        optional,
      });
    }

    // 5. Free text (Data, Small Text, Long Text, Text Editor)
    return this.text({
      key: field.fieldname,
      label,
      question: `¿Cuál es tu ${labelLow}?`,
      optional,
      minLength: extra.minLength,
      maxLength: extra.maxLength,
    });
  }

  /** Truncate a value for inclusion in the spoken confirmation. */
  private shorten(value: string, max: number = 60): string {
    if (!value || value.length <= max) return value;
    return value.substring(0, max) + '…';
  }

  /**
   * Human-readable labels for the guided radicación survey (see
   * `guidedRequestSurvey`), keyed the same way. Shared so every consumer
   * builds the same `user_context` format: "Pregunta: respuesta".
   */
  readonly guidedRequestLabels: Record<string, string> = {
    que_quiere: '¿Qué quieres?',
    como_lo_quiere: '¿Cómo lo quieres?',
    para_que_lo_quiere: '¿Para qué lo quieres?',
    contexto_adicional: 'Contexto adicional',
    cuando_lo_quiere: '¿Cuándo lo quieres?',
  };

  /**
   * Build the 5-question guided survey used across radicación flows
   * (procedures, create-logbook) to gather a citizen's request in a
   * structured way. Pair with `buildGuidedRequestContext` to turn the
   * captured answers into a single `user_context` string.
   */
  guidedRequestSurvey(): VoicePrompt[] {
    return [
      this.text({
        key: 'que_quiere',
        label: 'qué quieres',
        question: '¿Qué quieres?',
        minLength: 2,
      }),
      this.text({
        key: 'como_lo_quiere',
        label: 'cómo lo quieres',
        question: '¿Cómo lo quieres?',
        minLength: 2,
      }),
      this.text({
        key: 'para_que_lo_quiere',
        label: 'para qué lo quieres',
        question: '¿Para qué lo quieres?',
        minLength: 2,
      }),
      this.text({
        key: 'contexto_adicional',
        label: 'contexto adicional',
        question: 'Cuéntanos un poco más o danos contexto de la solicitud.',
        minLength: 2,
      }),
      this.text({
        key: 'cuando_lo_quiere',
        label: 'cuándo lo quieres',
        question: '¿Cuándo lo quieres?',
        minLength: 2,
      }),
    ];
  }

  /**
   * Join the answers of `guidedRequestSurvey` into a single free-text block,
   * one "Pregunta: respuesta" line per answered question (skips anything the
   * user chose not to answer).
   */
  buildGuidedRequestContext(answers: Record<string, string>): string {
    return Object.entries(this.guidedRequestLabels)
      .filter(([key]) => !!answers[key])
      .map(([key, label]) => `${label} ${answers[key]}`)
      .join('\n');
  }
}
