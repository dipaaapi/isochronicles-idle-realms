import React, { useRef, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import {
  X,
  Download,
  Upload,
  Trash2,
  Home,
  Volume2,
  Languages,
  Globe,
  VolumeX,
  Layers,
  Sparkles,
  Sliders,
  Zap,
  Droplet,
  Grid3X3,
  Save,
  Code2,
  User,
} from 'lucide-react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReturnToTitle?: () => void;
}

// Declared at module scope: defining it inside SettingsDrawer made React remount
// the row (and its button) on every store tick, swallowing clicks mid-press.
const SettingRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ icon, title, description, children }) => (
  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
    <div className="flex min-w-0 items-center gap-3">
      <div className="shrink-0 rounded-xl bg-slate-800/80 p-2 text-sky-400">
        {icon}
      </div>

      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-100">{title}</div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
          {description}
        </div>
      </div>
    </div>

    <div className="shrink-0">{children}</div>
  </div>
);

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onReturnToTitle,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTab, setCurrentTab] = useState<'GAME' | 'SAVE' | 'CREDITS'>('GAME');

  const {
    language,
    setLanguage,
    isAudioMuted,
    toggleAudioMute,
    isGoreEnabled,
    toggleGore,
    autoSettings,
    toggleAutoSetting,
    exportSave,
    importSave,
    resetRealm,
    showFpsDebug,
    toggleFpsDebug,
    showTileCoordinates,
    toggleTileCoordinates,
    measuredFps,
    targetFps,
  } = useGameStore();

  if (!isOpen) return null;

  const isTL = language === 'TL';

  const handleExport = () => {
    soundFx.playClick();

    const jsonString = exportSave();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `isochronicle_realm_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;

      if (!content) return;

      const success = importSave(content);

      if (success) {
        alert(
          isTL
            ? 'Matagumpay na na-restore ang Realm!'
            : 'Realm successfully restored!'
        );

        onClose();
      } else {
        alert(
          isTL
            ? 'Hindi mabasa ang save file. Siguraduhing valid na IsoChronicle JSON file ito.'
            : 'Failed to read the save file. Please select a valid IsoChronicle JSON export.'
        );
      }
    };

    reader.readAsText(file);

    // Allows the same file to be selected again later.
    e.target.value = '';
  };

  const handleReset = () => {
    const confirmed = window.confirm(
      isTL
        ? 'Ire-reset ang buong Realm at mabubura ang lahat ng progress, buildings, minions, resources, upgrades, achievements, days, waves, at regression history. Hindi na ito maibabalik. Ituloy?'
        : 'This will permanently erase your entire Realm progress, including buildings, minions, resources, upgrades, achievements, days, waves, and regression history. This cannot be undone. Continue?'
    );

    if (!confirmed) return;

    soundFx.playClick();
    resetRealm();
    onClose();

    if (onReturnToTitle) {
      onReturnToTitle();
    }
  };

  const tabs = [
    {
      id: 'GAME' as const,
      label: isTL ? 'Laro' : 'Game',
      icon: Sliders,
    },
    {
      id: 'SAVE' as const,
      label: isTL ? 'Save' : 'Save',
      icon: Save,
    },
    {
      id: 'CREDITS' as const,
      label: 'Credits',
      icon: Code2,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm select-none pointer-events-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-sky-500/30 bg-slate-950/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-800 px-5 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-sky-500/15 p-2 text-sky-400">
                <Sliders className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-fantasy text-base font-bold tracking-wide text-white">
                  {isTL ? 'Mga Setting' : 'Settings'}
                </h2>
                <p className="text-[10px] text-slate-500">
                  {isTL
                    ? 'Ayusin ang laro ayon sa gusto mo.'
                    : 'Customize your game experience.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                soundFx.playClick();
                onClose();
              }}
              className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label={isTL ? 'Isara' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tab navigation (3 tabs: Game, Save, Credits) */}
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = currentTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundFx.playClick();
                    setCurrentTab(tab.id);
                  }}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[9px] font-bold transition-all ${
                    active
                      ? 'border border-sky-500/40 bg-sky-500/15 text-sky-300'
                      : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* GAME TAB */}
          {currentTab === 'GAME' && (
            <div className="space-y-5">
              {/* Language Selection */}
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Languages className="h-3.5 w-3.5 text-sky-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isTL ? 'Wika at Salin' : 'Language & Translation'}
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 rounded-xl bg-sky-500/15 p-2 text-sky-400">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-100">
                          {isTL ? 'Pangunahing Wika' : 'Display Language'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {isTL
                            ? 'Pumili sa pagitan ng English at Tagalog para sa buong laro.'
                            : 'Choose between English and Tagalog globally across all screens and HUD.'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setLanguage('EN');
                      }}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all border ${
                        !isTL
                          ? 'border-sky-500/60 bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                          : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base">🇺🇸</span>
                      <span>English</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        setLanguage('TL');
                      }}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all border ${
                        isTL
                          ? 'border-sky-500/60 bg-sky-500/20 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                          : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base">🇵🇭</span>
                      <span>Tagalog</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Audio & Visuals */}
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Volume2 className="h-3.5 w-3.5 text-sky-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isTL ? 'Audio at Visuals' : 'Audio & Visuals'}
                  </h3>
                </div>

                <div className="space-y-2">
                  <SettingRow
                    icon={
                      isAudioMuted ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )
                    }
                    title={isTL ? 'Tunog ng Laro' : 'Game Sound Effects'}
                    description={
                      isTL
                        ? 'I-on o i-mute ang game sounds at background music.'
                        : 'Turn game sounds and music on or off.'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        toggleAudioMute();
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                        isAudioMuted
                          ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                          : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {isAudioMuted ? (isTL ? 'MUTE' : 'MUTED') : 'ON'}
                    </button>
                  </SettingRow>

                  <SettingRow
                    icon={<Droplet className="h-4 w-4" />}
                    title={isTL ? 'Dugo at Gore' : 'Blood & Gore Effects'}
                    description={
                      isTL
                        ? 'Ipakita ang blood effects kapag may damage o death.'
                        : 'Show blood particles when units take damage or die.'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        toggleGore();
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                        isGoreEnabled
                          ? 'border-red-500/40 bg-red-500/20 text-red-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isGoreEnabled ? 'ON' : 'OFF'}
                    </button>
                  </SettingRow>
                </div>
              </section>

              {/* Performance */}
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isTL ? 'Performance' : 'Performance'}
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-purple-500/15 p-2 text-purple-400">
                      <Sparkles className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100">
                        {isTL ? 'Graphics & FPS' : 'Graphics & Target FPS'}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                        {isTL
                          ? 'Pumili ng frame rate. Mas mataas ay mas smooth ngunit maaaring mas mabigat sa device.'
                          : 'Choose your target frame rate. Higher FPS is smoother.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[30, 60, 90].map((fps) => {
                      const isActive = targetFps === fps;

                      return (
                        <button
                          key={fps}
                          type="button"
                          onClick={() => {
                            soundFx.playClick();
                            useGameStore
                              .getState()
                              .setTargetFps(fps as 30 | 60 | 90);
                          }}
                          className={`rounded-lg py-2 text-xs font-mono font-bold transition-all ${
                            isActive
                              ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {fps} FPS
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-3">
                    <div>
                      <div className="text-xs font-medium text-slate-200">
                        {isTL ? 'FPS Debug' : 'FPS Debug Overlay'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {showFpsDebug
                          ? `Live: ${measuredFps} FPS · Target: ${targetFps}`
                          : isTL
                          ? 'Ipakita ang live FPS information sa game.'
                          : 'Show live FPS information on screen.'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        toggleFpsDebug();
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                        showFpsDebug
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {showFpsDebug ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <SettingRow
                    icon={<Grid3X3 className="h-4 w-4" />}
                    title={isTL ? 'Tile Coordinates' : 'Tile Coordinates'}
                    description={
                      isTL
                        ? 'Ipakita ang chessboard labels (A1–J10) sa bawat tile ng mapa.'
                        : 'Display chessboard coordinates (A1–J10) on every tile.'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.playClick();
                        toggleTileCoordinates();
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                        showTileCoordinates
                          ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {showTileCoordinates ? 'ON' : 'OFF'}
                    </button>
                  </SettingRow>
                </div>
              </section>

              {/* Automation */}
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isTL ? 'Automation' : 'Automation'}
                  </h3>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
                  <p className="mb-3 text-[10px] leading-relaxed text-slate-500">
                    {isTL
                      ? 'Kapag naka-ON, awtomatikong gagawa ng mga routine task ang iyong Realm.'
                      : 'When enabled, the game automatically handles routine background tasks.'}
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200">
                          {isTL ? 'Auto Task Dispatch' : 'Auto Task Dispatch'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {isTL
                            ? 'I-distribute ang idle units sa available resource nodes.'
                            : 'Distribute idle units across available resource nodes.'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          toggleAutoSetting('autoDispatch');
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                          autoSettings.autoDispatch
                            ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {autoSettings.autoDispatch ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 pb-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200">
                          {isTL ? 'Auto Defend' : 'Auto Defend & Engage'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {isTL
                            ? 'Awtomatikong haharap ang armed units sa invading crusaders.'
                            : 'Armed units automatically intercept invading crusaders.'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          toggleAutoSetting('autoDefend');
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                          autoSettings.autoDefend
                            ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {autoSettings.autoDefend ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200">
                          {isTL
                            ? 'Auto Evolve'
                            : 'Auto Evolve (Slime & Ent)'}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {isTL
                            ? 'Awtomatikong mag-evolve kapag sapat ang resources.'
                            : 'Automatically evolve Support Slime and Treant when materials allow.'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playClick();
                          toggleAutoSetting('autoEvolve');
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                          autoSettings.autoEvolve
                            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                            : 'border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {autoSettings.autoEvolve ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* SAVE TAB */}
          {currentTab === 'SAVE' && (
            <div className="space-y-4">
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Save className="h-3.5 w-3.5 text-sky-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    {isTL ? 'Pamamahala ng Save File' : 'Save Management'}
                  </h3>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex w-full items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5 text-left transition-all hover:bg-sky-950/40 cursor-pointer"
                  >
                    <div className="rounded-lg bg-sky-500/15 p-2 text-sky-400">
                      <Download className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-sky-100">
                        {isTL ? 'I-download ang Save' : 'Export Save File'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {isTL
                          ? 'Gumawa ng .json backup file ng iyong Realm.'
                          : 'Create a downloadable .json backup of your Realm.'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playClick();
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-left transition-all hover:bg-slate-800 cursor-pointer"
                  >
                    <div className="rounded-lg bg-slate-800 p-2 text-slate-300">
                      <Upload className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-200">
                        {isTL ? 'I-restore ang Save' : 'Import Save File'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {isTL
                          ? 'Mag-load ng dating .json Realm backup file.'
                          : 'Load an existing .json Realm backup file.'}
                      </div>
                    </div>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
              </section>

              {onReturnToTitle && (
                <section className="border-t border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playClick();
                      onClose();
                      onReturnToTitle();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-left transition-all hover:bg-slate-800 cursor-pointer"
                  >
                    <div className="rounded-lg bg-slate-800 p-2 text-slate-400">
                      <Home className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        {isTL ? 'Bumalik sa Title Screen' : 'Return to Title Screen'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {isTL
                          ? 'Mananatili ang current Realm state sa browser.'
                          : 'Your current Realm progress remains saved in browser storage.'}
                      </div>
                    </div>
                  </button>
                </section>
              )}

              <section className="border-t border-slate-800 pt-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-rose-400/70">
                  {isTL ? 'Danger Zone' : 'Danger Zone'}
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="flex w-full items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-left text-rose-300 transition-all hover:bg-rose-950/40 cursor-pointer"
                >
                  <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </div>

                  <div>
                    <div className="text-xs font-semibold">
                      {isTL ? 'I-reset ang Realm' : 'Reset Realm Progress'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-rose-400/70">
                      {isTL
                        ? 'Permanenteng buburahin ang lahat ng progress.'
                        : 'Permanently erase all progress, buildings, and history.'}
                    </div>
                  </div>
                </button>
              </section>
            </div>
          )}

          {/* CREDITS TAB */}
          {currentTab === 'CREDITS' && (
            <div className="space-y-4">
              {/* Creator */}
              <section className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/40 to-slate-900/80 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-500/15 p-3 text-sky-300">
                    <User className="h-6 w-6" />
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400">
                      {isTL ? 'Gumawa ng Laro' : 'Creator & Developer'}
                    </div>

                    <h3 className="mt-1 font-fantasy text-xl font-bold text-white">
                      EdMaster28
                    </h3>

                    <p className="text-xs text-slate-400">
                      Software Engineer · Philippines
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-sky-500/10 bg-black/20 p-3">
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    {isTL
                      ? 'Ang codebase at game system na ito ay ginawa ni EdMaster28. Salamat sa paglalaro at pag-explore ng IsoChronicle.'
                      : 'This codebase and game system were created by EdMaster28. Thank you for playing and exploring IsoChronicle.'}
                  </p>
                </div>
              </section>

              {/* Tech Stack */}
              <section>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Layers className="h-3.5 w-3.5 text-sky-400" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Tech Stack
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300 font-mono">
                    <span className="text-sky-400 font-bold">Phaser 3</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Isometric 2.5D Canvas Engine</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300 font-mono">
                    <span className="text-indigo-400 font-bold">React 19 + Vite</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Modular HUD & UI Overlays</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300 font-mono">
                    <span className="text-emerald-400 font-bold">Zustand</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">State & Local Persistence</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300 font-mono">
                    <span className="text-amber-400 font-bold">EasyStar.js</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">A* Grid Pathfinding</p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
