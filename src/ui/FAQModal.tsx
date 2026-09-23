import React, { useEffect, useRef } from 'react';

export const FAQModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="faq-title"
      className="m-auto max-h-[85vh] w-[min(36rem,92vw)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl backdrop:bg-black/70">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="faq-title" className="text-lg font-bold text-amber-200">Gameplay FAQ</h2>
        <button autoFocus onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 hover:bg-slate-700">Close</button>
      </div>
      <div className="space-y-5 text-sm leading-relaxed">
        <section><h3 className="font-bold text-white">Who builds the castle and buildings?</h3>
          <p>The starting Slime summons the Ent. The Ent automatically builds the castle, Wood Grove, Stone Quarry, Metal Mine and Water Port in that order. It walks to each site and builds when you have enough resources. You do not need to click a build button.</p></section>
        <section><h3 className="font-bold text-white">How do I get supplies before construction?</h3>
          <p>Random scouts arrive between waves. Click them to defeat them and receive random amounts of wood, stone, aether shards and coins directly in your resources. The Ent waits if supplies are missing.</p></section>
        <section><h3 className="font-bold text-white">When do minions and waves unlock?</h3>
          <p>Build the castle and all four resource buildings at level 1. Minion recruitment then unlocks and the wave countdown begins. Individual minions may also require upgrades and summon costs.</p></section>
        <section><h3 className="font-bold text-white">What does the Ent do after construction?</h3>
          <p>It repairs and fortifies the castle and enriches existing resource sites. During invasions, castle defense takes priority.</p></section>
        <section><h3 className="font-bold text-white">What do I gain from regression?</h3>
          <p>Days and waves restart at 1, and the Ent must rebuild your realm. Each regression grants 1 skill point and +100 permanent castle HP after rebuilding. Open Skills to unlock lasting powers for minions, castle defense and resource production. Unspent points and unlocked powers survive regression; a full realm reset clears them.</p></section>
        <section><h3 className="font-bold text-white">Why does the scenery change?</h3>
          <p>Each phase has its own background: Demon Citadel (waves 1–25), Magma Caldera (26–50), Frost Spire (51–75) and Astral Sanctum (76–100).</p></section>
      </div>
    </dialog>
  );
};
