import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/useLanguage';
import { faqTranslations } from '../i18n/faqTranslations';
import type { Language } from '../i18n/faqTranslations';

export const FAQModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [language, setLanguage] = useLanguage();
  const content = faqTranslations[language];

  useEffect(() => { dialog.current?.showModal(); }, []);

  const languages: Language[] = ['EN', 'TL'];

  return (
    <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="faq-title"
      className="m-auto max-h-[85vh] w-[min(36rem,92vw)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl backdrop:bg-black/70">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="faq-title" className="text-lg font-bold text-amber-200">{content.title}</h2>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                aria-pressed={language === lang}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  language === lang
                    ? 'bg-amber-200 text-slate-900'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
          <button autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700">
            {content.close}
          </button>
        </div>
      </div>
      <div className="space-y-5 text-sm leading-relaxed">
        {content.entries.map((entry, i) => (
          <section key={i}>
            <h3 className="font-bold text-white">{entry.question}</h3>
            <p>{entry.answer}</p>
          </section>
        ))}
      </div>
    </dialog>
  );
};