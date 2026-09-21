/**
 * Portal Question Models
 *
 * Shared shapes for the "configurable questions" model that lets a Service
 * Portal tool (procedures, PQR, lex/my_cases, ...) replace a single
 * free-text context field with an admin-defined list of questions.
 *
 * Mirrors the backend contract exactly:
 * `common_configurations.api.questions` (`resolve_questions` / `parse_answers`).
 */

/**
 * A single custom question configured by the admin for a tool (tool-level
 * `question_set`) or overridden per item (e.g. a PQR Type's own
 * `question_set`). Resolved server-side, ready to render a dynamic form.
 */
export interface PortalQuestion {
  answer_key: string;
  question: string;
  fieldtype: 'Data' | 'Small Text' | 'Select' | 'Int' | 'Email' | string;
  options: string[];
  reqd: 0 | 1;
  sort_order: number;
}

/**
 * One answered custom question, in the shape the portal's `create_*`
 * endpoints expect for their optional `answers` param (JSON string of
 * these, parsed server-side by `common_configurations.api.questions.parse_answers`).
 */
export interface AnsweredQuestion {
  answer_key: string;
  question: string;
  answer: string;
}
