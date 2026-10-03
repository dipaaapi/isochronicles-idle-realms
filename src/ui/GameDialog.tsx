import { useEffect } from 'react';
import { create } from 'zustand';
import { useTranslation } from '../i18n/translations';
import { soundFx } from '../game/audio/soundFx';

/**
 * In-game confirm / alert dialog. Replaces window.confirm / alert, which pull the
 * browser out of fullscreen; this one renders inside the page so fullscreen stays.
 */
interface DialogRequest {
  message: string;
  kind: 'confirm' | 'alert';
  resolve: (ok: boolean) => void;
}

const useDialog = create<{ current: DialogRequest | null }>(() => ({ current: null }));

const open = (message: string, kind: DialogRequest['kind']): Promise<boolean> =>
  new Promise((resolve) => {
    // A newer request replaces an unanswered one (treated as cancelled)
    useDialog.getState().current?.resolve(false);
    useDialog.setState({ current: { message, kind, resolve } });
  });

export const gameConfirm = (message: string): Promise<boolean> => open(message, 'confirm');
export const gameAlert = (message: string): Promise<void> => open(message, 'alert').then(() => undefined);

export function GameDialogHost() {
  const current = useDialog((s) => s.current);
  const { t } = useTranslation();

  const answer = (ok: boolean) => {
    if (!current) return;
    soundFx.playClick();
    useDialog.setState({ current: null });
    current.resolve(ok);
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(current.kind === 'alert');
      else if (e.key === 'Enter') answer(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!current) return null;

  return (
    <div
      className="pixel-ui fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 select-none"
      onClick={() => answer(current.kind === 'alert')}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="pixel-frame w-full max-w-sm bg-slate-900 p-4 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-fantasy mb-3 text-sm text-amber-300">{t('dialogTitle')}</h2>
        <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-slate-200">{current.message}</p>
        <div className="flex justify-end gap-2">
          {current.kind === 'confirm' && (
            <button className="pixel-btn bg-slate-700 px-3 py-1.5 text-xs text-slate-100" onClick={() => answer(false)}>
              {t('dialogCancel')}
            </button>
          )}
          <button
            autoFocus
            className="pixel-btn bg-violet-600 px-3 py-1.5 text-xs text-white"
            onClick={() => answer(true)}
          >
            {current.kind === 'confirm' ? t('dialogConfirm') : t('dialogOk')}
          </button>
        </div>
      </div>
    </div>
  );
}
