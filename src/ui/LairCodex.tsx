import { useGameStore } from '../state/useGameStore';
import { CREATURES, LAIR_CONFIG, MATRIARCH, type CreatureKind } from '../state/lairExpedition';

const PORTRAIT: Record<CreatureKind, string> = { BAT: 'giant-bat', KIN: 'dragon-kin', GOLEM: 'magma-golem' };

/** Codex → Dragon's Lair: the cave's rules, Ignara's brood, Ignara herself and her volcano's magma. */
export function LairCodex() {
  const language = useGameStore((s) => s.language);
  const slain = useGameStore((s) => s.dragonsSlain);
  const tx = (t: { en: string; tl: string }) => (language === 'TL' ? t.tl : t.en);
  const C = LAIR_CONFIG.codex;
  const base = import.meta.env.BASE_URL;

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-2xl border bg-stone-900/80 border-orange-500/30">
        <p className="text-xs text-slate-300 leading-relaxed">{tx(C.intro)}</p>
        <p className="mt-2 text-xs text-rose-200 leading-relaxed">{tx(C.rules)}</p>
        <p className="mt-2 text-[11px] font-bold text-amber-300">🐉 {tx(C.slain)}: {slain}</p>
      </div>

      {/* Ignara */}
      <div className="p-4 rounded-2xl border bg-stone-900/80 border-red-500/40">
        <div className="flex items-start gap-3">
          <div className="w-20 h-20 shrink-0 rounded-2xl border border-red-500/40 bg-gradient-to-b from-red-950 to-stone-950 flex items-center justify-center text-4xl" aria-hidden>🐉</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm tracking-wide text-white">{tx(MATRIARCH.name)}</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{tx(C.ignara)}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
              {MATRIARCH.phaseNames.map((p, i) => (
                <p key={p.en} className="text-[11px] text-orange-200">
                  {i + 1}. <strong>{tx(p)}</strong> <span className="text-slate-500">≤ {Math.round(MATRIARCH.phaseAt[i] * 100)}% HP</span>
                </p>
              ))}
              {Object.entries(C.abilities).map(([k, a]) => (
                <p key={k} className="text-xs text-slate-300">• {tx(a)}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Her brood */}
      {(['BAT', 'KIN', 'GOLEM'] as CreatureKind[]).map((kind) => {
        const def = CREATURES[kind];
        return (
          <div key={kind} className="p-4 rounded-2xl border bg-stone-900/80 border-orange-500/30">
            <div className="flex items-start gap-3">
              <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-orange-500/40">
                <img src={`${base}portraits/${PORTRAIT[kind]}.png`} alt={tx(def.name)} className="w-full h-full object-cover [image-rendering:pixelated]" draggable={false} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm tracking-wide text-white">{tx(def.name)}</h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{tx(C.creatures[kind])}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                  <span className="font-bold">❤️ HP: <strong className="text-rose-400">{def.hp}</strong> {tx(C.relative)}</span>
                  <span className="font-bold">💥 {language === 'TL' ? 'Pinsala' : 'Damage'}: <strong className="text-amber-400">{def.attack}</strong> {tx(C.relative)}</span>
                  <span className="font-bold">🎯 {language === 'TL' ? 'Abot' : 'Range'}: <strong className="text-sky-300">{def.range}</strong></span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="p-4 rounded-2xl border bg-stone-900/80 border-amber-600/30">
        <h3 className="font-bold text-sm text-amber-300">🌋 {language === 'TL' ? 'Magma ng Bulkan' : 'Volcanic magma'}</h3>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{tx(C.magma)}</p>
      </div>
    </div>
  );
}
