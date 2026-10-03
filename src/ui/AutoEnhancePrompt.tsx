import { isConstructionReady } from '../state/constructionProgress';
import React from 'react';
import { useGameStore } from '../state/useGameStore';
import { CastleUpgradeKey, beaconLevelOf, canAfford, castleUpgradeCost } from '../state/defenseStats';
import { formatCost } from './costDisplay';
import { soundFx } from '../game/audio/soundFx';
import { Coins, Zap, X, ArrowRight } from 'lucide-react';

import { CitadelTab } from './CitadelCommandModal';

interface AutoEnhancePromptProps {
  onOpenCitadel: (tab: CitadelTab) => void;
  embedded?: boolean;
}

export const AutoEnhancePrompt: React.FC<AutoEnhancePromptProps> = ({
  onOpenCitadel,
  embedded = false,
}) => {
  const state = useGameStore();
  const isTL = state.language === 'TL';

  if (!isConstructionReady(state)) return null;

  const checkTech = (key: 'golemSpeedLevel' | 'golemCapacityLevel', title: string, titleTl: string) => {
    const level = state.upgrades[key];
    const nextLevel = level + 1;
    const prompted = state.promptedUpgrades[key] || 0;
    
    if (nextLevel > prompted) {
      const costShards = Math.floor(40 * Math.pow(1.6, level - 1));
      const costWood = Math.floor(30 * Math.pow(1.5, level - 1));
      const costStone = Math.floor(25 * Math.pow(1.5, level - 1));

      if (
        state.resources.aetherShards >= costShards &&
        state.resources.wood >= costWood &&
        state.resources.stone >= costStone
      ) {
        const costDisplay = `${costShards}💎 ${costWood}🌲 ${costStone}🪨`;
        return {
          key,
          type: 'tech' as const,
          title: isTL ? titleTl : title,
          level: nextLevel,
          costDisplay,
          currency: 'shards' as const,
        };
      }
    }
    return null;
  };

  const checkDefense = (key: CastleUpgradeKey, title: string, titleTl: string) => {
    const level = key === 'beaconLevel' ? beaconLevelOf(state.defense) : state.defense[key];
    const nextLevel = level + 1;
    const prompted = state.promptedUpgrades[key] || 0;

    if (nextLevel > prompted) {
      const cost = castleUpgradeCost(key, level);
      if (cost && canAfford(state.resources, cost)) {
        return {
          key,
          type: 'defense' as const,
          title: isTL ? titleTl : title,
          level: nextLevel,
          costDisplay: formatCost(cost),
          currency: 'coins' as const,
        };
      }
    }
    return null;
  };

  const checkSummon = (cls: 'GOLEM' | 'LAVA_GARGOYLE' | 'SUCCUBUS' | 'NECROMANCER', title: string, titleTl: string) => {
    const count = state.roster.filter(u => u.unitClass === cls).length;
    if (count >= 2) return null;

    let reqNexus = 2, reqRefinery = 1;
    let costShards = 0, costWood = 0, costStone = 0;

    switch(cls) {
      case 'GOLEM':
        reqNexus = 1; reqRefinery = 1;
        costShards = 30 + count * 20; costStone = 20 + count * 15;
        break;
      case 'LAVA_GARGOYLE':
        reqNexus = 2; reqRefinery = 1;
        costShards = 40 + count * 25; costWood = 30 + count * 20;
        break;
      case 'SUCCUBUS':
        reqNexus = 2; reqRefinery = 2;
        costShards = 70 + count * 40; costStone = 45 + count * 25; costWood = 35 + count * 20;
        break;
      case 'NECROMANCER':
        reqNexus = 3; reqRefinery = 2;
        costShards = 60 + count * 30; costStone = 30 + count * 20;
        break;
    }

    if (state.upgrades.nexusLevel < reqNexus || state.upgrades.refineryLevel < reqRefinery) {
      return null;
    }

    if (state.resources.aetherShards >= costShards && state.resources.wood >= costWood && state.resources.stone >= costStone) {
      const prompted = state.promptedUpgrades[`summon_${cls}`] || 0;
      if (count + 1 > prompted) {
        let costDisplay = '';
        if (costShards) costDisplay += `${costShards}💎 `;
        if (costWood) costDisplay += `${costWood}🌲 `;
        if (costStone) costDisplay += `${costStone}🪨`;

        return {
          key: `summon_${cls}`,
          type: 'summon' as const,
          title: isTL ? titleTl : title,
          level: count + 1,
          costDisplay: costDisplay.trim(),
          currency: 'shards' as const,
        };
      }
    }
    return null;
  };

  const allPrompts = [
    checkSummon('GOLEM', 'Earth Golem', 'Batong Golem'),
    checkSummon('LAVA_GARGOYLE', 'Lava Gargoyle', 'Lava Gargoyle'),
    checkSummon('SUCCUBUS', 'Succubus', 'Succubus'),
    checkSummon('NECROMANCER', 'Lich Necromancer', 'Lich Necromancer'),
    checkTech('golemSpeedLevel', 'Minion Speed', 'Bilis ng Alagad'),
    checkTech('golemCapacityLevel', 'Minion Capacity', 'Kapasidad ng Alagad'),
    checkDefense('wallLevel', 'Castle Wall', 'Pader ng Kastilyo'),
    checkDefense('beaconLevel', 'Provoke Beacon', 'Tore ng Beacon'),
    checkDefense('shieldLevel', 'Arcane Shield', 'Kalasag ng Kuta'),
  ].filter(Boolean) as Array<{
    key: string;
    type: 'tech' | 'defense' | 'summon';
    title: string;
    level: number;
    costDisplay: string;
    currency: 'shards' | 'coins';
  }>;

  if (allPrompts.length === 0) return null;

  const handleDismiss = (e: React.MouseEvent, key: string, level: number) => {
    e.stopPropagation();
    soundFx.playClick();
    state.setPromptedUpgrade(key, level);
  };

  const handleClick = (type: 'tech' | 'defense' | 'summon') => {
    soundFx.playClick();
    if (type === 'tech') {
      onOpenCitadel('RESEARCH');
    } else if (type === 'defense') {
      onOpenCitadel('CASTLE');
    } else if (type === 'summon') {
      onOpenCitadel('MINIONS');
    }
  };

  return (
    <div className={embedded ? 'flex flex-col gap-2 pointer-events-none' : 'absolute top-20 right-3 md:right-5 z-[9999] flex max-h-[calc(100vh-12rem)] w-[min(18rem,calc(100vw-1.5rem))] flex-col gap-2 overflow-y-auto pointer-events-none'}>
      {allPrompts.map((prompt) => (
        <div 
          key={prompt.key} 
          onClick={() => handleClick(prompt.type)}
          className="pointer-events-auto bg-slate-900/95 border border-slate-700/50 backdrop-blur-md rounded-xl p-3 shadow-2xl w-full relative overflow-hidden group animate-in slide-in-from-right-4 fade-in duration-300 cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <button 
            onClick={(e) => handleDismiss(e, prompt.key, prompt.level)}
            className="absolute top-2 right-2 text-slate-500 hover:text-white transition-colors z-10 p-1"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-2 pr-6">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
              {prompt.currency === 'shards' ? <Zap size={16} /> : <Coins size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-emerald-400 font-bold text-[10px] tracking-wide uppercase truncate">
                {isTL ? 'May Bagong Upgrade!' : 'Enhancement Available'}
              </h3>
              <p className="text-slate-200 mt-0.5 text-xs font-medium leading-tight">
                {prompt.type === 'summon' 
                  ? (isTL ? `Kasyang ipatawag: ${prompt.title} (${prompt.level}/2)` : `Can afford ${prompt.title} (${prompt.level}/2)`)
                  : (isTL ? `Kasyang i-upgrade: ${prompt.title} Lv.${prompt.level}` : `Can afford ${prompt.title} Lv.${prompt.level}`)
                }
              </p>
              <div className="mt-1 text-slate-400 text-[10px] font-mono truncate">
                {isTL ? 'Halaga:' : 'Cost:'} <span className="text-emerald-300 ml-1">{prompt.costDisplay}</span>
              </div>
            </div>
            <div className="shrink-0 text-slate-500 group-hover:text-emerald-400 transition-colors">
              <ArrowRight size={16} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
