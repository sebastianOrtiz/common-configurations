/**
 * Portal Question Survey Service
 *
 * Turns a tool/item's configurable `questions` (Portal Question Set,
 * resolved server-side by `common_configurations.api.questions.resolve_questions`)
 * into a voice survey, and composes the citizen's answers back into the
 * structured `answers` shape the portal's `create_*` endpoints accept
 * (`common_configurations.api.questions.parse_answers`).
 *
 * Shared by every tool that lets an admin replace a free-text context field
 * with a configurable question list — today `procedures` and `pqr`; `lex`
 * (my_cases) will plug into this too once it grows a portal create flow.
 * Centralizing this avoids each tool reimplementing the same
 * sort/build/compose logic. Originally implemented inline in
 * `procedures-tool.component.ts` (see git history there for the pattern
 * this replaces).
 */

import { Injectable, inject } from '@angular/core';
import { VoicePromptBuilder } from './voice-prompt-builder.service';
import { VoicePrompt } from './voice-prompt.types';
import { PortalQuestion, AnsweredQuestion } from '../../models/portal-question.model';

@Injectable({ providedIn: 'root' })
export class PortalQuestionSurveyService {
  private promptBuilder = inject(VoicePromptBuilder);

  /**
   * Build one VoicePrompt per question (ordered by `sort_order`), or `null`
   * when there are no custom questions — callers fall back to their own
   * fixed survey/prompts in that case.
   */
  buildPrompts(questions: PortalQuestion[] | null | undefined): VoicePrompt[] | null {
    if (!questions?.length) return null;

    const orderedFields = this.ordered(questions).map((q) => ({
      fieldname: q.answer_key,
      label: q.question,
      fieldtype: q.fieldtype,
      options: (q.options || []).join('\n'),
      reqd: q.reqd,
    }));

    return this.promptBuilder.surveyFromFields(orderedFields);
  }

  /**
   * Turn the raw voice answers (`fieldname -> value`) into the structured
   * `AnsweredQuestion[]` shape, ordered by `sort_order` and filtered to
   * only the questions that were actually answered.
   */
  composeAnswers(
    questions: PortalQuestion[] | null | undefined,
    answers: Record<string, string>
  ): AnsweredQuestion[] {
    if (!questions?.length) return [];

    return this.ordered(questions)
      .filter((q) => !!answers[q.answer_key])
      .map((q) => ({ answer_key: q.answer_key, question: q.question, answer: answers[q.answer_key] }));
  }

  /**
   * Human-readable "Pregunta respuesta" block, one line per answered
   * question — for fields that still store/display a free-text summary
   * (e.g. so the citizen can review it before radicando).
   */
  composeContextText(answers: AnsweredQuestion[]): string {
    return answers.map((a) => `${a.question} ${a.answer}`).join('\n');
  }

  private ordered(questions: PortalQuestion[]): PortalQuestion[] {
    return questions.slice().sort((a, b) => a.sort_order - b.sort_order);
  }
}
