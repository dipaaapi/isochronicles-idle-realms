import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/translations';
import { useProfile, imageFileToAvatar, type Avatar } from '../state/playerProfile';
import { BEAST_PORTRAITS } from '../game/bestiaryPortraits';
import { UNIT_CLASSES } from '../types/game';
import ICONS from '../data/profileIcons.json';
import { soundFx } from '../game/audio/soundFx';
import { ProfileAvatar } from './ProfileAvatar';
import { HallOfLegacy } from './HallOfLegacy';

type Pick = 'UPLOAD' | 'ICON' | 'GENERAL' | 'NONE';

/** Generals with a portrait, for the avatar picker. */
const GENERALS = (Object.keys(UNIT_CLASSES) as Array<keyof typeof UNIT_CLASSES>).filter((c) => BEAST_PORTRAITS[c]);

/** Name + avatar editor (all optional). */
function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState<Avatar>(profile.avatar);
  const [tab, setTab] = useState<Pick>(profile.avatar.kind === 'image' ? 'UPLOAD' : profile.avatar.kind === 'general' ? 'GENERAL' : profile.avatar.kind === 'icon' ? 'ICON' : 'NONE');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    try { setAvatar(await imageFileToAvatar(file)); setError(''); }
    catch { setError(t('profileImageError')); }
  };

  const tabs: Array<[Pick, string]> = [['UPLOAD', `📷 ${t('profileUpload')}`], ['ICON', `😈 ${t('profileIcon')}`], ['GENERAL', `👑 ${t('profileGeneral')}`], ['NONE', `👤 ${t('profileNone')}`]];

  return (
    <div className="pixel-frame bg-slate-900 p-3 space-y-3">
      <div className="flex items-center gap-3">
        <ProfileAvatar avatar={avatar} size={64} />
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('profileName')}</label>
          <input
            value={name}
            maxLength={32}
            placeholder={t('profileNamePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border-2 border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-amber-100 outline-none focus:border-amber-500"
          />
          <p className="mt-1 text-[10px] text-slate-500">{t('profileOptional')}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button"
            onClick={() => { soundFx.playClick(); setTab(id); if (id === 'NONE') setAvatar({ kind: 'none' }); if (id === 'UPLOAD') fileRef.current?.click(); }}
            className={`px-1 py-1.5 text-[10px] font-bold cursor-pointer ${tab === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />

      {tab === 'UPLOAD' && (
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full bg-slate-800 px-2 py-3 text-xs text-slate-300 cursor-pointer">
          📷 {t('profileUploadHint')}
        </button>
      )}
      {tab === 'ICON' && (
        <div className="grid grid-cols-8 gap-1">
          {ICONS.icons.map((icon) => (
            <button key={icon} type="button" onClick={() => setAvatar({ kind: 'icon', icon })}
              className={`aspect-square text-xl cursor-pointer ${avatar.kind === 'icon' && avatar.icon === icon ? 'bg-amber-500' : 'bg-slate-800'}`}>{icon}</button>
          ))}
        </div>
      )}
      {tab === 'GENERAL' && (
        <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto">
          {GENERALS.map((cls) => (
            <button key={cls} type="button" title={UNIT_CLASSES[cls].nameEn} onClick={() => setAvatar({ kind: 'general', unitClass: cls })}
              className={`aspect-square p-0.5 cursor-pointer ${avatar.kind === 'general' && avatar.unitClass === cls ? 'bg-amber-500' : 'bg-slate-800'}`}>
              <img src={BEAST_PORTRAITS[cls]} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 cursor-pointer">{t('profileCancel')}</button>
        <button type="button" onClick={() => { soundFx.playUpgrade(); profile.save({ name, avatar }); onDone(); }}
          className="bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer">{t('profileSave')}</button>
      </div>
    </div>
  );
}

/**
 * Leaderboard (title screen): the player's profile card and the Hall of Legacy.
 * Works with no realm save at all.
 */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const profile = useProfile();
  const [editing, setEditing] = useState(false);

  return (
    <div className="pixel-ui game-backdrop fixed inset-0 z-[260] flex items-center justify-center bg-black/80 p-4 select-none" onClick={onClose}>
      <div className="game-modal pixel-frame relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-stone-950 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-black text-amber-300">🏆 {t('legacyTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('profileCancel')} className="p-1.5 text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {editing ? (
          <ProfileEditor onDone={() => setEditing(false)} />
        ) : (
          <div className="pixel-frame bg-slate-900 p-3 flex items-center gap-3">
            <ProfileAvatar avatar={profile.avatar} size={48} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate">{profile.name || t('profileAnonymous')}</div>
              <div className="text-[10px] text-slate-400">{t('profileCardHint')}</div>
            </div>
            <button type="button" onClick={() => { soundFx.playClick(); setEditing(true); }} className="bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer">
              ✏️ {t('profileEdit')}
            </button>
          </div>
        )}

        <HallOfLegacy />
        <p className="text-[10px] text-slate-500">{t('legacyLocalNote')}</p>
      </div>
    </div>
  );
}
