import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import { WeatherType } from '../types/state';
import {
  CloudSun,
  CloudRain,
  CloudSnow,
  Flame,
  X,
  Shuffle,
  Check,
  Sparkles,
  Info,
  Lock,
} from 'lucide-react';

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WeatherCardData {
  type: WeatherType;
  icon: React.ReactNode;
  nameEn: string;
  nameTl: string;
  descEn: string;
  descTl: string;
  buffEn: string;
  buffTl: string;
  bgGradient: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
}

const WEATHERS: WeatherCardData[] = [
  {
    type: 'CLEAR',
    icon: <CloudSun className="w-6 h-6 text-amber-400" />,
    nameEn: 'Clear Skies',
    nameTl: 'Maaliwalas na Kalangitan',
    descEn: 'Gentle sunlight bathes the floating island in serene tranquility.',
    descTl: 'Payapang liwanag ng araw ang bumabalot sa lumulutang na isla.',
    buffEn: '+10% Minion Movement Speed & Standard Yield',
    buffTl: '+10% Bilis ng Minion & Karaniwang Ani',
    bgGradient: 'from-amber-950/40 via-slate-900/90 to-slate-950',
    borderColor: 'border-amber-500/40 hover:border-amber-400',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
  },
  {
    type: 'RAIN',
    icon: <CloudRain className="w-6 h-6 text-sky-400" />,
    nameEn: 'Stormy Rain',
    nameTl: 'Ulan at Pagkulog',
    descEn: 'Heavy mystical rain pours down, nourishing crops and water basins.',
    descTl: 'Malakas na ulan na nagpapayabong sa mga bukal at pananim.',
    buffEn: '+35% Fishery & Water Output, +20% Tree Regrowth',
    buffTl: '+35% Ani ng Isda at Tubig, +20% Pagsibol ng Puno',
    bgGradient: 'from-sky-950/40 via-slate-900/90 to-slate-950',
    borderColor: 'border-sky-500/40 hover:border-sky-400',
    badgeBg: 'bg-sky-500/20',
    badgeText: 'text-sky-300',
  },
  {
    type: 'SNOW',
    icon: <CloudSnow className="w-6 h-6 text-cyan-300" />,
    nameEn: 'Frost Snow',
    nameTl: 'Niyebeng Yelo',
    descEn: 'Chilling frost coats the realm, crystalizing aether and slowing intruders.',
    descTl: 'Malamig na yelo na nagpapatigas sa aether at nagpapabagal sa kaaway.',
    buffEn: '-25% Invader Move Speed, +30% Crystal Extraction',
    buffTl: '-25% Bilis ng Mananakop, +30% Ani ng Kristal',
    bgGradient: 'from-cyan-950/40 via-slate-900/90 to-slate-950',
    borderColor: 'border-cyan-500/40 hover:border-cyan-400',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-300',
  },
  {
    type: 'HEATWAVE',
    icon: <Flame className="w-6 h-6 text-rose-400" />,
    nameEn: 'Scorching Heat',
    nameTl: 'Matinding Init',
    descEn: 'Blazing atmospheric pressure heats the earth, accelerating quarrying.',
    descTl: 'Nagliliyab na init na nagpapatigas at nagpapadali sa pagtibag ng bato.',
    buffEn: '+35% Stone Quarry Yield, +25% Minion Attack Power',
    buffTl: '+35% Ani sa Quarry, +25% Lakas ng Pag-atake',
    bgGradient: 'from-rose-950/40 via-slate-900/90 to-slate-950',
    borderColor: 'border-rose-500/40 hover:border-rose-400',
    badgeBg: 'bg-rose-500/20',
    badgeText: 'text-rose-300',
  },
];

export const WeatherModal: React.FC<WeatherModalProps> = ({ isOpen, onClose }) => {
  const {
    weather,
    setWeather,
    randomWeatherEnabled,
    setRandomWeatherEnabled,
    language,
  } = useGameStore();

  if (!isOpen) return null;

  const isTL = language === 'TL';
  const isRandom = randomWeatherEnabled !== false;

  const handleToggleRandom = () => {
    soundFx.playClick();
    const nextState = !isRandom;
    setRandomWeatherEnabled(nextState);
  };

  const handleSelectWeather = (type: WeatherType) => {
    if (isRandom) return;
    soundFx.playClick();
    setWeather(type);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg overflow-hidden border rounded-3xl bg-slate-950/95 border-purple-500/30 shadow-2xl shadow-purple-950/50">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-900 via-purple-950/50 to-slate-900 border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 border rounded-xl bg-purple-900/40 border-purple-500/40 text-purple-300 shadow-md shadow-purple-900/30">
              <Sparkles className="w-5 h-5 text-purple-300 animate-pulse" />
            </div>
            <div>
              <h2 className="font-fantasy text-lg font-black tracking-wide text-white drop-shadow">
                {isTL ? 'Kontrol ng Panahon' : 'Weather & Climate Control'}
              </h2>
              <p className="text-xs text-purple-300/80 font-medium">
                {isTL ? 'Pamahalaan ang klima at mga biyaya ng kalikasan' : 'Manage atmospheric climate and realm boons'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="p-2 transition rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {/* Random Weather Toggle Bar */}
          <div className="flex items-center justify-between p-3.5 border rounded-2xl bg-slate-900/80 border-slate-800/90 shadow-inner">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border transition ${
                isRandom ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Shuffle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{isTL ? 'Random na Pagbabago ng Panahon' : 'Dynamic Weather Shifting'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-mono border ${
                    isRandom ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {isRandom ? (isTL ? 'Naka-ON (Kusang Nag-iiba)' : 'ON (Auto Cycle)') : (isTL ? 'Naka-OFF (Mano-mano)' : 'OFF (Manual Lock)')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isRandom
                    ? (isTL ? 'Kusang nag-iiba ang panahon sa bawat paglipas ng araw.' : 'Weather automatically rolls every morning/cycle.')
                    : (isTL ? 'Naka-lock ang panahon ayon sa napili mo sa ibaba.' : 'Weather stays permanently fixed to your manual choice.')}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleRandom}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                isRandom
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isRandom ? (isTL ? 'I-OFF' : 'Turn OFF') : (isTL ? 'I-ON' : 'Turn ON')}
            </button>
          </div>

          {/* Locked Notice if Random is ON */}
          {isRandom && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-[11px] text-purple-300">
              <Info className="w-4 h-4 flex-shrink-0 text-purple-400" />
              <span>
                {isTL
                  ? 'Naka-lock ang pagpili sa ibaba habang naka-ON ang Dynamic Weather. I-OFF ang toggle upang makapili nang manu-mano.'
                  : 'Manual selection is locked while Dynamic Weather is ON. Turn toggle OFF to choose custom weather.'}
              </span>
            </div>
          )}

          {/* Weather Grid */}
          <div className="grid grid-cols-2 gap-3">
            {WEATHERS.map((item) => {
              const isSelected = weather === item.type;
              return (
                <button
                  key={item.type}
                  disabled={isRandom}
                  onClick={() => handleSelectWeather(item.type)}
                  className={`relative p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between overflow-hidden group ${
                    isSelected
                      ? `bg-gradient-to-br ${item.bgGradient} ${item.borderColor} ring-2 ring-purple-500/50 shadow-lg shadow-purple-950/40 scale-[1.01]`
                      : `bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60`
                  } ${isRandom ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'}`}
                >
                  {/* Top: Icon + Badge + Check/Lock */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-black/40 border border-white/10 shadow-sm">
                        {item.icon}
                      </div>
                      <span className="text-xs font-black text-white">
                        {isTL ? item.nameTl : item.nameEn}
                      </span>
                    </div>

                    {isRandom ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                    ) : isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 shadow-md">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : null}
                  </div>

                  {/* Description */}
                  <p className="mt-2 text-[10px] text-slate-300/80 line-clamp-2 leading-relaxed">
                    {isTL ? item.descTl : item.descEn}
                  </p>

                  {/* Buff footer */}
                  <div className="mt-2.5 pt-2 border-t border-white/10">
                    <span className={`text-[9px] font-bold ${item.badgeText} flex items-center gap-1`}>
                      <span>✨</span>
                      <span>{isTL ? item.buffTl : item.buffEn}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t bg-slate-900/60 border-slate-800">
          <button
            onClick={() => {
              soundFx.playClick();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-md shadow-purple-600/30 cursor-pointer"
          >
            {isTL ? 'Isara' : 'Done / Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
