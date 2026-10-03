---
name: voxel-model
description: Edit or improve the voxel models for minions, invaders and structures (src/game/sprites/minionModels.ts, enemyModels.ts, structureModels.ts) on a small token budget. Use whenever a task changes a character or building model, its pose or animation, its colours, or asks to make a model match its portrait or Codex art.
---

# Voxel model editing (token-lean)

The model files are big (`minionModels.ts` ~1,150 lines, `enemyModels.ts` ~740, `structureModels.ts` ~1,630) and rendered sheets are large images. Most of the cost of a model task comes from reading whole files and looking at full-size sheets. This skill replaces both with a helper that prints one model and renders only the frames you ask for.

```
T=.claude/skills/voxel-model/model-tool.mjs
node $T list                         # every model + its line range (no file reading)
node $T show <key>                   # only that model's source, with line numbers
node $T stats <key>                  # size, foot, materials (hex + voxel counts), parts tree, animation frame counts
node $T render <key> [options]       # PNG of selected frames
```

Render options: `--anim walk|attack|idle|<structure anim>|all` (default idle), `--frames 0,2`, `--dirs 0,2,4,6` (characters; 0 faces the viewer, steps 45° clockwise), `--scale 1-4` (default 3), `--ref` (reference art beside the render; needs `python3` + Pillow), `--out file.png`. Output defaults to `$MODEL_TOOL_OUT` or `/tmp/iso-model-tool/`; point `MODEL_TOOL_OUT` at the session scratchpad. Needs `npm install` (uses the repo's esbuild). Each run takes about a second.

Keys are the names in `MINION_MODELS` / `ENEMY_MODELS` / `STRUCTURE_MODELS` (`harpy`, `knight`, `voidgate`, …). Reference art lives in `public/portraits/<kebab-name>.png` (characters) and `public/structures/<STRUCTURE_ART name>.jpg` (buildings); the tool resolves it for you.

## Token rules

1. **Never Read a whole model file.** Use `list` and then `show <key>`. To see shared helpers (`box`, `ell`, `ball`, `pair`, `mirrorX`, `breathe`, `STRIDE`), read only the first ~45 lines of the file.
2. **Use `stats` before looking at any image.** Colour, size, proportion and part-hierarchy questions are usually answered by text.
3. **Look at one small image per iteration, not the whole sheet.** Start with `render <key> --frames 0 --dirs 0 --scale 2 --ref` (one frame next to the reference). Add directions or frames only when the change affects them: `--dirs 0,2` for side profiles, `--anim walk --frames 0,2 --dirs 2` for a stride, `--anim attack --dirs 0` for a swing.
4. **Edit with targeted `Edit` calls** using line numbers from `show`. Do not rewrite a whole model function to change a few shapes.
5. **Batch changes before you render.** Make all the edits for one idea, render once, compare, and repeat. Avoid one render per tiny change.
6. **Do not re-read after editing.** Re-run `show` only if you need fresh line numbers for the next edit.
7. **Final check only:** one `--anim all --dirs 0,2,4,6 --scale 2` render at the end to catch broken poses, then `npx tsc --noEmit`.

## Model conventions (so you don't need to read VoxelSprite.ts)

- Model space: +x = the character's right, +y = forward (facing), +z = up. Units are voxels. `size` is the grid `[W, D, H]`; anything outside is clipped. `foot` is the ground contact point.
- Shapes: `box(min → max, exclusive max)`, `ellipsoid(center, radii)`, `cylinder(center = base centre, radius, height)`. Each has a `mat` index into `materials`. **Later shapes overwrite earlier ones**, so put details (eyes, trims) last.
- Parts have a `pivot` (joint) and an optional `parent`; a pose rotates a part and its children about the pivot. Pose fields are `pitch` (about +x; positive swings a hanging limb forward), `roll` (about +y), `yaw` (about +z), `offset`, `scale`, `hidden`. Angles are radians.
- Characters need `walk`, `attack` and `idle` pose arrays. Structures have named animations plus `rates` (fps) and `loops`.
- `emissive: true` materials skip lighting (eyes, cores, flames). Colours are `0xRRGGBB`.
- `pixelsPerVoxel` scales the sprite; `recolorModel` makes tinted variants without a new model.
- Structures render from one fixed camera (`STRUCTURE_DIRECTION`): model +y runs along grid +x and model +x along grid +y. Tile size is `VOXELS_PER_TILE` (~25.5 voxels).

## Matching the reference art (CLAUDE.md rule)

Silhouette, colours, weapons and props must follow the reference. Before calling a change done, look at one `--ref` render and check, in this order: silhouette and proportions → main colours (compare `stats` hex values to the art) → weapon/props present and on the correct side (+x is the character's right, which is the viewer's left in direction 0) → animation reads clearly. Note any deliberate deviations in the commit message.

## Done when

- `npx tsc --noEmit` passes, and `npm test` passes if you touched anything outside the model functions.
- The final render shows no clipped parts (raise `size` if needed), no floating limbs in any frame, and the foot sits on the ground.
- In-game check (only if you changed the sprite pipeline, `size` or `foot`): the unit lines up on its tile; use the `run` skill.
