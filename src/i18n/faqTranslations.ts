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
        question: '🔁 What do I gain from regression?',
        answer: 'Days and waves restart at 1, and the Ent has to rebuild your realm from scratch. But it\'s not for nothing — each regression grants 1 skill point plus +100 permanent Castle HP once rebuilt. Open Skills to unlock lasting powers for minions, castle defense, and resource production. Unspent points and unlocked powers survive regression; only a full realm reset clears them.',
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
        question: '🔁 Ano ang makukuha ko sa regression?',
        answer: 'Magre-restart ang Days at Waves sa 1, at muling itatayo ng Ent ang buong realm mo mula zero. Pero hindi walang saysay ang bawat pagsubok — kada regression, may 1 skill point kang makukuha plus +100 permanent Castle HP pagkatapos marebuild. Buksan ang Skills para i-unlock ang lasting powers para sa minions, castle defense, at resource production. Safe ang unspent points at unlocked powers mo sa regression — isang full realm reset lang ang makakabura nito.',
      },
      {
        question: '🌍 Bakit nagbabago ang paligid?',
        answer: 'Bawat phase, bagong mundo: Demon Citadel (waves 1–25) 🔥, Magma Caldera (26–50) 🌋, Frost Spire (51–75) ❄️, at Astral Sanctum (76–100) ✨.',
      },
    ],
  },
};