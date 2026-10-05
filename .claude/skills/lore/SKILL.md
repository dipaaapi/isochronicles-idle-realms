---
name: lore
description: Write or edit IsoChronicle's story, lore and flavour text (LORE.md / LORE.tl.md, intro narrative, unit / invader / structure / item / blessing names and descriptions, activity-log wording) without analysing the whole project. Use for any task that creates or changes story text, character backstories, new factions, realms or events, or EN/TL translations of narrative text.
---

# Lore & story writing (token-lean)

Most of the cost of a lore task comes from reading the project to learn the setting. You don't need to: the **canon sheet** below is the setting in brief, and `lore-tool.mjs` pulls exact text from any file on demand.

```
L=.claude/skills/lore/lore-tool.mjs
node $L sections                 # LORE.md │ LORE.tl.md headings with line ranges
node $L section <n|word>         # one section, EN + TL (e.g. `section ent`, `section 9`)
node $L entity <name>            # one entity's text fields only: name/nameEn, subtitle, description, skills (EN+TL)
node $L find <term> [--max 40]   # every narrative string mentioning <term>, as file:line
node $L sources                  # which files hold narrative text, and how much
node $L check                    # EN/TL gaps; LORE.md vs LORE.tl.md section/paragraph/bullet mismatches
```

## Token rules

1. **Start from the canon sheet.** Don't read README, LORE.md, `units.ts` or `invaders.ts` whole. Pull only the section or entity you are touching.
2. **Before naming something new, check for conflicts with `find <name>`.** That's cheaper than reading the tables.
3. **Edit by line number** (from `section` / `entity` / `find`) with targeted `Edit` calls. Never rewrite a whole file to change a paragraph.
4. **Don't read game code to check a mechanic.** The canon sheet lists the hard facts (counts, wave numbers, roles). If a claim isn't covered there, `find` the term once. Only read code if the mechanic itself is changing.
5. **Write the EN version and the TL version in the same pass.** Translating later costs a second read of the same text.
6. **Finish with `check`.** Don't re-read the files to verify.

## Canon sheet (keep in sync with LORE.md)

**Premise:** Centuries ago an alliance of human crusaders and machine legions nearly killed the **Demon Lord**. His citadel is now rubble on a **floating island** and he slept. He wakes weakened and rebuilds the citadel, raises a horde of monsters and outlasts the crusades of the **Human & Mecha Alliance**.

**The Demon Lord's side**
- **Slime → Slime Lord** (Support Slime): the only servant at his waking, and the heart of the horde. It heals, restores stamina, resurrects and boosts morale. It cannot gather, is immune and cannot die, and has 5 evolution forms. It is unique (1 unit).
- **Ancient Treant** (starts as Sprout Treant; only one, summoned free by the Slime): builds the **Citadel**, then the **Crystal Spire**. It is "mother of the realm": it summons the 13 Generals one at a time. It does not build establishments. Afterwards it repairs, enriches the soil, gears itself and tends the walls. It has 5 forms.
- **13 establishments**, each with 1 **General** + 5 **tenants** of the same kind, its own tower and 3 skills (2 techniques + 1 ultimate). They are placed randomly per realm and can be moved, but not during an invasion. Each General builds its own home, then scouts, guards and leads. Tenants gather, garrison and counter-attack.

| Establishment | General / tenants | Codex art |
|---|---|---|
| Wood Grove | Thornwood Dryad | Tree of Life |
| Stone Quarry | Watchtower Minotaur | Watchtower |
| Metal Mine | Ember Imp | Ore Furnace |
| Water Port | Water Merman | Wellspring |
| Mystic Cave | Lava Gargoyle | Magma Cavern |
| Abyssal Trench | Kraken | Deepwater Basin |
| Crypt of Souls | Lich Necromancer | Bone Mausoleum |
| Brimstone Perch | Harpy | Obsidian Spire |
| Infernal Kennel | Demon Hound | Infernal Kennel |
| Golem Foundry | Earth Golem | Golem Foundry |
| Shadow Pavilion | Succubus | Shadow Pavilion |
| Void Gate | Void Wraith | Void Gate |
| Bone Crypt | Bone Knight | Bone Crypt |

- Where tenants gather:
  - Mermen and Krakens: in the ocean (fish, water, pearls).
  - Dryads: on grass.
  - Minotaurs: on paved roads.
  - Imps, Golems, Harpies and Succubi: beside their own halls.
  - Gargoyles, Liches and Wraiths: essence near the rifts.
  - Some tenants raid **through the rifts** into the human realm for metal, scrap, souls and coin. This provokes revenge raiders, which is why the crusades never stop.
- **Citadel**: does not attack. It burns a **Provoke Beacon** that pulls invaders onto its walls (walls, shield, beacon). If it falls, the invaders loot **half the stores** and flee, and the walls are rebuilt at once.

**The Alliance (invaders)**
- **Rulers**, who lead the boss waves: **High Priest** (holy healer) and **Mecha Valkyrie** (steel-winged commander).
- **Fighters**: Human Knight, Human Archer, Mecha Scout, Mecha Titan, Assassin (twin blades), Mecha Drones (laser swarms), Mecha Siege Tank, and **Chrono** the time mage (slows the battlefield).
- Waves come through **4 corner rifts**. Minions can smash a rift: it stops spawning for that wave and pays a bounty.
- **Rushers** charge the citadel. Between waves lone **scouts** wander and drop loot.
- Slain invaders drop materials. The Demon Lord can strike any invader with lightning.

**World**
- **100 waves**, and a new **realm every 25**: Demon Citadel (1–25, obsidian and aether spires), Magma Caldera (26–50, basalt and lava), Frost Spire (51–75, glaciers and storms), Astral Sanctum (76–100, gold and white marble).
- **Year of 365 days, 4 seasons of ~91 days**:
  - Spring: balanced.
  - Summer: heatwaves enrage invaders (they hit harder).
  - Autumn: rain rusts and slows the Mecha; some rainy days become thunderstorms.
  - Winter: snow chills and slows the humans.
- **5 relics**: Minion Frenzy, Aegis Barrier, Mass Restoration, Shield Overload, Chrono Surge. They are fuelled by obsidian (Perch), souls (Crypt), pearls (Trench) and scrap (fallen Mecha).
- **Progression**: skill points every 5 waves, research, and an armory (weapons, armour, relics).
- **Regression** (prestige), after wave 100: he gives up the conquered realm and absorbs its essence. Time rewinds to day 1 of year 1, with the citadel in ruins and only the Slime left. He keeps permanent buffs for **his own forces only, never the enemy's**. Skills are earned anew, and each Regression is recorded in history.

**Tone & style**
- Dark-fantasy versus aetherpunk, told from the villain's side with sympathy. Grand and a little playful (the "enthusiastic" Slime).
- Short paragraphs. **Bold** proper nouns the first time they appear in a section.
- "Mecha" for the machine side. "Citadel" in EN, "Kuta" in TL.
- Never contradict a hard fact above without changing the game too.

## Where text lives

| What | File | Format |
|---|---|---|
| Lore (Atlas → Lore tab) | `LORE.md` + `LORE.tl.md` | `##` sections, made only of paragraphs and `-` bullets (the Atlas parser splits on these). Keep **the same sections in the same order** in both files. |
| Opening story | `src/ui/IntroNarrativeModal.tsx` | `NARRATIVE_TEXT_EN` / `NARRATIVE_TEXT_TL` |
| Minions / Generals | `src/data/units.ts` | `name` (TL), `nameEn`, `subtitle`/`subtitleEn`, `description` (TL) / `descriptionEn`; skills use `name`(EN)/`nameTl`, `desc`(EN)/`descTl` |
| Invaders | `src/data/invaders.ts` | same as units |
| Blessings, items, seasons, evolutions | `src/data/*.json` | `name`/`nameEn`, `description`/`descriptionEn` |
| UI, Atlas guide, structures, activity log | `src/i18n/*.json` | `{ "en": …, "tl": … }` |
| FAQ | `src/i18n/faqTranslations.ts` | question/answer per language |

Rules from CLAUDE.md:
- Repeated or reusable wording belongs in JSON with EN/TL pairs, not inline in code.
- Events are narrated in the activity log (`logMessage(key, vars)` + `activityMessages.json`), never as floating text on the map.
- Keep the existing Filipino/Taglish comments as they are.

Originality (legal safety): every name must be original. Use broad genre tropes, never a name, creature, place, item or plot another game, anime, manga or book coined. Myth and public-domain names (Titan, Valkyrie, Behemoth) and generic fantasy words (slime, golem, treant) are fine. Retired: Ent (Tolkien) → Treant.

TL style: natural Filipino, with English kept for game terms players know (Demon Lord, Slime, Treant, Mecha, Regression, AOE, HP). Match the register of the existing TL lines; check one with `section` or `entity` if unsure.

## Workflow

1. Read only the canon sheet, then `sections` or `entity <name>` for the part you are changing.
2. Draft EN and TL together, and check new names with `find`.
3. Edit by line number.
4. If the change alters canon (a new character, realm, mechanic or count), update **LORE.md, LORE.tl.md and the canon sheet above** in the same commit.
5. Run `node $L check`. Run `npx tsc --noEmit` if you touched `.ts`/`.tsx` files and `npm run build` if you changed a JSON shape.
6. Commit with the `ft:` prefix and list the touched areas.
