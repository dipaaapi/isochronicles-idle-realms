import React, { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Sparkles,
  Flame,
  Swords,
  Lock,
} from 'lucide-react';
import {
  UNIT_CLASSES,
  INVADER_CONFIGS,
  UnitClass,
  InvaderType,
} from '../types/game';
import { BEAST_PORTRAITS, INVADER_PORTRAITS } from '../game/bestiaryPortraits';

interface BestiaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BestiaryModal: React.FC<BestiaryModalProps> = ({ isOpen, onClose }) => {
  const { discoveredBeasts, discoveredInvaders, language } = useGameStore();
  const [activeTab, setActiveTab] = useState<'BEASTS' | 'INVADERS'>('BEASTS');

  if (!isOpen) return null;

  const handleClose = () => {
    soundFx.playClick();
    onClose();
  };

  const beastKeys: UnitClass[] = [
    'GOLEM',
    'WAYFARER',
    'CHRONO',
    'AQUA_SLIME',
    'MERMAN',
    'NECROMANCER',
    'TREANT',
  ];
  const invaderKeys: InvaderType[] = [
    'HUMAN_KNIGHT',
    'HUMAN_ARCHER',
    'MECHA_SCOUT',
    'MECHA_TITAN',
    'DEEP_ONE',
  ];

  const totalBeasts = beastKeys.length;
  const unlockedBeastsCount = beastKeys.filter((k) =>
    discoveredBeasts?.includes(k)
  ).length;

  const totalInvaders = invaderKeys.length;
  const unlockedInvadersCount = invaderKeys.filter((k) =>
    discoveredInvaders?.includes(k)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-fade-in">
      <div className="relative max-w-3xl w-full max-h-[88vh] flex flex-col p-6 rounded-3xl border border-red-500/40 bg-slate-950/95 shadow-2xl shadow-red-950/80 overflow-hidden">
        {/* Header with Demon Lord Theme */}
        <div className="flex items-center justify-between border-b border-red-500/20 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-400 shadow-md shadow-red-500/20 text-2xl">
              📖
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-100 tracking-wide flex items-center gap-2">
                <span>{language === 'TL' ? 'Talaan ng Demon Lord' : 'Demon Lord Codex'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/60 border border-red-500/40 text-red-300 font-mono">
                  Bestiary
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'TL' ? 'Tuklasin ang lahat ng iyong mga Alagad at ang mga Sumusugod na Tao at Mecha!' : 'Discover all your Servants and the invading Humans and Mechas!'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-900/70 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('BEASTS');
            }}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'BEASTS'
                ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-300" />
            <span>{language === 'TL' ? 'Mga Alagad na Demonyo at Halimaw' : 'Demon Servants & Monsters'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono">
              {unlockedBeastsCount}/{totalBeasts}
            </span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              setActiveTab('INVADERS');
            }}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'INVADERS'
                ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-sky-600/30 scale-[1.02]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Swords className="w-4 h-4 text-sky-300" />
            <span>{language === 'TL' ? 'Mga Kalabang Tao at Mecha' : 'Invading Humans & Mechas'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono">
              {unlockedInvadersCount}/{totalInvaders}
            </span>
          </button>
        </div>

        {/* Content Body: Grid of Cards (Silhouette or Revealed) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-3 custom-scrollbar">
          {activeTab === 'BEASTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {beastKeys.map((key) => {
                const config = UNIT_CLASSES[key];
                const isDiscovered = Boolean(discoveredBeasts && discoveredBeasts.includes(key));
                const portraitSrc = BEAST_PORTRAITS[key];

                return (
                  <div
                    key={key}
                    className={`relative p-4 rounded-2xl border transition-all flex flex-col ${
                      isDiscovered
                        ? 'bg-slate-900/80 border-red-500/30 hover:border-red-400/60 shadow-md'
                        : 'bg-slate-950/90 border-slate-800/80 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar Portrait / Silhouette */}
                      <div
                        className={`w-16 h-16 shrink-0 rounded-2xl overflow-hidden border shadow-inner ${
                          isDiscovered
                            ? 'border-red-500/40'
                            : 'border-slate-800'
                        }`}
                      >
                        {isDiscovered && portraitSrc ? (
                          <img
                            src={portraitSrc}
                            alt={config.nameEn || config.name}
                            className="w-full h-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full h-full bg-black flex items-center justify-center">
                            {portraitSrc ? (
                              <img
                                src={portraitSrc}
                                alt=""
                                className="w-full h-full object-cover brightness-0 opacity-70"
                                draggable={false}
                              />
                            ) : (
                              <span className="text-slate-700 text-2xl font-black opacity-30">
                                {config.iconEmoji || '👹'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3
                            className={`font-bold text-sm tracking-wide ${
                              isDiscovered ? 'text-white' : 'text-slate-500 italic'
                            }`}
                          >
                            {isDiscovered ? (language === 'TL' ? config.name : (config.nameEn || config.name)) : (language === 'TL' ? '❓ Hindi pa Natutuklasan' : '❓ Undiscovered')}
                          </h3>
                          {isDiscovered ? (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              {language === 'TL' ? 'Bukas ✨' : 'Unlocked ✨'}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> {language === 'TL' ? 'Nakatago' : 'Locked'}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-amber-300/90 font-medium mt-0.5">
                          {isDiscovered ? (language === 'TL' ? config.subtitle : (config.subtitleEn || config.subtitle)) : (language === 'TL' ? 'Isang misteryosong nilalang...' : 'A mysterious creature...')}
                        </p>

                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          {isDiscovered
                            ? (language === 'TL' ? config.description : (config.descriptionEn || config.description))
                            : (language === 'TL' ? 'Tawagin ang alagad na ito sa pamamagitan ng pagpapalakas ng iyong kuta upang mabuksan ang kanyang talaan!' : 'Summon this servant by upgrading your citadel to unlock their entry!')}
                        </p>

                        {isDiscovered && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                            <span className="flex items-center gap-1 font-bold whitespace-nowrap">
                              ⚡ {language === 'TL' ? 'Bilis' : 'Speed'}: <strong className="text-sky-300">{config.baseSpeed}</strong>
                            </span>
                            <span className="flex items-center gap-1 font-bold whitespace-nowrap">
                              🎒 {language === 'TL' ? 'Dala' : 'Cargo'}: <strong className="text-amber-300">{config.cargoCapacity}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'INVADERS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {invaderKeys.map((key) => {
                const config = INVADER_CONFIGS[key];
                const isDiscovered = Boolean(discoveredInvaders && discoveredInvaders.includes(key));
                const portraitSrc = INVADER_PORTRAITS[key];

                return (
                  <div
                    key={key}
                    className={`relative p-4 rounded-2xl border transition-all flex flex-col ${
                      isDiscovered
                        ? 'bg-slate-900/80 border-sky-500/30 hover:border-sky-400/60 shadow-md'
                        : 'bg-slate-950/90 border-slate-800/80 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar Portrait / Silhouette */}
                      <div
                        className={`w-16 h-16 shrink-0 rounded-2xl overflow-hidden border shadow-inner ${
                          isDiscovered
                            ? config.category === 'MECHA'
                              ? 'border-amber-500/40'
                              : 'border-sky-500/40'
                            : 'border-slate-800'
                        }`}
                      >
                        {isDiscovered && portraitSrc ? (
                          <img
                            src={portraitSrc}
                            alt={config.nameEn || config.name}
                            className="w-full h-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full h-full bg-black flex items-center justify-center">
                            {portraitSrc ? (
                              <img
                                src={portraitSrc}
                                alt=""
                                className="w-full h-full object-cover brightness-0 opacity-70"
                                draggable={false}
                              />
                            ) : (
                              <span className="text-slate-700 text-2xl font-black opacity-30">
                                {config.iconEmoji || '⚔️'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3
                            className={`font-bold text-sm tracking-wide ${
                              isDiscovered ? 'text-white' : 'text-slate-500 italic'
                            }`}
                          >
                            {isDiscovered ? (language === 'TL' ? config.name : (config.nameEn || config.name)) : (language === 'TL' ? '❓ Hindi pa Nakakatapat' : '❓ Unencountered')}
                          </h3>
                          {isDiscovered ? (
                            <span className="shrink-0 text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                              {config.category === 'MECHA' ? (language === 'TL' ? 'Robot 🤖' : 'Mech 🤖') : (language === 'TL' ? 'Tao 👤' : 'Human 👤')}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> {language === 'TL' ? 'Nakatago' : 'Locked'}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-sky-300/90 font-medium mt-0.5">
                          {isDiscovered ? (language === 'TL' ? config.subtitle : (config.subtitleEn || config.subtitle)) : (language === 'TL' ? 'Misteryosong mananalakay...' : 'Mysterious invader...')}
                        </p>

                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          {isDiscovered
                            ? (language === 'TL' ? config.description : (config.descriptionEn || config.description))
                            : (language === 'TL' ? 'Harapin ang mga darating na alon ng pagsugod upang makita ang anyo ng mandirigma o makinang ito!' : 'Face upcoming waves of invasions to reveal the form of this warrior or machine!')}
                        </p>

                        {isDiscovered && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                            <span className="flex items-center gap-1 font-bold whitespace-nowrap">
                              ❤️ {language === 'TL' ? 'Buhay' : 'Health'}: <strong className="text-rose-400">{config.hp}</strong>
                            </span>
                            <span className="flex items-center gap-1 font-bold whitespace-nowrap">
                              💥 {language === 'TL' ? 'Pinsala' : 'Damage'}: <strong className="text-amber-400">{config.damage}</strong>
                            </span>
                            <span className="flex items-center gap-1 font-bold whitespace-nowrap">
                              🪙 {language === 'TL' ? 'Barya' : 'Bounty'}: <strong className="text-yellow-300">+{config.bountyCoins}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-amber-300/90">
            <Sparkles className="w-3.5 h-3.5" />
            {language === 'TL' ? 'Lalabas ang tunay na kulay at anyo ng mga nilalang kapag nakasalamuha mo na sila sa laro!' : 'The true color and form of creatures will be revealed once you encounter them in the game!'}
          </span>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-bold cursor-pointer"
          >
            {language === 'TL' ? 'Sige' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
