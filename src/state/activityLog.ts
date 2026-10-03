import { create } from 'zustand';
import { useGameStore } from './useGameStore';
import catalog from '../i18n/activityMessages.json';

/**
 * Session activity log shown in the bottom-corner tray. Not persisted —
 * it narrates what happens while the player is watching. All wording lives
 * in src/i18n/activityMessages.json.
 */

export type ActivityCategory = 'combat' | 'economy' | 'minions' | 'world';
export type ActivityTone = 'good' | 'bad' | 'neutral' | 'epic';
export type Localized = string | { en: string; tl: string };
export type MessageKey = keyof typeof catalog.messages;
type Vars = Record<string, string | number | { en: string; tl: string }>;

export interface ActivityEntry {
  id: number;
  category: ActivityCategory;
  tone: ActivityTone;
  icon: string;
  text: string;
  /** In-game day and clock when the entry was (last) updated. */
  day: number;
  clock: string;
  timestamp: number;
  /** How many events were folded into this entry. */
  count: number;
  mergeKey: string;
  amount?: number;
}

export interface ActivityInput {
  category: ActivityCategory;
  icon: string;
  text: Localized;
  tone?: ActivityTone;
  /**
   * Events sharing a mergeKey within MERGE_WINDOW_MS fold into one entry.
   * With `amount` + `format`, amounts are summed (e.g. "+42 Wood delivered").
   */
  mergeKey?: string;
  amount?: number;
  format?: (total: number) => Localized;
}

const MAX_ENTRIES = 100;
const MERGE_WINDOW_MS = 8000;
/** How many recent entries are searched for a mergeable twin. */
const MERGE_LOOKBACK = 12;

interface ActivityLogState {
  entries: ActivityEntry[];
  unread: number;
  add: (input: ActivityInput) => void;
  markRead: () => void;
  clear: () => void;
}

let nextId = 1;

const isTagalog = () => useGameStore.getState().language === 'TL';

/** Picks the player's language from a localized string. */
export const localize = (text: Localized): string => {
  if (typeof text === 'string') return text;
  return isTagalog() ? text.tl : text.en;
};

const fill = (template: string, vars: Vars, lang: 'en' | 'tl' = 'en'): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in vars)) return match;
    const value = vars[name];
    return typeof value === 'object' ? value[lang] : String(value);
  });

const gameClock = (): { day: number; clock: string } => {
  const { day, dayProgress } = useGameStore.getState();
  const minutes = Math.floor((dayProgress ?? 0) * 24 * 60);
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return { day, clock: `${hh}:${mm}` };
};

export const useActivityLog = create<ActivityLogState>((set, get) => ({
  entries: [],
  unread: 0,

  add: (input) => {
    const now = Date.now();
    const { day, clock } = gameClock();
    const entries = get().entries;
    const mergeKey = input.mergeKey ?? `txt:${localize(input.text)}`;

    // Fold into a recent entry of the same kind (moved back to the top) instead of spamming
    const twinIndex = entries
      .slice(0, MERGE_LOOKBACK)
      .findIndex((e) => e.mergeKey === mergeKey && now - e.timestamp < MERGE_WINDOW_MS);
    if (twinIndex >= 0) {
      const twin = entries[twinIndex];
      const amount = (twin.amount ?? 0) + (input.amount ?? 0);
      const merged: ActivityEntry = {
        ...twin,
        count: twin.count + 1,
        amount,
        text: input.format ? localize(input.format(amount)) : twin.text,
        day,
        clock,
        timestamp: now,
      };
      set({ entries: [merged, ...entries.filter((_, i) => i !== twinIndex)] });
      return;
    }

    const entry: ActivityEntry = {
      id: nextId++,
      category: input.category,
      tone: input.tone ?? 'neutral',
      icon: input.icon,
      text: localize(input.format && input.amount !== undefined ? input.format(input.amount) : input.text),
      day,
      clock,
      timestamp: now,
      count: 1,
      mergeKey,
      amount: input.amount,
    };
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
      unread: state.unread + 1,
    }));
  },

  markRead: () => set({ unread: 0 }),
  clear: () => set({ entries: [], unread: 0 }),
}));

/** Adds a free-form entry to the activity tray (safe to call from Phaser code). */
export const logActivity = (input: ActivityInput): void => useActivityLog.getState().add(input);

/**
 * Logs a catalog message. `{placeholders}` are filled from `vars`; when an
 * `amount` is given, repeats within the merge window are summed into `{total}`.
 */
export function logMessage(
  key: MessageKey,
  vars: Vars = {},
  options: { mergeKey?: string; amount?: number; icon?: string } = {}
): void {
  const msg = catalog.messages[key];
  const format = (total: number): Localized => ({
    en: fill(msg.en, { ...vars, total }, 'en'),
    tl: fill(msg.tl, { ...vars, total }, 'tl'),
  });
  logActivity({
    category: msg.category as ActivityCategory,
    tone: msg.tone as ActivityTone,
    icon: options.icon ?? msg.icon,
    text: format(options.amount ?? 0),
    mergeKey: options.mergeKey,
    amount: options.amount,
    format: options.amount !== undefined ? format : undefined,
  });
}

/** Logs the catalog line for a weather change. */
export function logWeather(weather: string): void {
  const w = (catalog.weather as Record<string, { icon: string; en: string; tl: string }>)[weather];
  if (w) logActivity({ category: 'world', icon: w.icon, text: { en: w.en, tl: w.tl } });
}

// ── Floating-text classifier ─────────────────────────────────────────────────

const rules = catalog.classifier;
const CATEGORY_PATTERNS: Array<[ActivityCategory, RegExp]> = [
  ['combat', new RegExp(rules.combat, 'i')],
  ['economy', new RegExp(rules.economy, 'iu')],
  ['minions', new RegExp(rules.minions, 'i')],
];
const SKIP_PATTERN = new RegExp(rules.skip, 'i');
const BAD_COLORS = new Set(rules.badColors);
const EPIC_COLORS = new Set(rules.epicColors);
const RESOURCE_NAMES = catalog.resourceNames as Record<string, { en: string; tl: string }>;
const PHRASES = catalog.phrases.map(([en, tl]) => [new RegExp(`^${en}$`, 'iu'), tl] as const);

/** A resource label from a popup ("Wood", "Kristal", …) or a resource key ("aetherShards") in both languages. */
export const resourceName = (label: string): { en: string; tl: string } =>
  RESOURCE_NAMES[label.toLowerCase()] ?? { en: label, tl: label };

/** Tagalog for a free-form popup line, via the phrase table (falls back to the English). */
const tagalogPhrase = (text: string): string => {
  for (const [re, tl] of PHRASES) {
    const m = text.match(re);
    if (m) return tl.replace(/\$(\d)/g, (_, i: string) => {
      const part = m[+i] ?? '';
      return RESOURCE_NAMES[part.toLowerCase()]?.tl ?? part;
    });
  }
  return text;
};

const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s*/u;
const TRAILING_EMOJI = /\s*\p{Extended_Pictographic}️?$/u;

/**
 * Routes a former over-the-head floating text into the activity log.
 * Numeric texts (deliveries, damage, heals, bounties, loot) are summed into
 * running entries so a busy battle stays readable.
 */
export function logFloatingText(raw: string, color: string, subject?: string): void {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || SKIP_PATTERN.test(text)) return; // summons are logged from the roster
  const name = subject ?? localize(rules.unknownUnit);
  let m: RegExpMatchArray | null;

  if ((m = text.match(/^\+(\d+) (.+?) Delivered$/i))) {
    logMessage('delivered', { resource: resourceName(m[2]) }, { mergeKey: `deliver:${m[2]}`, amount: +m[1] });
  } else if ((m = text.match(/^-(\d+) Castle HP/i))) {
    logMessage('castleDamage', {}, { mergeKey: 'castle-dmg', amount: +m[1] });
  } else if ((m = text.match(/^-(\d+) HP/i))) {
    logMessage('unitHurt', { name }, { mergeKey: `hurt:${name}`, amount: +m[1] });
  } else if ((m = text.match(/^\+(\d+) HP$/i))) {
    logMessage('healed', {}, { mergeKey: 'heal', amount: +m[1] });
  } else if ((m = text.match(/^\+(\d+) (Fatigue|Stamina)$/i))) {
    logMessage('stamina', {}, { mergeKey: 'stamina', amount: +m[1] });
  } else if ((m = text.match(/^\+(\d+) 🪙$/u))) {
    logMessage('bounty', {}, { mergeKey: 'bounty', amount: +m[1] });
  } else if ((m = text.match(/^\+(\d+) (\p{Extended_Pictographic}️?) (.+)$/u))) {
    logMessage('looted', { resource: resourceName(m[3]) }, { mergeKey: `loot:${m[3]}`, amount: +m[1], icon: m[2] });
  } else if ((m = text.match(/^\+(\d+) (\p{L}[\p{L}\w ]*)$/u))) {
    logMessage('gathered', { resource: resourceName(m[2]) }, { mergeKey: `gather:${m[2]}`, amount: +m[1] });
  } else {
    const emoji = text.match(LEADING_EMOJI);
    const body = text.replace(LEADING_EMOJI, '').replace(TRAILING_EMOJI, '').trim();
    const category = CATEGORY_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? 'world';
    logActivity({
      category,
      tone: BAD_COLORS.has(color) ? 'bad' : EPIC_COLORS.has(color) ? 'epic' : 'good',
      icon: emoji?.[1] ?? catalog.categoryIcons[category],
      text: subject
        ? { en: `${subject}: ${body}`, tl: `${subject}: ${tagalogPhrase(body)}` }
        : { en: body, tl: tagalogPhrase(body) },
    });
  }
}

/**
 * Name of the unit a popup was anchored to. Popups used to float 25–60px above
 * the feet, so the search looks just below the anchor.
 */
export function nearestName(
  units: ReadonlyArray<{ name: string; container: { x: number; y: number; active: boolean } }>,
  x: number,
  y: number
): string | undefined {
  let best: string | undefined;
  let bestDist = 48;
  for (const unit of units) {
    if (!unit.container?.active) continue;
    const dist = Math.hypot(unit.container.x - x, unit.container.y - (y + 40));
    if (dist < bestDist) {
      bestDist = dist;
      best = unit.name;
    }
  }
  return best;
}

/** UI strings for the tray. */
export const activityUi = catalog.ui;
