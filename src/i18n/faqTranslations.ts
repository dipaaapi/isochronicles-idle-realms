export type Language = 'EN' | 'TL';

interface FAQEntry {
  question: string;
  answer: string;
}

interface FAQContent {
  title: string;
  close: string;
  entries: FAQEntry[];
}

export const faqTranslations: Record<Language, FAQContent> = {
  EN: {
    title: '📜 Realm Lore & Tips',
    close: 'Close',
    entries: [
      {
        question: '🌳 Who builds the castle and buildings?',
        answer: 'Your starting Slime summons the Ent — the realm\'s loyal builder. It automatically constructs the Castle, Wood Grove, Stone Quarry, Metal Mine, and Water Port, in that order. It walks to each site and builds once you have enough resources. No build button to click — it\'s all on autopilot.',
      },
      {
        question: '🎁 How do I get supplies before construction finishes?',
        answer: 'Random scouts appear between waves. Click them to defeat them and instantly receive wood, stone, aether shards, and coins straight into your resources. The Ent simply waits if supplies are short, so keep hunting scouts.',
      },
      {
        question: '⚔️ When do minions and waves unlock?',
        answer: 'Build the Castle and all four resource buildings to level 1. Once that\'s done, minion recruitment unlocks and the wave countdown begins. Note that individual minions may have their own upgrade and summon costs.',
      },
      {
        question: '🛠️ What does the Ent do after construction?',
        answer: 'It never really rests — it repairs and fortifies the castle and enriches existing resource sites. During invasions, castle defense becomes its top priority.',
      },
      {
        question: '✨ How do I get skill points?',
        answer: 'Just keep winning! Every 5 waves you clear gives 2 skill points (40 by Wave 100). Open Skills and click a skill to add a rank — it works immediately. Each branch unlocks top to bottom, and "Reset skills" refunds every point for free, so experiment as much as you like.',
      },
      {
        question: '🔁 What do I gain from regression?',
        answer: 'Days and waves restart at 1 and the Ent rebuilds your realm from scratch. In return, every regression tier permanently strengthens YOUR team — never the enemy: +5% minion attack, +3% minion speed, 3% less damage to minions, +5% tower damage, +5% harvest, and +100 Castle HP, plus bonus starting coins and shards. Your skill ranks are refunded and you earn the points again by clearing waves.',
      },
      {
        question: '🏃 Why are some invaders running straight at my castle?',
        answer: 'Those are rushers. A random few invaders ignore your minions and establishments and charge the citadel at extra speed. The activity log warns you when one appears — keep the walls strong and the towers ready.',
      },
      {
        question: '⌨️ Are there keyboard shortcuts?',
        answer: 'Yes: ` (backtick) plays or pauses, 1 switches to 2× speed and 2 to 3× speed — press the same key again to return to 1×. In quick trade, drag or scroll the knob (hold Shift for ×10) or use the arrow keys to pick an amount; the total always uses the real market price.',
      },
      {
        question: '🌍 Why does the scenery change?',
        answer: 'Each phase brings a new world: Demon Citadel (waves 1–25) 🔥, Magma Caldera (26–50) 🌋, Frost Spire (51–75) ❄️, and Astral Sanctum (76–100) ✨.',
      },
    ],
  },
  TL: {
    title: '📜 Realm Lore & Tips',
    close: 'Isara',
    entries: [
      {
        question: '🌳 Sino ang gumagawa ng castle at buildings?',
        answer: 'Ang starting Slime mo ang susumon sa Ent — ang loyal na builder ng realm mo. Awtomatiko niyang itatayo ang Castle, Wood Grove, Stone Quarry, Metal Mine, at Water Port, ayon sa pagkakasunod-sunod. Lalakad siya sa bawat site at magtatayo kapag sapat na ang resources mo. Walang kailangang i-click na build button — puro autopilot!',
      },
      {
        question: '🎁 Paano kukuha ng supplies bago matapos ang construction?',
        answer: 'May random scouts na dadaan sa pagitan ng waves. I-click lang sila para talunin at makakuha agad ng wood, stone, aether shards, at coins — diretso sa resources mo. Hihintayin ka lang ng Ent kung kulang pa ang supplies, kaya keep hunting!',
      },
      {
        question: '⚔️ Kailan magiging available ang minions at waves?',
        answer: 'Kumpletuhin ang Castle at lahat ng apat na resource buildings sa Level 1. Sa sandaling matapos iyon, ma-unlock ang minion recruitment at magsisimula na ang wave countdown. Take note: may mga minion na may sariling upgrade at summon cost.',
      },
      {
        question: '🛠️ Ano ang ginagawa ng Ent pagkatapos ng construction?',
        answer: 'Hindi siya nagpapahinga! Nagre-repair at nagfo-fortify siya ng castle, at pina-enrich pa ang existing resource sites mo. Pero pag may invasion, castle defense ang unang priority niya.',
      },
      {
        question: '✨ Paano makakuha ng skill points?',
        answer: 'Manalo lang nang manalo! Kada 5 waves na matapos mo, may 2 skill points ka (40 pagdating ng Wave 100). Buksan ang Skills at i-click ang skill para magdagdag ng rank — gagana agad. Bawat branch ay nagbubukas mula taas pababa, at libre ang "I-reset" para maibalik lahat ng points, kaya mag-experiment ka lang.',
      },
      {
        question: '🔁 Ano ang makukuha ko sa regression?',
        answer: 'Magre-restart ang Days at Waves sa 1 at muling itatayo ng Ent ang realm mo mula zero. Kapalit nito, bawat regression tier ay permanenteng nagpapalakas sa KOPONAN mo — hindi sa kalaban: +5% atake ng minion, +3% bilis ng minion, 3% bawas pinsala sa minion, +5% pinsala ng tower, +5% ani, at +100 Castle HP, plus dagdag na starting coins at shards. Ibabalik ang skill ranks mo at kikitain ulit ang points sa pagtapos ng mga wave.',
      },
      {
        question: '🏃 Bakit may mga kalabang diretsong sumusugod sa kastilyo?',
        answer: 'Sila ang mga rusher. May ilang random na kalaban na hindi pumapansin sa minions at establishments at mabilis na sumusugod sa kuta. Babalaan ka ng activity log kapag may lumitaw — panatilihing matibay ang pader at handa ang mga tower.',
      },
      {
        question: '⌨️ May keyboard shortcuts ba?',
        answer: 'Oo: ` (backtick) para sa play o pause, 1 para sa 2× speed at 2 para sa 3× speed — pindutin ulit ang parehong key para bumalik sa 1×. Sa quick trade, i-drag o i-scroll ang knob (hawakan ang Shift para ×10) o gamitin ang arrow keys para pumili ng dami; laging tunay na presyo ng merkado ang ginagamit sa total.',
      },
      {
        question: '🌍 Bakit nagbabago ang paligid?',
        answer: 'Bawat phase, bagong mundo: Demon Citadel (waves 1–25) 🔥, Magma Caldera (26–50) 🌋, Frost Spire (51–75) ❄️, at Astral Sanctum (76–100) ✨.',
      },
    ],
  },
};