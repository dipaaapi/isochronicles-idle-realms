import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ScrollText, Trash2 } from 'lucide-react';
import { useGameStore } from '../state/useGameStore';
import { ActivityCategory, ActivityTone, activityUi, logMessage, useActivityLog } from '../state/activityLog';
import { RESOURCE_PRICES, type TradeableResource } from '../state/economy';
import { isConstructionReady } from '../state/constructionProgress';
import { soundFx } from '../game/audio/soundFx';
import type { GameSpeed, WeatherType } from '../types/state';

type Filter = 'all' | ActivityCategory;
type CommandGuideKey = 'commandPick' | 'commandPickResource' | 'commandPickAmount' | 'commandReady';
type CommandOptionKey = keyof typeof activityUi.commandOptions;
interface CommandSuggestion {
  value: string;
  label: string;
  detail: string;
}

const FILTERS: Filter[] = ['all', 'combat', 'economy', 'minions', 'world'];
const COMMAND_CHOICES: Array<{ value: string; label: CommandOptionKey }> = [
  { value: '@brawl', label: 'brawl' },
  { value: '@wave_battle', label: 'wave' },
  { value: '@kirov_battle', label: 'kirov' },
  { value: '@sell', label: 'sell' },
  { value: '@buy', label: 'buy' },
  { value: '@weather', label: 'weather' },
  { value: '@day', label: 'day' },
  { value: '@set', label: 'set' },
  { value: '@help', label: 'help' },
];
const OPEN_KEY = 'isochronicle.activityTrayOpen';

const TONE_STYLES: Record<ActivityTone, { border: string; text: string }> = {
  good: { border: 'border-l-emerald-400', text: 'text-emerald-100' },
  bad: { border: 'border-l-rose-500', text: 'text-rose-100' },
  epic: { border: 'border-l-amber-400', text: 'text-amber-100' },
  neutral: { border: 'border-l-slate-500', text: 'text-slate-200' },
};

const readOpen = (): boolean => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

const normalizeCommandToken = (value: string): string => value.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ');

const resolveTradeResource = (value: string): TradeableResource | undefined => {
  const token = normalizeCommandToken(value).replace(/\s+/g, '');
  if (!token) return undefined;
  // Plurals work too: "stones", "fishes"
  const candidates = [token, token.replace(/es$/, ''), token.replace(/s$/, '')];
  return (Object.keys(RESOURCE_PRICES) as TradeableResource[]).find((key) => {
    const price = RESOURCE_PRICES[key];
    const names = [key, price.label, price.labelEn].filter(Boolean).map((name) => normalizeCommandToken(name!).replace(/\s+/g, ''));
    return candidates.some((c) => names.includes(c));
  });
};

/**
 * While the command input has focus in fullscreen, capture Esc (Keyboard Lock,
 * Chromium/Electron) so it only leaves the input; holding Esc still exits fullscreen.
 */
const lockEscape = (on: boolean): void => {
  const keyboard = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  if (!keyboard?.lock) return;
  if (on && document.fullscreenElement) keyboard.lock(['Escape']).catch(() => undefined);
  else if (!on) keyboard.unlock?.();
};

const AMOUNT_TOKEN = /^(all|max|half|\d+)$/i;

interface TradeOrder { verb: 'buy' | 'sell'; resource: TradeableResource; amount: string }

/**
 * Parses "fish all, stones 500, buy wood 300" into orders. Each comma part is
 * "[buy|sell] resource amount" (amount may also come first: "500 stones");
 * the verb carries over from the previous part.
 */
const parseTradeOrders = (verb: 'buy' | 'sell', text: string): TradeOrder[] | string => {
  const orders: TradeOrder[] = [];
  let current = verb;
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const tokens = part.split(/\s+/);
    const head = tokens[0].toLocaleLowerCase().replace(/^@/, '');
    if (head === 'buy' || head === 'sell') { current = head; tokens.shift(); }
    let amount = 'all';
    if (tokens.length > 1 && AMOUNT_TOKEN.test(tokens[tokens.length - 1])) amount = tokens.pop()!;
    else if (tokens.length > 1 && AMOUNT_TOKEN.test(tokens[0])) amount = tokens.shift()!;
    else if (current === 'buy') amount = 'max';
    const resource = resolveTradeResource(tokens.join(' '));
    if (!resource) return `Unknown resource "${tokens.join(' ')}". Try @sell fish all, stone 500, wood 300.`;
    orders.push({ verb: current, resource, amount: amount.toLocaleLowerCase() });
  }
  return orders.length ? orders : 'Use @buy wood 20 or @sell fish all, stone 500, wood 300.';
};

/** Repeat cap for wave and day commands, so they can't be spammed. */
const MAX_REPEAT = 10;
const WEATHERS: WeatherType[] = ['CLEAR', 'RAIN', 'SNOW', 'HEATWAVE'];

const parseCount = (value?: string): number | null => {
  if (value === undefined || value === '') return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_REPEAT ? n : null;
};

// Waves queued by "@wave_battle N": each starts once the previous one ends
let queuedWaves = 0;
let unwatchWaves: (() => void) | null = null;
const watchWaveQueue = (): void => {
  if (unwatchWaves || queuedWaves <= 0) return;
  unwatchWaves = useGameStore.subscribe((s, prev) => {
    if (!prev.invasion.isActive || s.invasion.isActive) return;
    if (queuedWaves > 0 && isConstructionReady(s)) {
      queuedWaves--;
      setTimeout(() => { if (!useGameStore.getState().invasion.isActive) useGameStore.getState().startInvasion(); }, 0);
    }
    if (queuedWaves <= 0) { unwatchWaves?.(); unwatchWaves = null; }
  });
};

/** on / off / toggle → wanted value; null when the word is not one of them. */
const parseSwitch = (value: string, current: boolean): boolean | null => {
  if (['on', 'true', '1', 'yes', 'enable'].includes(value)) return true;
  if (['off', 'false', '0', 'no', 'disable'].includes(value)) return false;
  if (value === 'toggle') return !current;
  return null;
};

const switchSetting = (read: (s: ReturnType<typeof useGameStore.getState>) => boolean, apply: (s: ReturnType<typeof useGameStore.getState>, on: boolean) => void) =>
  (value: string): string | undefined => {
    const s = useGameStore.getState();
    const want = parseSwitch(value, read(s));
    if (want === null) return 'Use on, off or toggle.';
    if (want !== read(s)) apply(s, want);
    return undefined;
  };

/** Settings reachable from the command line: "@gore off", "@fps 60", "@set speed 2". Returns an error or undefined. */
const SETTING_COMMANDS: Record<string, (value: string) => string | undefined> = {
  gore: switchSetting((s) => s.isGoreEnabled, (s) => s.toggleGore()),
  mute: switchSetting((s) => s.isAudioMuted, (s) => s.toggleAudioMute()),
  sound: switchSetting((s) => !s.isAudioMuted, (s) => s.toggleAudioMute()),
  wallpaper: switchSetting((s) => s.showWallpaper, (s) => s.toggleWallpaper()),
  fps_debug: switchSetting((s) => s.showFpsDebug, (s) => s.toggleFpsDebug()),
  coords: switchSetting((s) => s.showTileCoordinates, (s) => s.toggleTileCoordinates()),
  random_weather: switchSetting((s) => s.randomWeatherEnabled !== false, (s, on) => s.setRandomWeatherEnabled(on)),
  autoplay: switchSetting((s) => s.musicAutoPlay, (s, on) => s.setMusicAutoPlay(on)),
  loop: switchSetting((s) => s.musicLoop, (s, on) => s.setMusicLoop(on)),
  ...Object.fromEntries((['autoDispatch', 'autoRest', 'autoDefend', 'autoSell', 'autoBuy', 'autoUpgrade', 'autoTap', 'autoEvolve', 'autoSurvivalSkills'] as const).map((key) => [
    key.replace(/^auto/, 'auto_').toLocaleLowerCase(),
    switchSetting((s) => !!s.autoSettings[key], (s) => s.toggleAutoSetting(key)),
  ])),
  fps: (value) => {
    const fps = Number(value);
    if (fps !== 30 && fps !== 60 && fps !== 90) return 'FPS: 30, 60 or 90.';
    useGameStore.getState().setTargetFps(fps);
    return undefined;
  },
  speed: (value) => {
    const speed = value === 'pause' ? 0 : Number(value.replace(/x$/, ''));
    if (![0, 1, 2, 3].includes(speed)) return 'Speed: 0 (pause), 1, 2 or 3.';
    useGameStore.getState().setGameSpeed(speed as GameSpeed);
    return undefined;
  },
  pause: () => { useGameStore.getState().setGameSpeed(0); return undefined; },
  resume: () => { useGameStore.getState().setGameSpeed(1); return undefined; },
  language: (value) => {
    const lang = value.toUpperCase();
    if (lang !== 'EN' && lang !== 'TL') return 'Language: en or tl.';
    useGameStore.getState().setLanguage(lang);
    return undefined;
  },
};

const recordCommandResult = (command: string, success: boolean, reason?: string): void => {
  if (success) logMessage('commandSucceeded', { command });
  else logMessage('commandFailed', { reason: reason ?? command });
};

const executeCommand = (rawCommand: string): { handled: boolean; success: boolean; reason?: string } => {
  const command = rawCommand.trim().replace(/^@/, '');
  const [verbRaw, ...args] = command.split(/\s+/);
  const verb = normalizeCommandToken(verbRaw ?? '').replace(/\s/g, '_');
  const state = useGameStore.getState();

  if (verb === 'help') return { handled: true, success: true };

  if (verb === 'kirov_battle' || verb === 'random_battle') {
    if (!isConstructionReady(state)) return { handled: true, success: false, reason: 'Build the castle before starting a battle.' };
    let ok: boolean | undefined;
    window.dispatchEvent(new CustomEvent('isochronicle:activity-command', { detail: { command: 'kirovBattle', respond: (r: boolean) => { ok = r; } } }));
    if (ok === undefined) return { handled: true, success: false, reason: 'The game scene is not ready.' };
    return { handled: true, success: ok, reason: ok ? undefined : 'A Kirov Invasion Battle can only start between waves.' };
  }

  if (verb === 'wave_battle') {
    if (!isConstructionReady(state)) return { handled: true, success: false, reason: 'Build the castle before starting a battle.' };
    const count = parseCount(args[0]);
    if (count === null) return { handled: true, success: false, reason: `Waves: a whole number from 1 to ${MAX_REPEAT}.` };
    // The first wave starts now (or after the current one); the rest follow one after another
    if (state.invasion.isActive) queuedWaves = Math.min(MAX_REPEAT, queuedWaves + count);
    else { state.startInvasion(); queuedWaves = Math.min(MAX_REPEAT, queuedWaves + count - 1); }
    watchWaveQueue();
    return { handled: true, success: true };
  }

  if (verb === 'day' || verb === 'days' || verb === 'next_day') {
    const count = parseCount(args[0]?.replace(/^\+/, ''));
    if (count === null) return { handled: true, success: false, reason: `Days: a whole number from 1 to ${MAX_REPEAT}.` };
    for (let i = 0; i < count; i++) useGameStore.getState().incrementDay();
    return { handled: true, success: true };
  }

  if (verb === 'weather') {
    const weather = (args[0] ?? '').toUpperCase().replace(/^HEAT(_?WAVE)?$|^HOT$/, 'HEATWAVE').replace(/^SUN(NY)?$/, 'CLEAR');
    if (weather === 'RANDOM') { state.setRandomWeatherEnabled(true); return { handled: true, success: true }; }
    if (!WEATHERS.includes(weather as WeatherType)) return { handled: true, success: false, reason: `Weather: ${WEATHERS.join(', ').toLowerCase()} or random.` };
    state.setWeather(weather as WeatherType);
    return { handled: true, success: true };
  }

  const settingVerb = verb === 'set' ? normalizeCommandToken(args.shift() ?? '').replace(/\s/g, '_') : verb;
  const setting = SETTING_COMMANDS[settingVerb];
  if (setting) {
    const error = setting(args[0]?.toLocaleLowerCase() ?? 'toggle');
    return error ? { handled: true, success: false, reason: error } : { handled: true, success: true };
  }

  if (verb === 'brawl') {
    let result: boolean | undefined;
    window.dispatchEvent(new CustomEvent('isochronicle:activity-command', {
      detail: { command: 'brawl', respond: (success: boolean) => { result = success; } },
    }));
    if (result === undefined) return { handled: true, success: false, reason: 'The game scene is not ready.' };
    return { handled: true, success: result, reason: result ? undefined : 'A brawl needs two living Generals and no active wave.' };
  }

  if (verb === 'buy' || verb === 'sell') {
    const orders = parseTradeOrders(verb, args.join(' '));
    if (typeof orders === 'string') return { handled: true, success: false, reason: orders };
    for (const order of orders) {
      // Re-read each time: earlier orders change coins and stock
      const now = useGameStore.getState();
      const full = order.verb === 'sell'
        ? Math.floor(now.resources[order.resource] ?? 0)
        : Math.floor(now.resources.coins / RESOURCE_PRICES[order.resource].buy);
      const amount = order.amount === 'all' || order.amount === 'max' ? full
        : order.amount === 'half' ? Math.floor(full / 2)
        : Number(order.amount);
      if (!Number.isSafeInteger(amount) || amount <= 0) return { handled: true, success: false, reason: `Nothing to ${order.verb} for ${order.resource}.` };
      const success = order.verb === 'buy' ? now.buyResource(order.resource, amount) : now.sellResource(order.resource, amount);
      if (!success) return { handled: true, success: false, reason: `Could not ${order.verb} ${amount} ${order.resource}; check your coins or stock.` };
    }
    return { handled: true, success: true };
  }

  return { handled: false, success: false, reason: `Unknown command: @${command}` };
};

/**
 * Collapsible activity log in the bottom-left corner of the game canvas.
 * Everything that used to float as text over units and buildings is narrated
 * here instead. Collapsed, it shows the latest event as a one-line ticker.
 */
export const ActivityLogTray: React.FC = () => {
  const entries = useActivityLog((s) => s.entries);
  const unread = useActivityLog((s) => s.unread);
  const markRead = useActivityLog((s) => s.markRead);
  const clear = useActivityLog((s) => s.clear);
  const language = useGameStore((s) => s.language);
  const [open, setOpen] = useState(readOpen);
  const [filter, setFilter] = useState<Filter>('all');
  const [command, setCommand] = useState('');
  const [commandHint, setCommandHint] = useState('');
  const [commandFocused, setCommandFocused] = useState(false);
  const [activeCommandSuggestion, setActiveCommandSuggestion] = useState(-1);

  const t = (text: { en: string; tl: string }) => (language === 'TL' ? text.tl : text.en);

  useEffect(() => {
    if (open && unread > 0) markRead();
  }, [open, unread, markRead]);

  const toggle = () => {
    soundFx.playClick();
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // Preference is a convenience only
    }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: entries.length, combat: 0, economy: 0, minions: 0, world: 0 };
    for (const e of entries) c[e.category]++;
    return c;
  }, [entries]);

  const visible = filter === 'all' ? entries : entries.filter((entry) => entry.category === filter);
  const latest = entries[0];

  const commandSuggestions = useMemo((): { items: CommandSuggestion[]; guide: CommandGuideKey | null } => {
    if (!command.startsWith('@')) return { items: [], guide: null };
    const body = command.slice(1);
    const root = COMMAND_CHOICES.find((choice) => choice.value.slice(1) === body.trim().toLocaleLowerCase());
    if (!/\s/.test(body)) {
      if (root?.value === '@sell' || root?.value === '@buy') {
        const items = (Object.keys(RESOURCE_PRICES) as TradeableResource[]).map((key) => {
          const price = RESOURCE_PRICES[key];
          return {
            value: `${root.value} ${key} `,
            label: `${price.icon} ${language === 'TL' ? price.label : price.labelEn ?? price.label}`,
            detail: `${root.value} ${key}`,
          };
        });
        return { items, guide: 'commandPickResource' };
      }
      if (root) return { items: [], guide: 'commandReady' };
      const prefix = body.trim().toLocaleLowerCase();
      return {
        items: COMMAND_CHOICES
          .filter((choice) => choice.value.slice(1).startsWith(prefix))
          .map((choice) => ({
            value: choice.value === '@sell' || choice.value === '@buy' ? `${choice.value} ` : choice.value,
            label: choice.value,
            detail: t(activityUi.commandOptions[choice.label]),
          })),
        guide: 'commandPick',
      };
    }

    const trade = body.match(/^(buy|sell)\s+([\s\S]*)$/i);
    if (!trade) return { items: [], guide: 'commandReady' };
    // Suggest for the last comma part only: "@sell fish all, sto" → stone
    const comma = trade[2].lastIndexOf(',');
    const before = comma >= 0 ? `@${trade[1]} ${trade[2].slice(0, comma + 1)} ` : `@${trade[1]} `;
    let segment = comma >= 0 ? trade[2].slice(comma + 1).trimStart() : trade[2];
    let verb = trade[1].toLocaleLowerCase();
    let lead = '';
    const verbSwitch = segment.match(/^(buy|sell)\s+/i);
    if (verbSwitch) { verb = verbSwitch[1].toLocaleLowerCase(); lead = verbSwitch[0]; segment = segment.slice(lead.length); }
    const rawResource = segment;
    const amountMatch = rawResource.match(/^(.*)\s+(all|max|half|\d+)$/i);
    if (amountMatch && resolveTradeResource(amountMatch[1])) return { items: [], guide: 'commandReady' };

    const exactResource = resolveTradeResource(rawResource.trim());
    if (exactResource && /\s$/.test(rawResource)) {
      const amountOptions = verb === 'sell'
        ? [{ value: 'all', label: t(activityUi.commandOptions.sellAll) }, { value: 'half', label: t(activityUi.commandOptions.half) }]
        : [{ value: 'max', label: t(activityUi.commandOptions.buyMax) }, { value: 'half', label: t(activityUi.commandOptions.half) }];
      return {
        items: amountOptions.map((option) => ({
          value: `${before}${lead}${exactResource} ${option.value}`,
          label: option.value,
          detail: option.label,
        })),
        guide: 'commandPickAmount',
      };
    }

    const query = normalizeCommandToken(rawResource).replace(/\s+/g, '');
    const resources = (Object.keys(RESOURCE_PRICES) as TradeableResource[])
      .filter((key) => {
        const price = RESOURCE_PRICES[key];
        return [key, price.label, price.labelEn].some((name) => name && normalizeCommandToken(name).replace(/\s+/g, '').includes(query));
      })
      .map((key) => {
        const price = RESOURCE_PRICES[key];
        return {
          value: `${before}${lead}${key} `,
          label: `${price.icon} ${language === 'TL' ? price.label : price.labelEn ?? price.label}`,
          detail: `${lead || `@${verb} `}${key}`,
        };
      });
    return { items: resources, guide: 'commandPickResource' };
  }, [command, language]);

  const visibleCommandSuggestions = commandFocused ? commandSuggestions.items : [];
  const visibleCommandGuide = commandHint || (command.startsWith('@') && commandSuggestions.guide
    ? t(activityUi[commandSuggestions.guide])
    : command ? t(activityUi.commandPrefixHint) : t(activityUi.commandHelp));

  useEffect(() => {
    setActiveCommandSuggestion(-1);
  }, [command, visibleCommandSuggestions.length]);

  useEffect(() => {
    if (activeCommandSuggestion < 0) return;
    document.getElementById(`activity-command-option-${activeCommandSuggestion}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeCommandSuggestion]);

  const selectCommandSuggestion = (suggestion: CommandSuggestion) => {
    setCommand(suggestion.value);
    setCommandHint('');
    setActiveCommandSuggestion(-1);
  };

  const handleCommandKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // First Esc closes the suggestions, the next one leaves the input (fullscreen stays)
      event.preventDefault();
      event.stopPropagation();
      setActiveCommandSuggestion(-1);
      if (visibleCommandSuggestions.length) setCommandFocused(false);
      else event.currentTarget.blur();
      return;
    }
    if (!visibleCommandSuggestions.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      if (event.key === 'Enter' && activeCommandSuggestion >= 0 && visibleCommandSuggestions[activeCommandSuggestion]) {
        event.preventDefault();
        soundFx.playClick();
        selectCommandSuggestion(visibleCommandSuggestions[activeCommandSuggestion]);
      }
      return;
    }

    event.preventDefault();
    setActiveCommandSuggestion((current) => {
      if (event.key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % visibleCommandSuggestions.length;
      return current < 0 ? visibleCommandSuggestions.length - 1 : (current - 1 + visibleCommandSuggestions.length) % visibleCommandSuggestions.length;
    });
  };

  const submitCommand = (event: React.FormEvent) => {
    event.preventDefault();
    const input = command.trim();
    if (!input) return;
    if (!input.startsWith('@')) {
      setCommandHint(t(activityUi.commandPrefixHint));
      return;
    }

    const commands = input.split(';').map((part) => part.trim()).filter(Boolean);
    let completed = 0;
    let usedHelp = false;
    for (const item of commands) {
      const result = executeCommand(item);
      if (!result.handled || !result.success) {
        recordCommandResult(item, false);
        setCommandHint(t(activityUi.commandError));
        break;
      }
      completed++;
      if (item.toLocaleLowerCase() === '@help') usedHelp = true;
      else recordCommandResult(item, true);
    }
    if (completed === commands.length) setCommandHint(t(usedHelp ? activityUi.commandHelp : activityUi.commandAccepted));
    setCommand('');
  };

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(360px,calc(100%-1.5rem))]">
        <button
          type="button"
          onClick={toggle}
          className="pixel-frame pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/85 px-3 py-2 text-left shadow-lg shadow-black/40 backdrop-blur-md transition hover:border-violet-500/60"
          title={t(activityUi.title)}
        >
          <span className="relative shrink-0 text-violet-300">
            <ScrollText className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-2 -top-2 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
          {latest ? (
            <span key={latest.id + ':' + latest.count} className="animate-tray-in flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-200">
              <span className="shrink-0">{latest.icon}</span>
              <span className="truncate">{latest.text}</span>
              {latest.count > 1 && <span className="shrink-0 font-mono text-[10px] text-slate-400">×{latest.count}</span>}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{t(activityUi.title)}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 w-[min(360px,calc(100%-1.5rem))]">
      <section className="pixel-frame pointer-events-auto flex max-h-[min(340px,60vh)] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/90 shadow-2xl shadow-black/50 backdrop-blur-md">
        <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <ScrollText className="h-4 w-4 text-violet-300" />
          <h2 className="font-fantasy text-xs font-bold tracking-wider text-violet-100">{t(activityUi.title)}</h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => { soundFx.playClick(); clear(); }}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
              title={t(activityUi.clear)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              aria-label={t(activityUi.collapse)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </header>

        <nav aria-label={t(activityUi.title)} className="grid shrink-0 grid-cols-5 gap-1 border-b border-slate-800/80 px-2 py-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { soundFx.playClick(); setFilter(f); }}
              aria-pressed={filter === f}
              className={`flex min-w-0 items-center justify-center gap-0.5 overflow-hidden rounded-lg px-0.5 py-1 text-[10px] font-bold transition ${
                filter === f ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="truncate">{t(activityUi.filters[f])}</span>
              <span className="shrink-0 font-mono text-[9px] opacity-70">{counts[f]}</span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-b border-slate-800/80 px-2 py-1.5">
          <div className="relative">
            <form onSubmit={submitCommand} className="flex gap-1">
              <input
                type="text"
                value={command}
                onFocus={() => { setCommandFocused(true); lockEscape(true); }}
                onBlur={() => { setCommandFocused(false); lockEscape(false); }}
                onClick={() => setCommandFocused(true)}
                onKeyDown={handleCommandKeyDown}
                onChange={(event) => { setCommand(event.target.value); setCommandHint(''); }}
                placeholder={t(activityUi.commandPlaceholder)}
                aria-label={t(activityUi.commandPlaceholder)}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={visibleCommandSuggestions.length > 0}
                aria-controls="activity-command-options"
                aria-activedescendant={activeCommandSuggestion >= 0 ? `activity-command-option-${activeCommandSuggestion}` : undefined}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <button type="submit" className="shrink-0 border border-violet-500/60 bg-violet-500/20 px-2 py-1 text-[10px] font-bold text-violet-100 hover:bg-violet-500/35">
                {t(activityUi.runCommand)}
              </button>
            </form>
            {visibleCommandSuggestions.length > 0 && (
              <div id="activity-command-options" role="listbox" aria-label={t(activityUi[commandSuggestions.guide ?? 'commandPick'])} className="absolute left-0 right-0 top-full z-40 max-h-40 overflow-y-auto border border-violet-500/50 bg-slate-950 shadow-xl">
                <p className="border-b border-slate-800 px-2 py-1 text-[9px] text-slate-400">{t(activityUi[commandSuggestions.guide ?? 'commandPick'])}</p>
                {visibleCommandSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.value}:${suggestion.label}`}
                    type="button"
                    id={`activity-command-option-${index}`}
                    role="option"
                    aria-selected={activeCommandSuggestion === index}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveCommandSuggestion(index)}
                    onClick={() => { soundFx.playClick(); selectCommandSuggestion(suggestion); }}
                    className={`flex w-full items-center justify-between gap-2 border-b border-slate-800/70 px-2 py-1.5 text-left text-[10px] text-violet-100 ${activeCommandSuggestion === index ? 'bg-violet-500/30' : 'hover:bg-violet-500/20'}`}
                  >
                    <span className="min-w-0 truncate">{suggestion.label}</span>
                    <span className="shrink-0 text-[9px] text-slate-400">{suggestion.detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 whitespace-normal text-[9px] leading-3 text-slate-500">{visibleCommandGuide}</p>
        </div>

        <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
          {visible.length === 0 && <li className="py-6 text-center text-[11px] text-slate-500">{t(activityUi.empty)}</li>}
          {visible.map((e) => {
            const tone = TONE_STYLES[e.tone];
            return (
              <li key={e.id} className={`mb-1 flex items-start gap-2 rounded-lg border-l-2 bg-slate-900/60 px-2 py-1.5 ${tone.border}`}>
                <span className="mt-px shrink-0 text-sm leading-4">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-[11px] font-medium leading-4 ${tone.text}`}>
                    {e.text}
                    {e.count > 1 && <span className="ml-1 font-mono text-[10px] text-slate-400">×{e.count}</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-500">
                    {t(activityUi.day)} {e.day} · {e.clock}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};
