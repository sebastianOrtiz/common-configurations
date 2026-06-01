/**
 * Voice Sanitizers (Spanish)
 *
 * Pure helper functions that transform raw speech-recognized text into
 * the canonical value for each field type. Used by the voice assistant
 * to clean up user input before storing or validating.
 *
 * Designed to be UI-framework agnostic — these are plain functions and
 * can be imported from any component or service.
 */

/**
 * Lowercase + strip diacritics. Useful for case-insensitive matching of
 * Spanish text that may or may not include accents (e.g. matching the
 * spoken "cédula" against the stored option "Cedula").
 */
export function normalizeText(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Convert Spanish number words to digits and strip everything non-digit.
 * Handles: cero..nueve, diez..diecinueve, veinte..veintinueve, treinta..noventa.
 * Useful for cédula/document numbers dictated by voice.
 *
 * @param input raw speech text
 * @param allowPlus if true, keep '+' (for phone numbers with country code)
 * @returns digits-only string, or null if nothing remains
 */
export function sanitizeDigits(input: string, allowPlus: boolean = false): string | null {
  if (!input) return null;

  let text = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  // Words → digits (order matters: longest first to avoid partial matches)
  const replacements: Array<[RegExp, string]> = [
    // 16-19
    [/\bdiecis[eé]is\b/g, '16'],
    [/\bdiecisiete\b/g, '17'],
    [/\bdieciocho\b/g, '18'],
    [/\bdiecinueve\b/g, '19'],
    // 21-29
    [/\bveintiun[oa]?\b/g, '21'],
    [/\bveintid[oó]s\b/g, '22'],
    [/\bveintitr[eé]s\b/g, '23'],
    [/\bveinticuatro\b/g, '24'],
    [/\bveinticinco\b/g, '25'],
    [/\bveintis[eé]is\b/g, '26'],
    [/\bveintisiete\b/g, '27'],
    [/\bveintiocho\b/g, '28'],
    [/\bveintinueve\b/g, '29'],
    // Tens 20-90
    [/\bveinte\b/g, '20'],
    [/\btreinta\b/g, '30'],
    [/\bcuarenta\b/g, '40'],
    [/\bcincuenta\b/g, '50'],
    [/\bsesenta\b/g, '60'],
    [/\bsetenta\b/g, '70'],
    [/\bochenta\b/g, '80'],
    [/\bnoventa\b/g, '90'],
    // 10-15
    [/\bdiez\b/g, '10'],
    [/\bonce\b/g, '11'],
    [/\bdoce\b/g, '12'],
    [/\btrece\b/g, '13'],
    [/\bcatorce\b/g, '14'],
    [/\bquince\b/g, '15'],
    // 0-9
    [/\bcero\b/g, '0'],
    [/\bun[oa]?\b/g, '1'],
    [/\bdos\b/g, '2'],
    [/\btres\b/g, '3'],
    [/\bcuatro\b/g, '4'],
    [/\bcinco\b/g, '5'],
    [/\bseis\b/g, '6'],
    [/\bsiete\b/g, '7'],
    [/\bocho\b/g, '8'],
    [/\bnueve\b/g, '9'],
    // Connectors / fillers
    [/\b(y|guion|guion bajo|menos)\b/g, ''],
    [/\bm[aá]s\b/g, '+'],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  const cleaned = allowPlus
    ? text.replace(/[^0-9+]/g, '')
    : text.replace(/[^0-9]/g, '');

  return cleaned || null;
}

/**
 * Sanitize a dictated email:
 * - Lowercase
 * - Strip diacritics ("andrés" → "andres")
 * - Convert spoken symbols: arroba/at → @, punto/dot → ., guion/guion bajo → -/_
 * - Remove all whitespace
 */
export function sanitizeEmail(input: string): string | null {
  if (!input) return null;

  let text = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const symbols: Array<[RegExp, string]> = [
    [/\barroba\b/g, '@'],
    [/\b(at|en)\b/g, '@'],
    [/\bpunto\b/g, '.'],
    [/\bdot\b/g, '.'],
    [/\bguion bajo\b/g, '_'],
    [/\bguion abajo\b/g, '_'],
    [/\bunderscore\b/g, '_'],
    [/\bguion\b/g, '-'],
    [/\bmenos\b/g, '-'],
    [/\bm[aá]s\b/g, '+'],
    [/\bmas\b/g, '+'],
  ];

  for (const [pattern, replacement] of symbols) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\s+/g, '');
  return text || null;
}

/**
 * Match a spoken value against a list of Select options, ignoring case
 * and diacritics. Returns the original option string (preserving the
 * canonical form stored in the DocType) or null if no match.
 *
 * @param spoken raw voice text
 * @param options list of valid Select options (lines from the DocType)
 */
export function sanitizeSelectMatch(
  spoken: string,
  options: string[]
): string | null {
  const target = normalizeText(spoken);
  if (!target) return null;

  // Exact match (case-insensitive, accent-insensitive)
  const exact = options.find((o) => normalizeText(o) === target);
  if (exact) return exact;

  // Partial match (either contains the other)
  const partial = options.find((o) => {
    const oNorm = normalizeText(o);
    return oNorm.includes(target) || target.includes(oNorm);
  });
  return partial || null;
}

/**
 * Simple text sanitizer for free-text fields. Trims, collapses multiple
 * spaces, and ensures the result has at least `minLength` characters.
 */
export function sanitizeText(input: string, minLength: number = 0): string | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (minLength && cleaned.length < minLength) return null;
  return cleaned;
}
