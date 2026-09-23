import React, { useEffect, useState } from 'react';
import { useGameStore } from './state/useGameStore';
import { TitleScreen } from './ui/TitleScreen';
import { IntroNarrativeModal } from './ui/IntroNarrativeModal';
import { GameHUD } from './ui/GameHUD';
import { WelcomeBackModal } from './ui/WelcomeBackModal';
import { CitadelCommandModal, CitadelTab } from './ui/CitadelCommandModal';
import { CodexModal } from './ui/CodexModal';
import { BestiaryModal } from './ui/BestiaryModal';
import { SettingsDrawer } from './ui/SettingsDrawer';
import { CastleBreachedModal } from './ui/CastleBreachedModal';
import { QuickTradePopover } from './ui/QuickTradePopover';
import { RegressionModal } from './ui/RegressionModal';
import { PhaserGame } from './game/PhaserGame';
import { FAQModal } from './ui/FAQModal';
import { SkillTreeModal } from './ui/SkillTreeModal';

export const App: React.FC = () => {
  const {
    screen,
    regressionCount,
    setScreen,
    completeIntro,
    checkOfflineProgress,
    isRegressionModalOpen,
    openRegressionModal,
    closeRegressionModal,
  } = useGameStore();

  const [citadelTab, setCitadelTab] = useState<CitadelTab | null>(null);
  const [isCodexOpen, setIsCodexOpen] = useState(false);
  const [isBestiaryOpen, setIsBestiaryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFAQOpen, setIsFAQOpen] = useState(false);
  const [isSkillTreeOpen, setIsSkillTreeOpen] = useState(false);
  const [quickTradeResource, setQuickTradeResource] = useState<
    'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water' | null
  >(null);

  useEffect(() => {
    if (screen !== 'GAME') {
      setCitadelTab(null);
      setIsCodexOpen(false);
      setIsBestiaryOpen(false);
      setIsFAQOpen(false);
      setIsSkillTreeOpen(false);
      setQuickTradeResource(null);
    }
  }, [screen]);

  // Check offline progression when landing in the active simulation
  useEffect(() => {
    if (screen === 'GAME') {
      checkOfflineProgress();
    }
  }, [screen, checkOfflineProgress]);

  const handleStartNewRealm = () => {
    setScreen('STORY');
  };

  const handleContinueRealm = () => {
    setScreen('GAME');
  };

  const handleBeginReconstruction = () => {
    completeIntro();
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* Screen 1: Title Screen */}
      {screen === 'TITLE' && (
        <TitleScreen
          onStartNewRealm={handleStartNewRealm}
          onContinueRealm={handleContinueRealm}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {/* Screen 2: Narrative Briefing Cutscene */}
      {screen === 'STORY' && (
        <IntroNarrativeModal
          onBegin={handleBeginReconstruction}
          onCancel={() => setScreen('TITLE')}
        />
      )}

      {/* Screen 3: Active Simulation (Flex layout: Canvas sa kaliwa, HUD Sidebar sa kanan) */}
      {screen === 'GAME' && (
        <div className="flex w-full h-full overflow-hidden">
          {/* Main Game Screen (Phaser Canvas) */}
          <div className="relative flex-1 h-full min-w-0 overflow-hidden bg-slate-950">
            <PhaserGame key={regressionCount} />
          </div>

          {/* Dedicated Right Sidebar HUD */}
          <GameHUD
            onOpenCitadel={(tab) => setCitadelTab(tab || 'MINIONS')}
            onOpenCodex={() => setIsCodexOpen(true)}
            onOpenBestiary={() => setIsBestiaryOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenFAQ={() => setIsFAQOpen(true)}
            onOpenSkillTree={() => setIsSkillTreeOpen(true)}
            onOpenRegression={openRegressionModal}
            onOpenQuickTrade={(res) => setQuickTradeResource(res)}
          />

          {/* Modal & Popover Layers */}
          <WelcomeBackModal />
          {isFAQOpen && <FAQModal onClose={() => setIsFAQOpen(false)} />}
          {isSkillTreeOpen && <SkillTreeModal onClose={() => setIsSkillTreeOpen(false)} />}

          <CitadelCommandModal
            isOpen={citadelTab !== null}
            onClose={() => setCitadelTab(null)}
            initialTab={citadelTab || 'MINIONS'}
          />

          <CastleBreachedModal />

          {isRegressionModalOpen && (
            <RegressionModal onClose={closeRegressionModal} />
          )}

          {quickTradeResource && (
            <QuickTradePopover
              resourceKey={quickTradeResource}
              onClose={() => setQuickTradeResource(null)}
            />
          )}

          <CodexModal
            isOpen={isCodexOpen}
            onClose={() => setIsCodexOpen(false)}
          />

          <BestiaryModal
            isOpen={isBestiaryOpen}
            onClose={() => setIsBestiaryOpen(false)}
          />
        </div>
      )}

      {/* Settings Drawer accessible from both Title and Game */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onReturnToTitle={screen === 'GAME' ? () => setScreen('TITLE') : undefined}
      />
    </main>
  );
};

export default App;