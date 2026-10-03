# Balance simulation report

Wave cycle modelled as 150s countdown + 60s fight = 210s.
Income is measured from the real tenant AI (900 s headless run), plus landmark yields.

## Measured income per minute

| Resource | Core 4 (Wood, Quarry, Mine, Port) | All 13 establishments |
|---|---:|---:|
| wood | 39.7 | 30.5 |
| stone | 28.8 | 90.7 |
| fish | 16.1 | 45.8 |
| water | 19.7 | 38.3 |
| metal | 21.3 | 46.1 |
| charcoal | 11.5 | 28.9 |
| coal | 15.5 | 19.3 |
| minerals | 9.9 | 26.9 |
| scrapMetal | 1.9 | 5.9 |
| aetherShards | 0 | 39.5 |
| arcaneEssence | 0 | 54.9 |
| obsidianShard | 0 | 30.5 |
| soulFragments | 0 | 16 |
| abyssalPearl | 0 | 10.5 |
| coins | 0 | 60.1 |

## Opening: castle + Crystal Spire + core 4 establishments

Total cost: 25 aetherShards, 135 wood, 125 stone, 160 coins

| Difficulty | Start stockpile | Shortfall | Shortfall in coins (market buy) |
|---|---|---|---:|
| EASY | 75 aetherShards, 218 wood, 203 stone, 270 coins | none | 0 |
| NORMAL | 50 aetherShards, 145 wood, 135 stone, 180 coins | none | 0 |
| HARD | 45 aetherShards, 131 wood, 122 stone, 162 coins | 4 wood, 3 stone | 120 |

## EASY: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant DPS), portals excluded. Defenses keep up while clear time < arrival time (2.2s per invader + 30s).

| Wave | Enemies | Wave HP | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Clear time (s) | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 285 | 13.5 | 1 | 162 | 578 | 0.4 | 72 |
| 5 ☆ | 12 | 2,202 | 17.5 | 1 | 162 | 722 | 2.5 | 607 |
| 10 ☆ | 22 | 7,527 | 23.5 | 1 | 162 | 867 | 7.3 | 1,282 |
| 15 ☆ | 32 | 17,049 | 28.8 | 2 | 246 | 1,011 | 13.6 | 2,177 |
| 20 ☆ | 42 | 30,986 | 32.2 | 2 | 246 | 1,156 | 22.1 | 3,085 |
| 25 ★ | 52 | 53,108 | 35.5 | 2 | 246 | 1,300 | 34.4 | 4,573 |
| 30 ☆ | 62 | 77,576 | 38.9 | 3 | 812 | 1,444 | 34.4 | 5,359 |
| 40 ☆ | 82 | 155,868 | 45.7 | 3 | 812 | 1,733 | 61.2 | 8,243 |
| 50 ★ | 102 | 279,874 | 52.4 | 4 | 1,061 | 2,022 | 90.8 | 12,164 |
| 60 ☆ | 122 | 439,964 | 59.2 | 5 | 3,164 | 2,311 | 80.4 | 15,841 |
| 75 ★ | 152 | 807,723 | 69.3 | 5 | 3,164 | 2,744 | 137 | 23,570 |
| 90 ☆ | 182 | 1,306,381 | 79.5 | 5 | 3,164 | 3,178 | 206 | 31,817 |
| 100 ★ | 202 | 1,763,218 | 86.3 | 5 | 3,164 | 3,467 | 266 | 38,790 |

☆ boss wave, ★ realm climax boss.

## NORMAL: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant DPS), portals excluded. Defenses keep up while clear time < arrival time (2.2s per invader + 30s).

| Wave | Enemies | Wave HP | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Clear time (s) | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 380 | 18 | 1 | 162 | 578 | 0.5 | 72 |
| 5 ☆ | 12 | 2,936 | 23.3 | 1 | 162 | 722 | 3.3 | 607 |
| 10 ☆ | 22 | 10,037 | 31.4 | 1 | 162 | 867 | 9.8 | 1,282 |
| 15 ☆ | 32 | 22,732 | 38.4 | 2 | 246 | 1,011 | 18.1 | 2,177 |
| 20 ☆ | 42 | 41,315 | 42.9 | 2 | 246 | 1,156 | 29.5 | 3,085 |
| 25 ★ | 52 | 70,810 | 47.4 | 2 | 246 | 1,300 | 45.8 | 4,573 |
| 30 ☆ | 62 | 103,434 | 51.9 | 3 | 812 | 1,444 | 45.8 | 5,359 |
| 40 ☆ | 82 | 207,824 | 60.9 | 3 | 812 | 1,733 | 81.6 | 8,243 |
| 50 ★ | 102 | 373,166 | 69.9 | 4 | 1,061 | 2,022 | 121 | 12,164 |
| 60 ☆ | 122 | 586,618 | 78.9 | 5 | 3,164 | 2,311 | 107 | 15,841 |
| 75 ★ | 152 | 1,076,964 | 92.5 | 5 | 3,164 | 2,744 | 182 | 23,570 |
| 90 ☆ | 182 | 1,741,841 | 106 | 5 | 3,164 | 3,178 | 275 | 31,817 |
| 100 ★ | 202 | 2,350,957 | 115 | 5 | 3,164 | 3,467 | 355 | 38,790 |

☆ boss wave, ★ realm climax boss.

## HARD: waves vs defenses

Every establishment stands, towers at the scheduled level. "Clear time" = wave HP / (tower + tenant DPS), portals excluded. Defenses keep up while clear time < arrival time (2.2s per invader + 30s).

| Wave | Enemies | Wave HP | Hit dmg | Tower Lv | Tower DPS | Tenant DPS | Clear time (s) | Bounty |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 513 | 24.3 | 1 | 162 | 578 | 0.7 | 101 |
| 5 ☆ | 12 | 3,964 | 31.4 | 1 | 162 | 722 | 4.5 | 850 |
| 10 ☆ | 22 | 13,549 | 42.3 | 1 | 162 | 867 | 13.2 | 1,795 |
| 15 ☆ | 32 | 30,688 | 51.8 | 2 | 246 | 1,011 | 24.4 | 3,048 |
| 20 ☆ | 42 | 55,775 | 57.9 | 2 | 246 | 1,156 | 39.8 | 4,319 |
| 25 ★ | 52 | 95,594 | 64 | 2 | 246 | 1,300 | 61.8 | 6,402 |
| 30 ☆ | 62 | 139,636 | 70.1 | 3 | 812 | 1,444 | 61.9 | 7,502 |
| 40 ☆ | 82 | 280,563 | 82.2 | 3 | 812 | 1,733 | 110 | 11,540 |
| 50 ★ | 102 | 503,773 | 94.4 | 4 | 1,061 | 2,022 | 163 | 17,030 |
| 60 ☆ | 122 | 791,934 | 107 | 5 | 3,164 | 2,311 | 145 | 22,178 |
| 75 ★ | 152 | 1,453,902 | 125 | 5 | 3,164 | 2,744 | 246 | 32,998 |
| 90 ☆ | 182 | 2,351,485 | 143 | 5 | 3,164 | 3,178 | 371 | 44,544 |
| 100 ★ | 202 | 3,173,792 | 155 | 5 | 3,164 | 3,467 | 479 | 54,307 |

☆ boss wave, ★ realm climax boss.

**Pressure points:**
- wave 100: clear time 479s exceeds the 474s it takes the wave to arrive

## Upgrade cost in waves of income (bottleneck resource)

Each cell: max over the cost resources of (amount needed / income per wave). Coins income = measured coins + average wave bounty around wave 20 (NORMAL).

| Upgrade | Lv2 | Lv3 | Lv4 | Lv5 | Lv10 |
|---|---:|---:|---:|---:|---:|
| Castle wall | 0.1 | 0.1 | 0.2 | 0.2 | 1 |
| Aegis shield | 0.2 | 0.3 | 0.4 | 0.5 | 2.4 |
| Wood Grove tower | 0.5 | 0.8 | 1.4 | 2.3 | — |
| Crystal Spire tower | 0.4 | 0.9 | 1.4 | 2.3 | — |
| Research (Slime heal) | 0.3 | 0.4 | 0.5 | 0.7 | 3.3 |
| Slime evolution | 0.4 | 0.6 | 0.8 | 0.9 | — |

