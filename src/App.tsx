import React, { useEffect, useState } from 'react';
import { useGameStore } from './state/useGameStore';
import { TitleScreen } from './ui/TitleScreen';
import { IntroNarrativeModal } from './ui/IntroNarrativeModal';
import { GameHUD } from './ui/GameHUD';
import { WelcomeBackModal } from './ui/WelcomeBackModal';
import { GameDialogHost } from './ui/GameDialog';
import { CitadelCommandModal, CitadelTab } from './ui/CitadelCommandModal';
import { AtlasModal, AtlasTab } from './ui/AtlasModal';
import { BestiaryModal } from './ui/BestiaryModal';
import { SettingsDrawer } from './ui/SettingsDrawer';
import { CastleBreachedModal } from './ui/CastleBreachedModal';
import { QuickTradePopover } from './ui/QuickTradePopover';
import { RegressionModal } from './ui/RegressionModal';
import { PhaserGame } from './game/PhaserGame';
import { LoadingScreen } from './ui/LoadingScreen';
import { DifficultyFrame } from './ui/DifficultyFrame';
import { EstablishmentModal } from './ui/EstablishmentModal';
import { ActivityLogTray } from './ui/ActivityLogTray';
import { MusicManagerModal, MusicPlayer, MusicPlayerHost } from './ui/MusicPlayer';
import { BattleItemsToolbar } from './ui/BattleItemsToolbar';
import { startActivityWatcher } from './state/activityWatcher';

export const App: React.FC = () => {
  const difficulty = useGameStore((s) => s.difficulty);
  const {
    screen,
    regressionCount,
    layoutSeed,
    setScreen,
    checkOfflineProgress,
    isRegressionModalOpen,
    openRegressionModal,
    closeRegressionModal,
    selectedEstablishmentId,
    closeEstablishmentModal,
  } = useGameStore();

  const [citadelTab, setCitadelTab] = useState<CitadelTab | null>(null);
  const [isAtlasOpen, setIsAtlasOpen] = useState(false);
  const [atlasInitialSection, setAtlasInitialSection] = useState<AtlasTab>('GUIDE');
  const [isBestiaryOpen, setIsBestiaryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [quickTradeResource, setQuickTradeResource] = useState<
    'aetherShards' | 'wood' | 'stone' | 'arcaneEssence' | 'fish' | 'water' | null
  >(null);

  useEffect(() => {
    if (screen !== 'GAME') {
      setCitadelTab(null);
      setIsAtlasOpen(false);
      setIsBestiaryOpen(false);
      setQuickTradeResource(null);
    }
  }, [screen]);

  // Narrate realm events into the activity log tray
  useEffect(() => startActivityWatcher(), []);

  // Process offline progression when entering game simulation
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
    setScreen('GAME');
  };

  return (
    <main className="pixel-ui relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* Screen-edge frame in the realm's difficulty colour (the story screen shows the one being picked) */}
      {screen !== 'STORY' && <DifficultyFrame difficulty={difficulty} />}
      {/* Screen-edge frame in the realm's difficulty colour (the story screen shows the one being picked) */}
      {screen !== 'STORY' && <DifficultyFrame difficulty={difficulty} />}
      {/* Screen 1: Title Screen (No Atlas button here) */}
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

      {/* Screen 3: Active Simulation */}
      {screen === 'GAME' && (
        <div className="flex w-full h-full overflow-hidden">
          {/* Covers canvas + HUD while the scene and baked art load behind it */}
          <LoadingScreen key={`load-${regressionCount}-${layoutSeed}`} />
          {/* Main Game Screen (Phaser Canvas) */}
          <div className="relative flex-1 h-full min-w-0 overflow-hidden bg-slate-950">
            <PhaserGame key={`${regressionCount}-${layoutSeed}`} />
            <ActivityLogTray />
            <MusicPlayer placement="FLOAT" />
            {/* The one real player: laid over the FLOAT or SIDEBAR slot, never remounted when it moves */}
            <MusicPlayerHost />
          </div>

          {/* Dedicated Right Sidebar HUD */}
          <GameHUD
            onOpenCitadel={(tab) => setCitadelTab(tab || 'MINIONS')}
            onOpenAtlas={(section = 'GUIDE') => {
              setAtlasInitialSection(section);
              setIsAtlasOpen(true);
            }}
            onOpenBestiary={() => {
              setAtlasInitialSection('BESTIARY');
              setIsAtlasOpen(true);
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenSkillTree={() => setCitadelTab('SKILLS')}
            onOpenRegression={() => {
              setAtlasInitialSection('REGRESSION');
              setIsAtlasOpen(true);
            }}
            onOpenQuickTrade={(res) => setQuickTradeResource(res)}
          />

          {/* Modal & Popover Layers */}
          <WelcomeBackModal />

          <CitadelCommandModal
            isOpen={citadelTab !== null}
            onClose={() => setCitadelTab(null)}
            initialTab={citadelTab || 'MINIONS'}
          />

          <EstablishmentModal
            isOpen={selectedEstablishmentId !== null}
            onClose={closeEstablishmentModal}
            selectedId={selectedEstablishmentId}
            onOpenResearch={() => {
              closeEstablishmentModal();
              setCitadelTab('RESEARCH');
            }}
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

          {/* Atlas Knowledge Hub (Guide, Bestiary, Regression, FAQ, Lore) */}
          <AtlasModal
            isOpen={isAtlasOpen}
            onClose={() => setIsAtlasOpen(false)}
            initialSection={atlasInitialSection}
          />

          {isBestiaryOpen && (
            <BestiaryModal
              isOpen={isBestiaryOpen}
              onClose={() => setIsBestiaryOpen(false)}
            />
          )}
        </div>
      )}

      {/* Settings Drawer accessible from both Title and Game */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onReturnToTitle={screen === 'GAME' ? () => setScreen('TITLE') : undefined}
      />

      {/* YouTube / Spotify music library */}
      <MusicManagerModal />

      {/* In-game confirm / alert (native dialogs would drop fullscreen) */}
      <GameDialogHost />
    </main>
  );
};

export default App;