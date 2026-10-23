import React, { useEffect, useState } from 'react';
import { DevPanel } from './ui/DevPanel';
import { DEV_TOOLS } from './state/devMode';
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
import { QuickTradePopover } from './ui/QuickTradePopover';
import { GameOverScreen } from './ui/GameOverScreen';
import { GameCursor } from './ui/GameCursor';
import { loadLegacy } from './state/legacy';
import { PhaserGame } from './game/PhaserGame';
import { LoadingScreen } from './ui/LoadingScreen';
import { LairHud } from './ui/LairHud';
import { gameConfirm } from './ui/GameDialog';
import { t as translate } from './i18n/translations';
import { BiomeFrame } from './ui/BiomeFrame';
import { BattleStatusHud } from './ui/BattleStatusHud';
import { EstablishmentModal } from './ui/EstablishmentModal';
import { ActivityLogTray } from './ui/ActivityLogTray';
import { LiveStreamOverlay } from './ui/LiveStreamOverlay';
import { MusicManagerModal, MusicPlayer, MusicPlayerHost } from './ui/MusicPlayer';
import { BattleItemsToolbar } from './ui/BattleItemsToolbar';
import { startActivityWatcher } from './state/activityWatcher';

export const App: React.FC = () => {
  const difficulty = useGameStore((s) => s.difficulty);
  const activeLocation = useGameStore((s) => s.activeLocation);
  const inLair = activeLocation === 'DRAGONS_LAIR';
  // Set once the player has left the realm this session, so coming home says "Returning"
  const [hasTravelled, setHasTravelled] = useState(false);
  useEffect(() => { if (inLair) setHasTravelled(true); }, [inLair]);
  const {
    screen,
    layoutSeed,
    setScreen,
    checkOfflineProgress,
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

  // Clicking the volcano: confirm, then enter the Dragon's Lair (enterLair logs why it can't)
  useEffect(() => {
    const onCave = async () => {
      const s = useGameStore.getState();
      if (!s.lairOpen || s.invasion.isActive) { s.enterLair(); return; }
      if (await gameConfirm(translate('lairEnterConfirm', s.language))) useGameStore.getState().enterLair();
    };
    window.addEventListener('isochronicle:lair-cave', onCave);
    return () => window.removeEventListener('isochronicle:lair-cave', onCave);
  }, []);

  // Narrate realm events into the activity log tray
  useEffect(() => startActivityWatcher(), []);

  // Hall of Legacy: cache fallen runs (a fallen run's save can't be imported)
  useEffect(() => { void loadLegacy(); }, []);

  // Run clock for the Hall of Legacy: real time played while the realm runs (not paused, tab visible).
  // Saves from before permadeath get a run id the first time they are played.
  useEffect(() => {
    if (screen !== 'GAME') return;
    const s = useGameStore.getState();
    if (!s.runId) s.beginRun(s.lordName);
    const id = window.setInterval(() => {
      const st = useGameStore.getState();
      if (st.gameSpeed > 0 && document.visibilityState === 'visible') st.addPlayTime(5);
    }, 5000);
    return () => window.clearInterval(id);
  }, [screen]);

  // Process offline progression when entering game simulation
  useEffect(() => {
    // Demon Realm time is paused while the lair is active, so no idle payout there
    if (screen === 'GAME' && useGameStore.getState().activeLocation === 'DEMON_REALM') {
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
      {/* The Demon Lord's animated pixel cursor (Settings → Game can turn it off) */}
      <GameCursor />
      {/* Permadeath: the run that just fell, over the title screen */}
      <GameOverScreen onNewRealm={() => setScreen('STORY')} />

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
          <LoadingScreen key={`load-${layoutSeed}-${activeLocation}`} location={activeLocation} returning={hasTravelled && !inLair} />
          {/* Main Game Screen (Phaser Canvas) */}
          <div className="relative flex-1 h-full min-w-0 overflow-hidden bg-slate-950">
            {/* Keyed on the location too: switching disposes one world and boots the other */}
            <PhaserGame key={`${layoutSeed}-${activeLocation}`} location={activeLocation} />
            {inLair ? <LairHud /> : <>
              {/* Frame around the map only, in the biome's style; status + difficulty at its lower right */}
              <BiomeFrame />
              <BattleStatusHud onOpenSettings={() => setIsSettingsOpen(true)} />
              <LiveStreamOverlay />
            </>}
            <ActivityLogTray />
            {DEV_TOOLS && <DevPanel />}
            <MusicPlayer placement="FLOAT" />
            {/* The one real player: laid over the FLOAT or SIDEBAR slot, never remounted when it moves */}
            <MusicPlayerHost />
          </div>

          {/* Dedicated Right Sidebar HUD (Demon Realm only: its actions drive that world) */}
          {!inLair && <GameHUD
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
            onOpenQuickTrade={(res) => setQuickTradeResource(res)}
          />}

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


          {quickTradeResource && (
            <QuickTradePopover
              resourceKey={quickTradeResource}
              onClose={() => setQuickTradeResource(null)}
            />
          )}

          {/* Atlas Knowledge Hub (Guide, Bestiary, Hall of Legacy, FAQ, Lore) */}
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

      {/* YouTube music library */}
      <MusicManagerModal />

      {/* In-game confirm / alert (native dialogs would drop fullscreen) */}
      <GameDialogHost />
    </main>
  );
};

export default App;