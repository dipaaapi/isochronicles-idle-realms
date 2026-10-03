---
name: codemap
description: Find where things live in IsoChronicle and read only the code you need, instead of analysing the whole project. Use at the start of every session and before any code change, bug hunt or question about how the game works. Also use after adding, removing or renaming source files, to keep the map current.
---

# Codemap (token-lean project navigation)

`src/` is about 1.6 MB (roughly 400k tokens), and many single files run 30–90 KB. Reading "the whole project" costs more than most tasks need. Use this instead:

```
C=.claude/skills/codemap/codemap.mjs
cat .claude/skills/codemap/CODEMAP.md     # ~19 KB: every file, its size, one-line purpose and exports
node $C outline <file>                     # declarations, class methods, component handlers, JSX tabs/sections + line ranges
node $C where <symbol>                     # where it is declared and which files import it
node $C changed [ref]                      # files changed since ref (default HEAD~1), each with its purpose
node $C check                              # files missing from purposes.json / stale entries
node $C build                              # regenerate CODEMAP.md
```

`<file>` can be a path or just a base name (`MainScene`, `EstablishmentModal`).

## How to work

1. **Session start:** read `CLAUDE.md` (already loaded) and `CODEMAP.md`. If you've worked here before, run `git log --oneline -15` and `node $C changed <last-known-commit>` instead of re-reading code. That is enough to explain the project and propose next steps.
2. **Find the code:** pick the files from CODEMAP. If unsure, use `where <symbol>` or a Grep with a narrow `glob`, never a read of every candidate.
3. **Read narrowly:** run `outline <file>`, then `Read` with `offset`/`limit` on just the range you need. Read a whole file only when it is small (under ~300 lines) or you are changing most of it.
4. **Follow dependencies on demand:** when the code calls something unfamiliar, run `where` on it and read that one declaration. Don't read the whole file it lives in.
5. **Data before code:** for balance or text questions, the JSON tables in `src/data/` and `src/i18n/` usually hold the answer. Use `/lore` for story text and `/voxel-model` for sprite models.
6. **Keep the map current:** after adding, removing or renaming files, or changing what a file is for, edit `purposes.json` (one line per file: what it does, not how), then run `check` and `build`. Commit `CODEMAP.md` with the change.

## When a full read is justified

- A refactor that moves logic across many files, or a review the user asked to be thorough. Even then, go directory by directory using CODEMAP, not file by file blindly.
- The user explicitly asks you to read everything.
