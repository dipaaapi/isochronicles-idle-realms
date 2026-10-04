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
        question: '🧭 Why does every wave fight differently?',
        answer: 'Each wave rolls a formation: a skirmish line, a vanguard rush, a pincer from two opposite rifts, a shield wall, a spearhead through one hardened rift, a war of attrition, a Mecha blitz, a siege column, a shadow infiltration, a holy crusade, a storm of steel or a grand offensive. The banner and the activity log name it. Formations choose which rifts open, the order invaders march in, and a wave-wide effect (shield wall, overclock, sanctuary healing, phase veil or war cry). Some bring a High Priest or Mecha Valkyrie mid-wave. If only one or two rifts are open, smashing them ends the wave early.',
      },
      {
        question: '📈 How do invaders get stronger?',
        answer: 'Invader health and damage rise every wave and step up with each realm, and the longer the realm has lasted (up to day 365) the tougher they get, a little more in winter. Elite invaders (gold tint, bigger, richer bounty) appear from wave 6 and grow more common. Difficulty sets health, damage, wave size, spawn speed and how early formations appear. Your establishment skills grow stronger with the wave too, so ultimates stay useful to the end.',
      },
      {
        question: '🗺️ Why does the platform look different?',
        answer: 'Each realm (waves 1-25, 26-50, 51-75, 76-100) repaints the island in its own palette, and the difficulty changes it too: Easy blooms with flowers, Normal is the plain realm, and Hard darkens the ground and splits it with cracks glowing in the realm\'s colour.',
      },
      {
        question: '🌳 Who builds the castle and buildings?',
        answer: 'Your starting Slime summons the Ent for free. The Ent raises the Castle first, then the Crystal Spire, then summons the Generals one by one — and each General builds its own establishment, in this order: Wood Grove, Stone Quarry, Metal Mine, Water Port, Mystic Cave, Infernal Kennel, Brimstone Perch, Abyssal Trench, Crypt of Souls, Golem Foundry, Shadow Pavilion, Void Gate and Bone Crypt. Builders walk to their site and build once you have the supplies. There is no build button — it\'s all on autopilot.',
      },
      {
        question: '🎁 How do I get supplies early on?',
        answer: 'Lone scouts wander the island between waves: human knights, archers and assassins, or Mecha scouts and drones. Strike them down and they scatter coins and supplies on the ground for your minions to collect (humans carry wood, stone, fish and shards; Mecha carry scrap and metal), and now and then a piece of equipment that goes straight into your Armory inventory. You can also sell spare materials for coins (or buy what you lack) in Citadel Command → Market, or click a resource in the sidebar\'s Resources tab for a quick trade. The Ent simply waits while supplies are short.',
      },
      {
        question: '⚔️ When do minions and waves unlock?',
        answer: 'As soon as the Castle stands. The wave countdown starts, and each establishment can summon its General once it is built (some Generals also need a higher Nexus or Refinery level). Open an establishment by clicking it on the map.',
      },
      {
        question: '🏠 What are tenants?',
        answer: 'Every establishment raises 5 tenants of its General\'s kind on its own. In peace they gather on their own ground: fishers wade into the ocean, others work the grass, the roads, their building or the air around the rifts, and some slip through a rift to raid the human realm for metal, souls and coin. Those raids anger the humans: every few of them add an avenging invader to the next wave. In battle tenants garrison the building, each holding part of its defence, and break out to counter-attack when it is battered.',
      },
      {
        question: '🛠️ What does the Ent do after construction?',
        answer: 'It never really rests: it repairs wrecked or damaged buildings, tends the castle walls, enriches the soil so harvests grow richer, and forges or buys gear for itself. A wrecked establishment stops producing and fighting until the Ent repairs it.',
      },
      {
        question: '🏰 Why doesn\'t my castle shoot?',
        answer: 'The citadel no longer attacks — your establishments do. Each one and the Crystal Spire guards a 4×4 zone with its own tower and three skills. The citadel instead burns a Provoke Beacon that pulls nearby invaders onto its walls. Upgrade walls, shield, beacon, towers and munitions in Citadel Command → Fortifications.',
      },
      {
        question: '🌀 Where do invaders come from?',
        answer: 'From the four rifts at the island\'s corners. Minions can smash an open rift: it stops spawning for the rest of the wave and pays a bounty. Seal all four and no more invaders arrive that wave. Some invaders are rushers that ignore everything and charge the citadel — the activity log warns you when one appears.',
      },
      {
        question: '💥 What happens if the castle falls?',
        answer: 'The invaders steal half of everything in your stores and escape through the rifts. The castle is restored right away and the game continues, so keep the walls and shield upgraded.',
      },
      {
        question: '🔥 What are the Q W E R T buttons?',
        answer: 'Battle relics: Minion Frenzy (Q), Aegis Barrier (W), Mass Restoration (E), Shield Overload (R) and Chrono Surge (T). Hover a button to see its effect and cost. They run on landmark materials — obsidian from the Brimstone Perch, souls from the Crypt of Souls, pearls from the Abyssal Trench.',
      },
      {
        question: '⛈️ Does the weather matter?',
        answer: 'Yes. Rain slows Mecha by 15%, snow slows humans by 15%, and a heatwave makes every invader hit 10% harder. Some rainy days turn into thunderstorms. Click the weather card in the sidebar to choose the weather yourself or leave it random. A year lasts 365 days across four seasons.',
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
        question: '🚚 Can I move an establishment?',
        answer: 'Yes. Hold the mouse button on an establishment to lift it, then click a free tile to set it down (right-click or Esc cancels). You can\'t move buildings while a wave is under way.',
      },
      {
        question: '⌨️ Are there keyboard shortcuts?',
        answer: 'Yes: ` (backtick) plays or pauses, 1 switches to 2× speed and 2 to 3× speed — press the same key again to return to 1×. Q, W, E, R and T cast the battle relics. In quick trade, drag or scroll the knob (hold Shift for ×10) or use the arrow keys to pick an amount; the total always uses the real market price.',
      },
      {
        question: '🌍 Why does the scenery change?',
        answer: 'Each realm brings a new world: Demon Citadel (waves 1–25) 🔥, Magma Caldera (26–50) 🌋, Frost Spire (51–75) ❄️, and Astral Sanctum (76–100) ✨.',
      },
    ],
  },
  TL: {
    title: '📜 Kasaysayan at Payo ng Kaharian',
    close: 'Isara',
    entries: [
      {
        question: '🧭 Bakit iba-iba ang laban sa bawat alon?',
        answer: 'Bawat alon ay may hanay: linya ng sagupaan, sugod ng taliba, sipit mula sa dalawang magkatapat na lagusan, pader ng kalasag, dulo ng sibat sa iisang matibay na lagusan, digmaan ng pagpapagod, bagyong Mecha, hanay ng pagkubkob, pagpasok sa anino, banal na krusada, bagyo ng bakal o malaking opensiba. Nakasulat ito sa banner at sa tala ng mga pangyayari. Ang hanay ang pumipili kung aling lagusan ang bubukas, ang pagkakasunod ng mga kalaban at isang epekto sa buong alon (pader ng kalasag, overclock, banal na paggaling, tabing ng anino o sigaw ng digmaan). May hanay na may kasamang Punong Pari o Mecha Valkyrie sa gitna ng alon. Kapag isa o dalawa lang ang bukas na lagusan, matatapos agad ang alon kapag nawasak mo sila.',
      },
      {
        question: '📈 Paano lumalakas ang mga kalaban?',
        answer: 'Tumataas ang buhay at pinsala ng kalaban bawat alon at lalo pa sa bawat kaharian, at habang tumatagal ang kaharian (hanggang ika-365 na araw) ay lalo silang tumitibay, mas lalo sa taglamig. Lumalabas ang mga elite (kulay ginto, mas malaki, mas malaking gantimpala) mula alon 6 at dumarami habang tumatagal. Ang hirap ng laro ang nagtatakda ng buhay, pinsala, dami, bilis ng paglabas at kung kailan lalabas ang mga hanay. Lumalakas din ang mga kasanayan ng gusali mo bawat alon kaya may silbi pa rin ang mga ultimate hanggang dulo.',
      },
      {
        question: '🗺️ Bakit nag-iiba ang itsura ng plataporma?',
        answer: 'Bawat kaharian (alon 1-25, 26-50, 51-75, 76-100) ay may sariling kulay ng isla, at nagbabago rin ito ayon sa hirap: namumulaklak sa Madali, karaniwan sa Katamtaman, at sa Mahirap ay dumidilim ang lupa at nabibitak na may liwanag na kulay ng kaharian.',
      },
      {
        question: '🌳 Sino ang nagtatayo ng kastilyo at mga gusali?',
        answer: 'Libreng tatawagin ng panimulang Slime mo ang Ent. Kastilyo muna ang itatayo nito, pagkatapos ang Tore ng Kristal, saka isa-isang tatawagin ang mga Heneral — at bawat Heneral ang magtatayo ng sariling pasilidad, ayon sa pagkakasunod: Kagubatan, Kwartel ng Bato, Minahan, Pantalan, Yungib ng Hiwaga, Kulungan ng Impiyerno, Dapuan ng Asupre, Bangin ng Kailaliman, Libingan ng mga Kaluluwa, Pandayan ng Golem, Tolda ng Anino, Tarangkahan ng Kawalan at Kripta ng mga Kaluluwa. Lalakad ang bawat nagtatayo sa puwesto nito at magtatayo kapag sapat na ang supply. Walang build button — puro autopilot!',
      },
      {
        question: '🎁 Paano makakakuha ng supply sa simula?',
        answer: 'May mga nag-iisang espiya na gumagala sa isla sa pagitan ng mga alon: mga kawal, mamamana at assassin na tao, o mga Mecha scout at drone. Kapag napatay, nagkakalat sila ng barya at suplay sa lupa na pupulutin ng mga alagad mo (kahoy, bato, isda at kristal ang dala ng tao; scrap at bakal ang sa Mecha), at paminsan-minsan ay isang kagamitan na diretsong mapupunta sa imbentaryo ng Armory. Puwede mo ring ibenta ang sobrang materyales para sa barya (o bilhin ang kulang) sa Sentro ng Kuta → Pamilihan, o i-click ang isang yaman sa tab na Yaman ng sidebar para sa mabilisang palitan. Maghihintay lang ang Ent habang kulang ang supply.',
      },
      {
        question: '⚔️ Kailan magbubukas ang mga alagad at alon?',
        answer: 'Kapag nakatayo na ang Kastilyo. Magsisimula ang countdown ng alon, at matatawag ng bawat pasilidad ang Heneral nito kapag naitayo na ito (may ilang Heneral na kailangan din ng mas mataas na antas ng Nexus o Refinery). Buksan ang pasilidad sa pag-click dito sa mapa.',
      },
      {
        question: '🏠 Ano ang mga umuupa?',
        answer: 'Kusang nagpapalabas ang bawat pasilidad ng 5 umuupa na kauri ng Heneral nito. Sa kapayapaan, nangangalap sila sa sarili nilang lupa: lumulusong sa dagat ang mga mangingisda, ang iba ay sa damuhan, lansangan, sa kanilang gusali o sa paligid ng mga lagusan, at may ilang pumapasok sa lagusan para nakawan ang kaharian ng tao ng bakal, kaluluwa at barya. Ikinagagalit ito ng mga tao: bawat ilang pagnanakaw ay nagdadagdag ng isang naghihiganting kalaban sa susunod na alon. Sa labanan, nagbabantay ang mga umuupa sa gusali, may hawak ang bawat isa na bahagi ng depensa nito, at kumakawala para gumanti kapag nabugbog ito.',
      },
      {
        question: '🛠️ Ano ang ginagawa ng Ent pagkatapos magtayo?',
        answer: 'Hindi ito nagpapahinga: inaayos nito ang mga nasira o nawasak na gusali, binabantayan ang pader ng kastilyo, pinatataba ang lupa para lumaki ang ani, at nagpapanday o bumibili ng sariling gamit. Humihinto sa paggawa at paglaban ang nawasak na pasilidad hanggang ayusin ito ng Ent.',
      },
      {
        question: '🏰 Bakit hindi bumabaril ang kastilyo ko?',
        answer: 'Hindi na umaatake ang kuta — ang mga pasilidad mo na ang lumalaban. Bawat isa at ang Tore ng Kristal ay nagbabantay sa 4×4 na sona gamit ang sariling tore at tatlong kakayahan. Sa halip, may Liwanag ng Panunukso ang kuta na humihila sa mga kalaban papunta sa pader nito. I-upgrade ang pader, kalasag, liwanag, tore at bala sa Sentro ng Kuta → Tanggulan.',
      },
      {
        question: '🌀 Saan nanggagaling ang mga kalaban?',
        answer: 'Sa apat na lagusan sa mga sulok ng isla. Kayang wasakin ng mga alagad ang bukas na lagusan: titigil ito sa paglalabas ng kalaban sa natitirang bahagi ng alon at magbibigay ng gantimpala. Isara ang apat at wala nang darating sa alon na iyon. May mga rusher na hindi pumapansin sa iba at diretsong sumusugod sa kuta — babalaan ka ng activity log kapag may lumitaw.',
      },
      {
        question: '💥 Ano ang mangyayari kapag bumagsak ang kastilyo?',
        answer: 'Nanakawin ng mga kalaban ang kalahati ng lahat ng nasa imbak mo at tatakas sa mga lagusan. Agad na naibabalik ang kastilyo at tuloy ang laro, kaya panatilihing naka-upgrade ang pader at kalasag.',
      },
      {
        question: '🔥 Para saan ang mga button na Q W E R T?',
        answer: 'Mga relikya ng labanan: Siklab ng Minion (Q), Kalasag ng Kuta (W), Malawakang Lunas (E), Soberkarga ng Kalasag (R) at Pampabilis ng Oras (T). Itapat ang mouse sa button para makita ang epekto at halaga. Pinapagana sila ng materyales ng landmark — obsidian mula sa Dapuan ng Asupre, kaluluwa mula sa Libingan, perlas mula sa Bangin ng Kailaliman.',
      },
      {
        question: '⛈️ Mahalaga ba ang panahon?',
        answer: 'Oo. Pinababagal ng ulan ang Mecha nang 15%, pinababagal ng niyebe ang mga tao nang 15%, at pinalalakas ng matinding init ang tama ng lahat ng kalaban nang 10%. May mga maulang araw na nagiging bagyong may kidlat. I-click ang weather card sa sidebar para ikaw ang pumili ng panahon o hayaan itong random. Ang isang taon ay 365 araw na may apat na panahon.',
      },
      {
        question: '✨ Paano makakuha ng puntos ng kasanayan?',
        answer: 'Manalo lang nang manalo! Kada 5 alon na matapos mo, may 2 puntos ka (40 pagdating ng Alon 100). Buksan ang Kasanayan at i-click ang isang kasanayan para magdagdag ng antas — gagana agad. Bawat sangay ay nagbubukas mula taas pababa, at libre ang "I-reset" para maibalik lahat ng puntos, kaya mag-eksperimento ka lang.',
      },
      {
        question: '🔁 Ano ang makukuha ko sa regression?',
        answer: 'Babalik sa 1 ang araw at alon at muling itatayo ng Ent ang kaharian mo mula sa simula. Kapalit nito, bawat antas ng regression ay permanenteng nagpapalakas sa KOPONAN mo — hindi sa kalaban: +5% atake ng alagad, +3% bilis ng alagad, 3% bawas pinsala sa alagad, +5% pinsala ng tore, +5% ani, at +100 HP ng Kastilyo, dagdag pa ang panimulang barya at kristal. Ibabalik ang mga antas ng kasanayan mo at kikitain muli ang puntos sa pagtapos ng mga alon.',
      },
      {
        question: '🚚 Puwede bang ilipat ang isang pasilidad?',
        answer: 'Oo. Pindutin nang matagal ang pasilidad para buhatin ito, saka i-click ang bakanteng tile para ilapag (right-click o Esc para kanselahin). Hindi puwedeng maglipat ng gusali habang may alon.',
      },
      {
        question: '⌨️ May keyboard shortcuts ba?',
        answer: 'Oo: ` (backtick) para i-play o i-pause, 1 para sa 2× bilis at 2 para sa 3× bilis — pindutin ulit ang parehong key para bumalik sa 1×. Ang Q, W, E, R at T ay para sa mga relikya ng labanan. Sa mabilisang palitan, i-drag o i-scroll ang knob (hawakan ang Shift para ×10) o gamitin ang arrow keys para pumili ng dami; laging tunay na presyo ng pamilihan ang gamit sa kabuuan.',
      },
      {
        question: '🌍 Bakit nagbabago ang paligid?',
        answer: 'Bawat kaharian ay bagong mundo: Kuta ng Kadiliman (alon 1–25) 🔥, Magma Caldera (26–50) 🌋, Frost Spire (51–75) ❄️, at Astral Sanctum (76–100) ✨.',
      },
    ],
  },
};
