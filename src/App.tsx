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

export const App: React.FC = () => {
  const {
    screen,
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
  const [quickTradeResource, setQuickTradeResource] = useState<'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water' | null>(null);

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
      {/* Active Isometric Game Canvas */}
      {screen === 'GAME' && <PhaserGame />}

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
        <IntroNarrativeModal onBegin={handleBeginReconstruction} />
      )}

      {/* Active Game HUD & Overlays */}
      {screen === 'GAME' && (
        <>
          <GameHUD
            onOpenCitadel={(tab) => setCitadelTab(tab || 'MINIONS')}
            onOpenCodex={() => setIsCodexOpen(true)}
            onOpenBestiary={() => setIsBestiaryOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenRegression={openRegressionModal}
            onOpenQuickTrade={(res) => setQuickTradeResource(res)}
          />

          <WelcomeBackModal />

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

        </>
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
