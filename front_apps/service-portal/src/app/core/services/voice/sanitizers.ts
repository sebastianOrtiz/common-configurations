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
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Hyphens/underscores/basic punctuation become spaces (not dropped), so
    // "manzanares-aguabonita" and "manzanares aguabonita" normalize to the
    // same token stream — matters for STT output vs. DocType option values
    // written with separators (e.g. veredas like "Manzanares-Aguabonita").
    .replace(/[-_/.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

/** Words too short to be meaningful for token-overlap scoring (articles, prepositions...). */
const SELECT_MATCH_MIN_TOKEN_LENGTH = 3;

/**
 * Classic Levenshtein edit distance between two strings — the "simple
 * distance" used to tolerate a single mis-heard letter in a token
 * (e.g. STT hearing "aguabonita" as "aguavonita").
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[b.length];
}

/** True when two tokens are equal, or close enough to be the same mis-heard word. */
function tokensAreClose(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < SELECT_MATCH_MIN_TOKEN_LENGTH || b.length < SELECT_MATCH_MIN_TOKEN_LENGTH) {
    return false;
  }
  const maxDistance = Math.min(a.length, b.length) >= 6 ? 2 : 1;
  return levenshtein(a, b) <= maxDistance;
}

/**
 * Score how well a spoken (normalized) phrase matches a normalized option by
 * shared/close tokens. Returns a 0..1 score: the fraction of the spoken
 * phrase's meaningful tokens that found a match among the option's tokens.
 */
function tokenOverlapScore(targetNorm: string, optionNorm: string): number {
  const targetTokens = targetNorm.split(' ').filter((t) => t.length >= SELECT_MATCH_MIN_TOKEN_LENGTH);
  if (!targetTokens.length) return 0;
  const optionTokens = optionNorm.split(' ').filter((t) => t.length >= SELECT_MATCH_MIN_TOKEN_LENGTH);
  if (!optionTokens.length) return 0;

  let matched = 0;
  for (const t of targetTokens) {
    if (optionTokens.some((o) => tokensAreClose(t, o))) matched++;
  }
  return matched / targetTokens.length;
}

/** Minimum token-overlap score for `sanitizeSelectMatch`'s fuzzy fallback to accept a match. */
const SELECT_MATCH_ACCEPT_THRESHOLD = 0.6;

/**
 * Match a spoken value against a list of Select options, ignoring case,
 * diacritics and punctuation/separators. Returns the original option string
 * (preserving the canonical form stored in the DocType) or null if no match.
 *
 * Three layers, in order: exact match, substring containment (either way),
 * then a fuzzy token-overlap + edit-distance match — this last layer is what
 * lets "manzanares aguabonita" match the option "Manzanares-Aguabonita" (now
 * mostly handled upstream by `normalizeText`) and tolerates a mis-heard
 * syllable in a multi-word option (e.g. veredas, barrios).
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

  // Exact match (case-insensitive, accent/punctuation-insensitive)
  const exact = options.find((o) => normalizeText(o) === target);
  if (exact) return exact;

  // Partial match (either contains the other)
  const partial = options.find((o) => {
    const oNorm = normalizeText(o);
    return oNorm.includes(target) || target.includes(oNorm);
  });
  if (partial) return partial;

  // Fuzzy fallback: best token-overlap score, accepted only above threshold
  // and only when it's a clear winner (no ambiguity with a close runner-up).
  const ranked = rankSelectMatches(target, options);
  if (!ranked.length) return null;
  const [best, second] = ranked;
  if (best.score >= SELECT_MATCH_ACCEPT_THRESHOLD && (!second || best.score > second.score)) {
    return best.option;
  }
  return null;
}

/**
 * Rank every option by token-overlap score against an ALREADY normalized
 * spoken phrase, descending. Internal helper shared by `sanitizeSelectMatch`
 * (fuzzy fallback) and `suggestSelectMatches` (candidate suggestions).
 */
function rankSelectMatches(
  normalizedTarget: string,
  options: string[]
): Array<{ option: string; score: number }> {
  return options
    .map((option) => ({ option, score: tokenOverlapScore(normalizedTarget, normalizeText(option)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Best candidate options for a spoken value that `sanitizeSelectMatch`
 * couldn't confidently resolve — used to offer "¿Quisiste decir X o Y?"
 * instead of just saying "no reconocí" again. Ranked by token-overlap score;
 * does not require the acceptance threshold `sanitizeSelectMatch` uses, so
 * it can surface weaker guesses too.
 *
 * @param spoken raw voice text
 * @param options list of valid Select options
 * @param topN maximum number of suggestions to return (default 2)
 */
export function suggestSelectMatches(
  spoken: string,
  options: string[],
  topN: number = 2
): string[] {
  const target = normalizeText(spoken);
  if (!target) return [];
  return rankSelectMatches(target, options)
    .slice(0, topN)
    .map((r) => r.option);
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
