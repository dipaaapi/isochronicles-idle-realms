# Balance simulation report

Wave cycle modelled as 150s countdown + 60s fight = 210s.
Income is measured from the real tenant AI (900 s headless run), plus landmark yields.

## Measured income per minute

| Resource | Core 4 (Wood, Quarry, Mine, Port) | All 13 establishments |
|---|---:|---:|
| wood | 33.5 | 28.6 |
| stone | 33.8 | 114 |
| fish | 18.8 | 42.2 |
| water | 17.6 | 35.8 |
| metal | 30.2 | 46.3 |
| charcoal | 11.3 | 29.9 |
| coal | 24.2 | 15.5 |
| minerals | 9.3 | 42.8 |
| scrapMetal | 2 | 6.1 |
| aetherShards | 0 | 36.3 |
| arcaneEssence | 0 | 44.9 |
| obsidianShard | 0 | 19.7 |
| soulFragments | 0 | 28.2 |
| abyssalPearl | 0 | 9.9 |
| coins | 0 | 53.2 |

## Opening: castle + Crystal Spire + core 4 establishments

Total cost: 25 aetherShards, 135 wood, 125 stone, 160 coins

| Difficulty | Start stockpile | Shortfall | Shortfall in coins (market buy) |
|---|---|---|---:|
| EASY | 75 aetherShards, 218 wood, 203 stone, 270 coins | none | 0 |
| NORMAL | 50 aetherShards, 145 wood, 135 stone, 180 coins | none | 0 |
| HARD | 45 aetherShards, 131 wood, 122 stone, 162 coins | 4 wood, 3 stone | 120 |

## EASY: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant + skill DPS), portals excluded, with the expected tactic mix. Load = clear time / arrival time (spawn gap per invader + 30s); defenses keep up while load < 1. Day 365 = the same wave a full year into the realm.

| Wave | Enemies | Wave HP (day 1) | Wave HP (day 365) | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Skill DPS | Clear (s) | Load d1 | Load d365 | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5 | 340 | 410 | 13 | 1 | 162 | 578 | 249 | 0.3 | 0.01 | 0.01 | 90 |
| 5 ☆ | 12 | 1,986 | 2,388 | 16 | 1 | 162 | 722 | 394 | 1.6 | 0.03 | 0.03 | 661 |
| 10 ☆ | 20 | 6,146 | 7,379 | 21 | 1 | 162 | 867 | 513 | 4 | 0.05 | 0.06 | 1,338 |
| 15 ☆ | 29 | 13,631 | 16,357 | 26 | 2 | 246 | 1,011 | 633 | 7.2 | 0.07 | 0.09 | 2,272 |
| 20 ☆ | 39 | 24,480 | 29,400 | 29 | 2 | 246 | 1,156 | 752 | 11.4 | 0.09 | 0.11 | 3,261 |
| 25 ★ | 47 | 41,241 | 49,537 | 32 | 2 | 246 | 1,300 | 871 | 17.1 | 0.12 | 0.15 | 5,142 |
| 30 ☆ | 56 | 62,676 | 75,200 | 35 | 3 | 812 | 1,444 | 991 | 19.3 | 0.12 | 0.15 | 5,526 |
| 40 ☆ | 73 | 123,590 | 148,293 | 41 | 3 | 812 | 1,733 | 1,229 | 32.7 | 0.17 | 0.21 | 8,479 |
| 50 ★ | 91 | 222,596 | 267,135 | 46 | 4 | 1,061 | 2,022 | 1,468 | 48.9 | 0.22 | 0.26 | 13,396 |
| 60 ☆ | 108 | 363,874 | 436,603 | 52 | 5 | 3,164 | 2,311 | 1,707 | 50.7 | 0.20 | 0.24 | 16,333 |
| 75 ★ | 135 | 674,308 | 809,170 | 61 | 5 | 3,164 | 2,744 | 2,065 | 84.6 | 0.29 | 0.35 | 25,945 |
| 90 ☆ | 161 | 1,142,893 | 1,371,576 | 70 | 5 | 3,164 | 3,178 | 2,423 | 130 | 0.40 | 0.48 | 33,699 |
| 100 ★ | 179 | 1,554,395 | 1,865,117 | 75 | 5 | 3,164 | 3,467 | 2,662 | 167 | 0.48 | 0.57 | 43,165 |

☆ boss wave, ★ realm climax boss.

## NORMAL: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant + skill DPS), portals excluded, with the expected tactic mix. Load = clear time / arrival time (spawn gap per invader + 30s); defenses keep up while load < 1. Day 365 = the same wave a full year into the realm.

| Wave | Enemies | Wave HP (day 1) | Wave HP (day 365) | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Skill DPS | Clear (s) | Load d1 | Load d365 | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 6 | 570 | 684 | 18 | 1 | 162 | 578 | 298 | 0.5 | 0.01 | 0.02 | 108 |
| 5 ☆ | 14 | 3,088 | 3,708 | 23 | 1 | 162 | 722 | 394 | 2.4 | 0.04 | 0.05 | 711 |
| 10 ☆ | 25 | 10,403 | 12,494 | 31 | 1 | 162 | 867 | 513 | 6.7 | 0.08 | 0.10 | 1,614 |
| 15 ☆ | 35 | 22,858 | 27,431 | 37 | 2 | 246 | 1,011 | 633 | 12.1 | 0.12 | 0.14 | 2,729 |
| 20 ☆ | 45 | 40,388 | 48,474 | 41 | 2 | 246 | 1,156 | 752 | 18.8 | 0.16 | 0.19 | 3,801 |
| 25 ★ | 55 | 67,680 | 81,239 | 46 | 2 | 246 | 1,300 | 871 | 28 | 0.20 | 0.24 | 5,939 |
| 30 ☆ | 66 | 104,418 | 125,343 | 50 | 3 | 812 | 1,444 | 991 | 32.2 | 0.20 | 0.24 | 6,613 |
| 40 ☆ | 87 | 208,406 | 250,180 | 58 | 3 | 812 | 1,733 | 1,229 | 55.2 | 0.28 | 0.34 | 10,299 |
| 50 ★ | 107 | 369,275 | 443,176 | 66 | 4 | 1,061 | 2,022 | 1,468 | 81.1 | 0.36 | 0.43 | 15,857 |
| 60 ☆ | 128 | 610,864 | 732,954 | 75 | 5 | 3,164 | 2,311 | 1,707 | 85 | 0.33 | 0.39 | 19,828 |
| 75 ★ | 159 | 1,122,470 | 1,346,894 | 87 | 5 | 3,164 | 2,744 | 2,065 | 141 | 0.47 | 0.56 | 31,007 |
| 90 ☆ | 190 | 1,911,329 | 2,293,425 | 100 | 5 | 3,164 | 3,178 | 2,423 | 218 | 0.65 | 0.78 | 40,848 |
| 100 ★ | 210 | 2,579,476 | 3,095,420 | 108 | 5 | 3,164 | 3,467 | 2,662 | 278 | 0.78 | 0.94 | 51,606 |

☆ boss wave, ★ realm climax boss.

## HARD: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant + skill DPS), portals excluded, with the expected tactic mix. Load = clear time / arrival time (spawn gap per invader + 30s); defenses keep up while load < 1. Day 365 = the same wave a full year into the realm.

| Wave | Enemies | Wave HP (day 1) | Wave HP (day 365) | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Skill DPS | Clear (s) | Load d1 | Load d365 | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7 | 798 | 959 | 22 | 1 | 162 | 578 | 298 | 0.8 | 0.02 | 0.02 | 176 |
| 5 ☆ | 15 | 3,905 | 4,680 | 28 | 1 | 162 | 722 | 394 | 3.1 | 0.05 | 0.06 | 1,030 |
| 10 ☆ | 27 | 13,756 | 16,501 | 37 | 1 | 162 | 867 | 513 | 8.9 | 0.11 | 0.13 | 2,477 |
| 15 ☆ | 38 | 30,461 | 36,569 | 45 | 2 | 246 | 1,011 | 633 | 16.1 | 0.16 | 0.19 | 4,250 |
| 20 ☆ | 50 | 55,062 | 66,106 | 50 | 2 | 246 | 1,156 | 752 | 25.6 | 0.21 | 0.25 | 6,063 |
| 25 ★ | 61 | 91,791 | 110,162 | 55 | 2 | 246 | 1,300 | 871 | 38 | 0.27 | 0.33 | 9,322 |
| 30 ☆ | 73 | 142,027 | 170,479 | 60 | 3 | 812 | 1,444 | 991 | 43.7 | 0.28 | 0.33 | 10,560 |
| 40 ☆ | 95 | 280,153 | 336,100 | 70 | 3 | 812 | 1,733 | 1,229 | 74.2 | 0.39 | 0.46 | 16,294 |
| 50 ★ | 118 | 500,184 | 600,220 | 80 | 4 | 1,061 | 2,022 | 1,468 | 110 | 0.49 | 0.58 | 25,102 |
| 60 ☆ | 141 | 828,279 | 994,029 | 90 | 5 | 3,164 | 2,311 | 1,707 | 115 | 0.45 | 0.54 | 31,694 |
| 75 ★ | 175 | 1,518,719 | 1,822,542 | 105 | 5 | 3,164 | 2,744 | 2,065 | 190 | 0.64 | 0.77 | 49,219 |
| 90 ☆ | 209 | 2,587,951 | 3,105,541 | 119 | 5 | 3,164 | 3,178 | 2,423 | 295 | 0.89 | 1.06 | 65,256 |
| 100 ★ | 231 | 3,489,045 | 4,186,800 | 129 | 5 | 3,164 | 3,467 | 2,662 | 375 | 1.06 | 1.28 | 82,020 |

☆ boss wave, ★ realm climax boss.

**Pressure points:**
- wave 90: load 1.06 on day 365 (clear time exceeds the 333s it takes the wave to arrive)
- wave 100: load 1.28 on day 365 (clear time exceeds the 353s it takes the wave to arrive)

## Upgrade cost in waves of income (bottleneck resource)

Each cell: max over the cost resources of (amount needed / income per wave). Coins income = measured coins + average wave bounty around wave 20 (NORMAL).

| Upgrade | Lv2 | Lv3 | Lv4 | Lv5 | Lv10 |
|---|---:|---:|---:|---:|---:|
| Castle wall | 0.1 | 0.1 | 0.1 | 0.2 | 0.8 |
| Aegis shield | 0.2 | 0.3 | 0.4 | 0.6 | 2.6 |
| Wood Grove tower | 0.5 | 0.9 | 1.5 | 2.4 | — |
| Crystal Spire tower | 0.5 | 0.9 | 1.6 | 2.5 | — |
| Research (Slime heal) | 0.3 | 0.4 | 0.6 | 0.8 | 3.5 |
| Slime evolution | 0.4 | 0.6 | 0.8 | 1 | — |

