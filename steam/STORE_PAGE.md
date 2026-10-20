# Steam store page: copy and settings

Paste-ready text for **Steamworks → Store Page Admin**. Valve rules kept in mind: no review quotes, awards, prices or "sale" text in images or the short description; screenshots are real gameplay; the trailer shows the game.

> **Name check before submitting:** the store name is **IsoChronicle: Idle Realms**, but the painted title logo (title screen, capsules, event art) reads "Demon Lord Realms". Steam reviewers flag a capsule logo that doesn't match the product name. Repaint the subtitle or rename the product first.

## Basic info

| Field | Value |
| --- | --- |
| Product name | IsoChronicle: Idle Realms |
| Developer | SimplyEd |
| Publisher | SimplyEd |
| Franchise | IsoChronicle |
| Release date | Coming soon (set the real date only when ready; see RELEASE_CHECKLIST.md) |
| Platforms | Windows 10/11 64-bit, SteamOS + Linux 64-bit |
| Languages | English: interface, full audio N/A (procedural SFX), subtitles N/A. Tagalog/Filipino is in-game but isn't a Steam store language, so mention it in the description |
| Controller support | None (mouse + keyboard) |
| Steam Cloud | Yes (Auto-Cloud, see STEAM.md) |
| Achievements | Yes, 9 (see ACHIEVEMENTS.md) |
| Single-player | Yes; no multiplayer, no online requirement |

## Short description (≤ 300 characters)

> Wake as a fallen Demon Lord in a ruined citadel. Rebuild a floating isometric island, summon Generals and their minions, automate thirteen establishments and hold the line against 100 waves of human and mecha invaders across four realms. Then regress, stronger, and do it again.

(279 characters)

## About this game (long description)

Steam's editor takes this BBCode as is.

```
[h2]Rebuild. Summon. Survive.[/h2]
You wake as a weakened Demon Lord in the ashes of your old citadel, with a single Support Slime at your side. The Slime calls an Ancient Treant, the Treant raises your castle and summons your Generals, and your Generals build the realm with their minions. Every unit has a mind of its own. You steer the realm; it builds itself.

[h2]An idle strategy game that plays out in front of you[/h2]
[list]
[*][b]A living floating island[/b]: a 20×20 isometric island in hand-painted pixel art, with a day/night cycle, seasons, storms, snow, heatwaves, leaping fish and a sky that moves.
[*][b]Thirteen establishments, thirteen Generals[/b]: each establishment has its own General and minions who gather, craft, repair and slip through rifts on expeditions into the human realm.
[*][b]100 invasion waves[/b]: humans and mecha pour out of four corner rifts in shifting formations. Rushers charge the citadel, bosses carry rare runes, and every expedition you send stirs their vengeance.
[*][b]Your own hand in battle[/b]: double-click to lock up to ten sky lasers on invaders and burn the ground beneath them; establishments fire their own skills.
[*][b]Generals with a temper[/b]: rivals who keep bumping into each other brawl. The winner grows stronger and glows; the realm answers with mirror invaders.
[*][b]Four realms[/b]: Demon Citadel, Magma Caldera, Frost Spire and Astral Sanctum, each with its own island, waters and enemies.
[*][b]Regression[/b]: conquer wave 100 (or regress whenever you like) and start over with permanent team boosts, runes and new skill paths.
[/list]

[h2]Built for idling[/h2]
[list]
[*]Offline progress: your realm keeps working while you're away.
[*]No account, no internet, no microtransactions.
[*]Steam Cloud saves and Steam Achievements.
[*]Fully playable in English and Tagalog.
[/list]
```

## Tags (pick up to 20; order = weight)

Idler, Strategy, Tower Defense, Pixel Graphics, Isometric, Base Building, Automation, Management, Colony Sim, Fantasy, Dark Fantasy, Singleplayer, Casual, Indie, Resource Management, Real-Time with Pause, Simulation, Demons, Relaxing, 2.5D

## Genres

Strategy, Simulation, Casual, Indie

## System requirements

| | Minimum | Recommended |
| --- | --- | --- |
| OS | Windows 10 64-bit / Ubuntu 20.04+ / SteamOS 3 | Windows 11 64-bit |
| Processor | Dual-core 2.0 GHz | Quad-core 3.0 GHz |
| Memory | 4 GB RAM | 8 GB RAM |
| Graphics | WebGL 2 capable GPU (Intel HD 5000 / GeForce 600 / Radeon HD 7000) | Any discrete GPU from 2016 on |
| Storage | 600 MB available space | 600 MB available space |
| Additional notes | Mouse and keyboard. Runs offline. | Higher-refresh displays supported (30/60/90 FPS cap in Settings). |

Confirm the storage size against `release/win-unpacked` after `npm run dist:steam`.

## Content survey (Store Page Admin → Content Survey)

| Question | Answer |
| --- | --- |
| Frequent violence or gore | **Some violence**: fantasy combat between monsters and human/mecha invaders, stylised pixel art. Optional blood effect, off in Settings → Gore |
| Nudity or sexual content | None. (The Succubus General is a fully clothed fantasy character.) |
| Mature content for adults only | No |
| General mature content | Demonic theme (the player is a Demon Lord). No real-world religion or real-world violence |
| AI-generated content disclosure | Fill in honestly for every art, text and code source used before submitting |
| Data collection | None: no network calls, accounts or telemetry (see PRIVACY.md) |

Suggested rating band: PEGI 7 / ESRB E10+ (fantasy violence). Use the IARC questionnaire Steam links to if you want official ratings.

## Assets: what goes where

| Steamworks slot | File | Size |
| --- | --- | --- |
| Header capsule | `store-assets/header_capsule_920x430.png` | 920×430 |
| Small capsule | `store-assets/small_capsule_462x174.png` | 462×174 |
| Main capsule | `store-assets/main_capsule_1232x706.png` | 1232×706 |
| Vertical capsule | `store-assets/vertical_capsule_748x896.png` | 748×896 |
| Page background | `store-assets/page_background_1438x810.png` | 1438×810 |
| Library capsule | `store-assets/library_capsule_600x900.png` | 600×900 |
| Library header | `store-assets/library_header_920x430.png` | 920×430 |
| Library hero | `store-assets/library_hero_3840x1240.png` | 3840×1240 |
| Library logo | `store-assets/library_logo_1280x720.png` | 1280×720 (transparent) |
| Community icon | `store-assets/community_icon_184x184.jpg` | 184×184 |
| Client icon | `store-assets/client_icon.ico` | 32×32 / 16×16 |
| Achievement icons | `store-assets/achievements/*.jpg` | 256×256 (+ `_locked` grey) |
| Event / announcement cover | `store-assets/events/event_cover_800x450.jpg` | 800×450 |
| Event / announcement header | `store-assets/events/event_header_1920x622.jpg` | 1920×622 |
| Screenshots | `screenshots/*.png` | 1920×1080, live gameplay |
| Trailer | `trailer/` (see trailer/README.md) | 1920×1080 |

Regenerate: `npm run steam:art` (capsules; needs Python 3 + Pillow) and `npm run steam:capture` (achievements, event art, screenshots, trailer; see STEAM.md).
