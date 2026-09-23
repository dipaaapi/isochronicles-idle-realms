import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  RotateCcw,
  ShieldAlert,
  Coins,
  Gem,
  Trees,
  Hammer,
  Sparkles,
  Trophy,
  Shield,
  ArrowDown,
  Castle,
} from 'lucide-react';

const AUTO_ACCEPT_SECONDS = 10;

export const CastleBreachedModal: React.FC = () => {
  const {
    isCastleBreachedModalOpen,
    closeCastleBreachedModal,
    resources,
    lootedResources,
    achievements,
    defense,
    language,
  } = useGameStore();

  const [secondsLeft, setSecondsLeft] = useState(AUTO_ACCEPT_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleReconstruct = () => {
    soundFx.playFanfare();
    closeCastleBreachedModal();
  };

  useEffect(() => {
    if (!isCastleBreachedModalOpen) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setSecondsLeft(AUTO_ACCEPT_SECONDS);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          handleReconstruct();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCastleBreachedModalOpen]);

  if (!isCastleBreachedModalOpen) return null;

  const isTl = language === 'TL';

  const lootItems = [
    {
      key: 'coins',
      label: isTl ? 'Barya' : 'Coins',
      value: resources.coins,
      looted: lootedResources?.coins ?? 0,
      icon: Coins,
      color: 'amber',
    },
    {
      key: 'aetherShards',
      label: isTl ? 'Kristal' : 'Gems',
      value: resources.aetherShards,
      looted: lootedResources?.aetherShards ?? 0,
      icon: Gem,
      color: 'sky',
    },
    {
      key: 'wood',
      label: isTl ? 'Kahoy' : 'Wood',
      value: resources.wood,
      looted: lootedResources?.wood ?? 0,
      icon: Trees,
      color: 'emerald',
    },
    {
      key: 'stone',
      label: isTl ? 'Bato' : 'Stone',
      value: resources.stone,
      looted: lootedResources?.stone ?? 0,
      icon: Hammer,
      color: 'orange',
    },
    {
      key: 'arcaneEssence',
      label: isTl ? 'Magic' : 'Essence',
      value: resources.arcaneEssence,
      looted: lootedResources?.arcaneEssence ?? 0,
      icon: Sparkles,
      color: 'purple',
    },
  ] as const;

  const colorClasses = {
    amber: {
      border: 'border-amber-400/20',
      iconBg: 'bg-amber-400/10',
      icon: 'text-amber-300',
      value: 'text-amber-200',
    },
    sky: {
      border: 'border-sky-400/20',
      iconBg: 'bg-sky-400/10',
      icon: 'text-sky-300',
      value: 'text-sky-200',
    },
    emerald: {
      border: 'border-emerald-400/20',
      iconBg: 'bg-emerald-400/10',
      icon: 'text-emerald-300',
      value: 'text-emerald-200',
    },
    orange: {
      border: 'border-orange-400/20',
      iconBg: 'bg-orange-400/10',
      icon: 'text-orange-300',
      value: 'text-orange-200',
    },
    purple: {
      border: 'border-purple-400/20',
      iconBg: 'bg-purple-400/10',
      icon: 'text-purple-300',
      value: 'text-purple-200',
    },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md animate-fade-in sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="castle-breached-title"
        className="flex h-[min(760px,92vh)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-rose-400/30 bg-slate-950 shadow-2xl shadow-rose-950/60 md:flex-row"
      >
        {/* LEFT: Full defeat artwork */}
        <div className="relative flex h-[32vh] min-h-[220px] w-full shrink-0 items-center justify-center overflow-hidden bg-black md:h-full md:w-[46%]">
          <img
            src="/backgrounds/defeat.jpg"
            alt={isTl ? 'Nasirang kastilyo' : 'Defeated castle'}
            className="h-full w-full object-contain"
          />

          {/* Very light overlay only for readability of the status badge */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
            <div className="rounded-full border border-rose-300/20 bg-black/55 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-rose-100 backdrop-blur-md">
              {isTl ? 'Realm Breached' : 'Realm Breached'}
            </div>

            <div className="flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-black/55 px-3 py-1.5 text-[9px] font-bold text-rose-100 backdrop-blur-md">
              <ShieldAlert className="h-3.5 w-3.5" />
              {isTl ? 'Depensa Bumagsak' : 'Defense Breached'}
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-950/70 text-rose-300 backdrop-blur-md">
                <Castle className="h-5 w-5" />
              </div>

              <div>
                <h2
                  id="castle-breached-title"
                  className="text-2xl font-black tracking-tight text-white drop-shadow-lg sm:text-3xl"
                >
                  {isTl ? 'Nawasak ang Kastilyo!' : 'Castle Breached!'}
                </h2>

                <p className="mt-1 max-w-md text-[10px] leading-relaxed text-rose-100/75 sm:text-xs">
                  {isTl
                    ? 'Napasok ng mga kaaway ang kuta at ninakaw ang kalahati ng iyong mga yaman.'
                    : 'The invaders breached your castle and escaped with half of your resources.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Game report / actions */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-800 md:border-l md:border-t-0">
          {/* Right header */}
          <div className="shrink-0 border-b border-slate-800 px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {isTl ? 'Battle Report' : 'Battle Report'}
                </div>
                <div className="mt-0.5 text-[9px] text-slate-600">
                  {isTl
                    ? 'Resulta ng castle breach'
                    : 'Result of the castle breach'}
                </div>
              </div>

              <div className="rounded-full border border-rose-400/20 bg-rose-950/20 px-2.5 py-1 text-[9px] font-mono font-bold text-rose-300">
                -50% RESOURCES
              </div>
            </div>
          </div>

          {/* Scrollable report */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 p-4 sm:p-5">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <div className="rounded-2xl border border-rose-400/20 bg-rose-950/20 p-3">
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-rose-300">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {isTl ? 'Ninakaw' : 'Plundered'}
                  </div>
                  <div className="mt-1.5 text-lg font-black text-rose-200">
                    50%
                  </div>
                  <div className="text-[9px] text-rose-300/60">
                    {isTl ? 'ng resources' : 'of resources'}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/20 p-3">
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                    <Shield className="h-3.5 w-3.5" />
                    {isTl ? 'Naiwan' : 'Preserved'}
                  </div>
                  <div className="mt-1.5 text-lg font-black text-emerald-200">
                    50%
                  </div>
                  <div className="text-[9px] text-emerald-300/60">
                    {isTl ? 'natitirang yaman' : 'resources kept'}
                  </div>
                </div>

                <div className="col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:col-span-1">
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                    {isTl ? 'Gantimpala' : 'Achievements'}
                  </div>
                  <div className="mt-1.5 text-lg font-black text-yellow-200">
                    {achievements.length}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {isTl ? 'na-unlock' : 'earned'}
                  </div>
                </div>
              </div>

              {/* Resources */}
              <section>
                <div className="mb-2.5 flex items-end justify-between px-1">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {isTl ? 'Resource Report' : 'Resource Report'}
                    </h3>
                    <p className="mt-0.5 text-[9px] text-slate-600">
                      {isTl
                        ? 'Natitirang halaga pagkatapos ng raid'
                        : 'Remaining resources after the raid'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {lootItems.map((item) => {
                    const Icon = item.icon;
                    const colors = colorClasses[item.color];

                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl border ${colors.border} bg-slate-900/70 p-2.5`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colors.iconBg} ${colors.icon}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>

                          {item.looted > 0 && (
                            <span className="text-[9px] font-mono font-bold text-rose-400">
                              -{item.looted.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="mt-2">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            {item.label}
                          </div>

                          <div
                            className={`mt-0.5 text-sm font-black font-mono ${colors.value}`}
                          >
                            {item.value.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* What happened */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-200">
                      {isTl ? 'Ano ang nangyari?' : 'What happened?'}
                    </h3>
                    <p className="text-[9px] text-slate-500">
                      {isTl
                        ? 'Maikling ulat pagkatapos ng breach'
                        : 'Quick report after the breach'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl bg-slate-950/60 p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-rose-400">
                      01 · {isTl ? 'Raid' : 'Raid'}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {isTl
                        ? 'Umalis ang mga kaaway matapos kunin ang 50% ng resources.'
                        : 'The invaders escaped after taking 50% of your resources.'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-950/60 p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                      02 · {isTl ? 'Rebuild' : 'Rebuild'}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {isTl
                        ? `Awtomatikong naibalik ang Kastilyo sa ${defense.castleMaxHp} HP.`
                        : `The castle was automatically restored to ${defense.castleMaxHp} HP.`}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-950/60 p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-sky-400">
                      03 · {isTl ? 'Prepare' : 'Prepare'}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      {isTl
                        ? 'Palakasin ang depensa bago ang susunod na wave.'
                        : 'Strengthen your defenses before the next wave.'}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Continue action */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 p-3.5 sm:p-4">
            <button
              type="button"
              onClick={handleReconstruct}
              className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-300/20 bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3.5 text-left text-white shadow-lg shadow-emerald-950/40 transition-all hover:from-emerald-400 hover:to-teal-400 active:scale-[0.99]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <RotateCcw className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <div className="truncate text-xs font-black sm:text-sm">
                    {isTl ? 'Ituloy ang Laban' : 'Continue Defending'}
                  </div>
                  <div className="mt-0.5 text-[9px] text-white/65">
                    {isTl
                      ? 'Kastilyo ay handa nang lumaban muli.'
                      : 'Your castle is ready to defend again.'}
                  </div>
                </div>
              </div>

              <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-white/15 px-2 text-xs font-mono font-bold">
                {secondsLeft}s
              </span>
            </button>

            <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-slate-600">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                style={{ animation: 'pulse 1s ease-in-out infinite' }}
              />
              {isTl
                ? `Awtomatikong magpapatuloy sa ${secondsLeft}s`
                : `Automatically continues in ${secondsLeft}s`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
