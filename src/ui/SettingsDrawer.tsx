import React, { useRef, useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { soundFx } from '../game/audio/soundFx';
import loreMarkdown from '../../LORE.md?raw';
import {
  X,
  Download,
  Upload,
  Trash2,
  Home,
  Database,
  Volume2,
  VolumeX,
  Info,
  Layers,
  Sparkles,
  Sliders,
  Shield,
  Zap,
  Droplet,
  Grid3X3,
} from 'lucide-react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReturnToTitle?: () => void;
}

const loreSections = loreMarkdown
  .split(/\n(?=## )/)
  .map((section) => {
    const [heading, ...body] = section.trim().split('\n');
    return {
      heading: heading.replace(/^##\s*/, ''),
      body: body.join(' ').replace(/\*\*/g, ''),
    };
  })
  .filter((section) => section.heading && section.body);

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onReturnToTitle,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTab, setCurrentTab] = useState<'AUDIO' | 'SAVE' | 'LORE' | 'CREDITS'>('AUDIO');
  const {
    language,
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

  const handleExport = () => {
    soundFx.playClick();
    const jsonString = exportSave();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isochronicle_realm_${new Date().toISOString().slice(0, 10)}.json`;
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
      if (content) {
        const success = importSave(content);
        if (success) {
          alert('Realm successfully restored!');
          onClose();
        } else {
          alert('Failed to parse save file. Please ensure it is a valid IsoChronicle JSON export.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (
      window.confirm(
        'Reset all realm progress permanently? This erases buildings, minions, resources, upgrades, achievements, and regression history, and returns to Day 1, Year 1, Wave 1, Phase 1.'
      )
    ) {
      resetRealm();
      onClose();
      if (onReturnToTitle) onReturnToTitle();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm select-none pointer-events-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md h-full bg-slate-950/95 border-l border-sky-500/30 p-6 flex flex-col justify-between shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Top Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <Sliders className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-fantasy font-bold text-white tracking-wide">
                System & Realm Settings
              </h2>
            </div>
            <button
              onClick={() => {
                soundFx.playClick();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 mb-5 text-[11px] font-fantasy font-bold">
            <button
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('AUDIO');
              }}
              className={`py-2 rounded-lg transition-all ${
                currentTab === 'AUDIO'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {language === 'TL' ? 'Mga Opsyon' : 'Options'}
            </button>
            <button
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('SAVE');
              }}
              className={`py-2 rounded-lg transition-all ${
                currentTab === 'SAVE'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {language === 'TL' ? 'Save Data' : 'Save Data'}
            </button>
            <button
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('LORE');
              }}
              className={`py-2 rounded-lg transition-all ${
                currentTab === 'LORE'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {language === 'TL' ? 'Kuwento' : 'Lore'}
            </button>
            <button
              onClick={() => {
                soundFx.playClick();
                setCurrentTab('CREDITS');
              }}
              className={`py-2 rounded-lg transition-all ${
                currentTab === 'CREDITS'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {language === 'TL' ? 'Teknolohiya' : 'Tech Stack'}
            </button>
          </div>

          {/* Tab 1: Audio & Automation Controls */}
          {currentTab === 'AUDIO' && (
            <div className="space-y-4">
              {/* Sound Audio Toggle */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                    {isAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-xs font-fantasy font-bold text-white">
                      {language === 'TL' ? 'Tunog ng Laro' : 'Synthesized Audio'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'TL' ? 'Mga procedural na tunog gawa ng Web Audio API' : 'Pure Web Audio API procedural sounds'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    toggleAudioMute();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    isAudioMuted
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {isAudioMuted 
                    ? (language === 'TL' ? 'NAKA-MUTE' : 'MUTED') 
                    : (language === 'TL' ? 'NAKA-ON' : 'ACTIVE')}
                </button>
              </div>

              {/* Gore Effect Toggle */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
                    <Droplet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-fantasy font-bold text-white">
                      {language === 'TL' ? 'Dugo at Gore (Violence)' : 'Gore & Blood Effects'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'TL' ? 'Ipakita ang dugo kapag nasaktan o namatay ang nilalang' : 'Show red particles when units take damage or die'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    toggleGore();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    !isGoreEnabled
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}
                >
                  {isGoreEnabled 
                    ? (language === 'TL' ? 'NAKA-ON' : 'ON') 
                    : (language === 'TL' ? 'NAKA-OFF' : 'OFF')}
                </button>
              </div>

              {/* Graphics / FPS Limit Toggle */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-fantasy font-bold text-white">
                      {language === 'TL' ? 'Grapiko at FPS Limit' : 'Graphics & FPS Limit'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'TL' ? 'Mas mataas na FPS ay mas maganda pero mas mabilis maubos baterya' : 'Higher FPS scales visual effects but drains battery faster'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 w-full mt-1">
                  {[30, 60, 90].map((fps) => {
                    const isActive = useGameStore.getState().targetFps === fps;
                    return (
                      <button
                        key={fps}
                        onClick={() => {
                          soundFx.playClick();
                          useGameStore.getState().setTargetFps(fps as 30|60|90);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                          isActive
                            ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {fps} FPS
                      </button>
                    );
                  })}
                </div>

                {/* FPS Debug Overlay Toggle */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60">
                  <div>
                    <div className="text-xs font-medium text-slate-300">
                      {language === 'TL' ? 'Ipakita ang FPS Debug' : 'Show FPS Debug Overlay'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {showFpsDebug
                        ? `Live: ${measuredFps} FPS (target ${targetFps})`
                        : (language === 'TL' ? 'In-game na panel ng frame rate at kalidad' : 'In-game frame rate & quality panel')}
                    </div>
                  </div>
                  <button
                    id="toggle-fps-debug-btn"
                    onClick={() => { soundFx.playClick(); toggleFpsDebug(); }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                      showFpsDebug
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(52,211,153,0.25)]'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {showFpsDebug ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Automation / Sub-Auto Toggles */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-cyan-500/20 p-2 text-cyan-400">
                      <Grid3X3 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-fantasy font-bold text-white">
                        {language === 'TL' ? 'Numero ng Tile' : 'Tile Coordinates'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {language === 'TL' ? 'Ipakita ang X,Y number sa bawat tile para makita ang tamang building location' : 'Show X,Y numbers on every tile to verify building placement'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { soundFx.playClick(); toggleTileCoordinates(); }}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-mono font-bold transition-all ${
                      showTileCoordinates
                        ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                        : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {showTileCoordinates ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Automation / Sub-Auto Toggles */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="text-xs font-fantasy font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>{language === 'TL' ? 'Mga Otomatikong Pagsunod' : 'Automation Subroutines'}</span>
                </div>

                {/* Auto Dispatch */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <div>
                    <div className="text-xs font-medium text-slate-200">
                      {language === 'TL' ? 'Kusang Pagpapatrabaho' : 'Auto Task Dispatch'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'TL' ? 'Pinapadala ang mga nakatenggang alagad sa iba\'t-ibang yaman' : 'Distributes idle units across all nodes'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      toggleAutoSetting('autoDispatch');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                      autoSettings.autoDispatch
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {autoSettings.autoDispatch 
                      ? (language === 'TL' ? 'NAKA-ON' : 'ACTIVE') 
                      : (language === 'TL' ? 'NAKA-OFF' : 'INACTIVE')}
                  </button>
                </div>

                {/* Auto Defend */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <div>
                    <div className="text-xs font-medium text-slate-200">Auto Defend & Engage</div>
                    <div className="text-[10px] text-slate-400">Armed golems intercept invading shades</div>
                  </div>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      toggleAutoSetting('autoDefend');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                      autoSettings.autoDefend
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {autoSettings.autoDefend ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Auto Evolve Slime & Ent */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <div>
                    <div className="text-xs font-medium text-slate-200">
                      {language === 'TL' ? 'Kusang Pag-evolve (Slime at Ent)' : 'Auto Evolve (Slime & Ent)'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'TL' ? 'Kusang mag-e-evolve ang Slime at Ent kapag sapat ang yaman' : 'Automatically evolves Support Slime and Treant when resources allow'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      toggleAutoSetting('autoEvolve');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                      autoSettings.autoEvolve
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {autoSettings.autoEvolve 
                      ? (language === 'TL' ? 'NAKA-ON' : 'ACTIVE') 
                      : (language === 'TL' ? 'NAKA-OFF' : 'INACTIVE')}
                  </button>
                </div>


              </div>
            </div>
          )}

          {/* Tab 2: Save Management */}
          {currentTab === 'SAVE' && (
            <div className="space-y-3">
              <button
                onClick={handleExport}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-sky-500/30 bg-sky-950/20 hover:bg-sky-950/40 text-sky-200 transition-all text-xs font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4 text-sky-400" />
                <div className="flex flex-col text-left">
                  <span>Export Save (.json)</span>
                  <span className="text-[10px] text-slate-400">Download backup to local host machine</span>
                </div>
              </button>

              <button
                onClick={() => {
                  soundFx.playClick();
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800 text-slate-200 transition-all text-xs font-semibold cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                <div className="flex flex-col text-left">
                  <span>Import Save (.json)</span>
                  <span className="text-[10px] text-slate-400">Restore existing realm JSON file</span>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />

              {onReturnToTitle && (
                <button
                  onClick={() => {
                    soundFx.playClick();
                    onClose();
                    onReturnToTitle();
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800 text-slate-300 transition-all text-xs font-semibold cursor-pointer"
                >
                  <Home className="w-4 h-4 text-slate-400" />
                  <div className="flex flex-col text-left">
                    <span>Return to Title Screen</span>
                    <span className="text-[10px] text-slate-400">Realm state remains active in browser</span>
                  </div>
                </button>
              )}

              <div className="pt-4 border-t border-slate-800">
                <button
                  onClick={handleReset}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 transition-all text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <div className="flex flex-col text-left">
                    <span>Reset Floating Realm</span>
                    <span className="text-[10px] text-rose-400/80">Erase all progress, including days, waves and regressions</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Lore */}
          {currentTab === 'LORE' && (
            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed max-h-[55vh] overflow-y-auto pr-1">
              {loreSections.map((section, index) => (
                <div key={section.heading} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5">
                  <h3 className={`mb-1 font-fantasy text-sm font-bold ${index % 2 === 0 ? 'text-sky-300' : 'text-amber-300'}`}>
                    {section.heading}
                  </h3>
                  <p className="text-[11px] text-slate-400">{section.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tab 4: Credits & Tech Stack */}
          {currentTab === 'CREDITS' && (
            <div className="space-y-3 text-xs text-slate-300 max-h-[55vh] overflow-y-auto pr-1">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="font-fantasy font-bold text-sm text-white mb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Architecture & Engine</span>
                </div>
                <ul className="space-y-1.5 text-[11px] font-mono text-slate-400">
                  <li>&bull; <span className="text-white">Phaser 3.80:</span> 2.5D Isometric Rendering Engine</li>
                  <li>&bull; <span className="text-white">React 18:</span> HUD, Modals & UI Reactive Layer</li>
                  <li>&bull; <span className="text-white">TypeScript:</span> Type-safe Simulation Models</li>
                  <li>&bull; <span className="text-white">Tailwind CSS:</span> Glassmorphic Aetherpunk styling</li>
                  <li>&bull; <span className="text-white">Web Audio API:</span> 100% Offline synthesized procedural SFX</li>
                  <li>&bull; <span className="text-white">Docker Compose:</span> Zero-host install sandbox environment</li>
                  <li>&bull; <span className="text-white">IndexedDB / LocalStorage:</span> Local-first persistence</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
                <span className="text-sky-300 font-bold">100% Offline & Standalone:</span> No cloud, telemetry, or external asset dependencies.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>IsoChronicle v1.3.0</span>
          <span>Offline Local-First</span>
        </div>
      </div>
    </div>
  );
};
