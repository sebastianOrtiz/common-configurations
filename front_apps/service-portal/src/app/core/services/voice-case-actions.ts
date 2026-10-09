/**
 * Helper to build page-scoped voice actions that open a case from a list
 * ("Mis trámites", "Mis PQRs"): one action per case (by title / radicado number)
 * plus recency ordinals ("el último", "el más nuevo", "el primero"...).
 */
import { VoiceAction } from './assistant-context.service';

export interface CaseVoiceConfig<T> {
  /** Prefix for action ids, e.g. 'my-logbook'. */
  idPrefix: string;
  /** Singular noun used in descriptions, e.g. 'trámite'. */
  noun: string;
  items: T[];
  numberOf: (item: T) => string;
  titleOf: (item: T) => string;
  /** Sortable date (ISO string); the most recent case is the one with the max date. */
  dateOf: (item: T) => string | undefined;
  /** Opens the case detail (same method the card click uses). */
  open: (item: T) => unknown;
  /** Short spoken feedback, announced by the assistant on its next turn. */
  announce: (message: string) => void;
}

const normalize = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const time = (d: string | undefined): number => {
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

export function buildCaseVoiceActions<T>(cfg: CaseVoiceConfig<T>): VoiceAction[] {
  if (!cfg.items.length) return [];

  // Newest first (stable for equal/missing dates).
  const sorted = [...cfg.items].sort((a, b) => time(cfg.dateOf(b)) - time(cfg.dateOf(a)));
  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];

  const openAndSay = (item: T): void => {
    const title = cfg.titleOf(item);
    cfg.announce(`Te muestro ${title ? `"${title}"` : `el ${cfg.noun} ${cfg.numberOf(item)}`}.`);
    cfg.open(item);
  };

  const actions: VoiceAction[] = [
    {
      id: `${cfg.idPrefix}.latest`,
      description: `Abrir el ${cfg.noun} más reciente`,
      samplePhrases: [
        'el ultimo',
        'el mas nuevo',
        'el mas reciente',
        'el reciente',
        'el ultimo que hice',
        `el ultimo ${cfg.noun}`,
        `el ${normalize(cfg.noun)} mas reciente`,
      ],
      run: () => openAndSay(newest),
    },
    {
      id: `${cfg.idPrefix}.oldest`,
      description: `Abrir el ${cfg.noun} más antiguo`,
      samplePhrases: [
        'el primero',
        'el mas viejo',
        'el mas antiguo',
        `el primer ${cfg.noun}`,
        `el ${normalize(cfg.noun)} mas antiguo`,
      ],
      run: () => openAndSay(oldest),
    },
  ];

  for (const item of sorted) {
    const number = cfg.numberOf(item);
    const title = cfg.titleOf(item);
    const phrases = new Set<string>();
    if (title) phrases.add(title);
    if (number) {
      phrases.add(number);
      phrases.add(number.replace(/-/g, ' '));
      phrases.add(`el ${cfg.noun} ${number}`);
    }
    actions.push({
      id: `${cfg.idPrefix}.item.${number}`,
      description: `Abrir el ${cfg.noun} ${number}${title ? ` (${title})` : ''}`,
      samplePhrases: [...phrases],
      run: () => openAndSay(item),
    });
  }

  return actions;
}
