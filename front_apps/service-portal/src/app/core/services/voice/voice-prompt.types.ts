/**
 * Voice Prompt Types
 *
 * Shared interfaces used by the voice assistant and the prompt builder.
 * Lives in `core/services/voice/` so both `shared/components/voice-assistant`
 * and the builder can depend on it without creating a circular import.
 */

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
   * The skip pattern is checked BEFORE the sanitizer runs.
   */
  optional?: boolean;
  /** Minimum length the sanitized value must have to be accepted */
  minLength?: number;
  /** Maximum length (truncates or rejects) */
  maxLength?: number;
  /**
   * If true, the assistant accepts the sanitized value immediately and
   * advances to the next prompt — no read-back confirmation step.
   * Useful for binary yes/no prompts where re-confirming with another
   * "sí/no" would be ambiguous.
   */
  skipConfirmation?: boolean;
}
