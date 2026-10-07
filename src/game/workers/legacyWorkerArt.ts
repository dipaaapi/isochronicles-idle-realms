import Phaser from 'phaser';
import { HarvestTask, TASK_CONFIG, UnitClass, WorkerEquipment } from '../../types/game';

/**
 * Legacy vector minion bodies and cargo icons. Minions use these until their
 * baked pixel sprite sheet arrives (see sprites/CharacterSprites.ts).
 */

export function renderWorkerGraphics(
  graphics: Phaser.GameObjects.Graphics,
  unitClass: UnitClass,
  task: HarvestTask,
  equipment?: WorkerEquipment
): void {
  graphics.clear();

  // 1. BASE DEMON & BEAST CHASSIS
  if (unitClass === 'GOLEM') {
    // Batong Demonyo (Hellrock Brute): Obsidian body, curved horns, glowing red volcanic core
    graphics.fillStyle(0x18181b, 1);
    graphics.fillCircle(0, -12, 10);
    // Demonic curved obsidian horns
    graphics.fillStyle(0xd97706, 1); // Amber horn tips
    graphics.fillTriangle(-7, -18, -12, -26, -3, -18);
    graphics.fillTriangle(7, -18, 12, -26, 3, -18);
    // Glowing fiery demonic eyes
    graphics.fillStyle(0xef4444, 1);
    graphics.fillCircle(-3, -12, 2.5);
    graphics.fillCircle(3, -12, 2.5);
    graphics.fillStyle(0xfef08a, 1);
    graphics.fillCircle(-3, -12, 1);
    graphics.fillCircle(3, -12, 1);
    // Spiked demonic shoulders
    graphics.fillStyle(0x451a03, 1);
    graphics.fillRect(-12, -14, 3, 6);
    graphics.fillRect(9, -14, 3, 6);
  } else if (unitClass === 'LAVA_GARGOYLE') {
    // Mabangis na Hellhound: Quadruped wolf snout, fiery red/orange coat, pointed ears
    graphics.fillStyle(0x431407, 1);
    graphics.fillTriangle(0, -20, -8, -2, 8, -2);
    // Fiery orange mane
    graphics.fillStyle(0xf97316, 1);
    graphics.fillCircle(0, -14, 6.5);
    // Wolf snout
    graphics.fillStyle(0x7c2d12, 1);
    graphics.fillRect(-2.5, -12, 5, 4);
    // Sharp pointed beast ears
    graphics.fillStyle(0xe11d48, 1);
    graphics.fillTriangle(-6, -18, -8, -25, -2, -18);
    graphics.fillTriangle(6, -18, 8, -25, 2, -18);
    // Burning amber eyes
    graphics.fillStyle(0xfacc15, 1);
    graphics.fillCircle(-2.5, -15, 1.5);
    graphics.fillCircle(2.5, -15, 1.5);
  } else if (unitClass === 'SUCCUBUS') {
    // SUCCUBUS: Lumilipad na Arch-Demon with leathery bat wings & purple arcane aura
    // Flying leathery bat wings
    graphics.fillStyle(0x581c87, 0.9);
    graphics.fillTriangle(-14, -20, -5, -12, -8, -4);
    graphics.fillTriangle(14, -20, 5, -12, 8, -4);
    // Arch-demon torso & head
    graphics.fillStyle(0x3b0764, 1);
    graphics.fillCircle(0, -13, 8);
    // Mystic demon horns
    graphics.fillStyle(0xa855f7, 1);
    graphics.fillTriangle(-5, -19, -8, -27, -2, -19);
    graphics.fillTriangle(5, -19, 8, -27, 2, -19);
    // Glowing purple demonic visage
    graphics.fillStyle(0xc084fc, 1);
    graphics.fillCircle(-2.5, -13, 2);
    graphics.fillCircle(2.5, -13, 2);
    graphics.fillCircle(-2.5, -13, 1);
    graphics.fillCircle(2.5, -13, 1);
  } else if (unitClass === 'AQUA_SLIME') {
    // AQUA_SLIME: Soft round blue slime, squishy and amphibious
    graphics.fillStyle(0x0ea5e9, 0.9);
    graphics.fillEllipse(0, -8, 12, 10);
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillEllipse(0, -9, 10, 8);
    // Large cute black eyes
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillCircle(-4, -9, 1.5);
    graphics.fillCircle(4, -9, 1.5);
    // Cheek blushes
    graphics.fillStyle(0x3b82f6, 0.6);
    graphics.fillCircle(-6, -7, 2);
    graphics.fillCircle(6, -7, 2);
  } else if (unitClass === 'TREANT') {
    // TREANT: Ancient Walking Bark Treant with green leafy crown and glowing emerald nature eyes
    graphics.fillStyle(0x451a03, 1); // Dark rich bark body
    graphics.fillRect(-8, -20, 16, 18);
    graphics.fillCircle(0, -20, 9);
    // Root legs
    graphics.fillStyle(0x3b1d07, 1);
    graphics.fillRect(-9, -2, 5, 6);
    graphics.fillRect(4, -2, 5, 6);
    // Leafy crown canopy
    graphics.fillStyle(0x15803d, 1);
    graphics.fillCircle(0, -28, 8);
    graphics.fillCircle(-7, -25, 6);
    graphics.fillCircle(7, -25, 6);
    graphics.fillStyle(0x22c55e, 0.85);
    graphics.fillCircle(0, -30, 5);
    // Ancient glowing emerald nature eyes
    graphics.fillStyle(0x86efac, 1);
    graphics.fillCircle(-3.5, -19, 2);
    graphics.fillCircle(3.5, -19, 2);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(-3.5, -19, 1);
    graphics.fillCircle(3.5, -19, 1);
    // Wooden branch arm
    graphics.fillStyle(0x78350f, 1);
    graphics.fillRect(8, -18, 3, 12);
  } else if (unitClass === 'MERMAN') {
    graphics.fillStyle(0x075985, 1);
    graphics.fillEllipse(0, -11, 16, 20);
    graphics.fillStyle(0x22d3ee, 1);
    graphics.fillCircle(0, -21, 7);
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillCircle(-2.5, -22, 1.5);
    graphics.fillCircle(2.5, -22, 1.5);
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillTriangle(-8, -5, -14, 2, -2, -1);
    graphics.fillTriangle(8, -5, 14, 2, 2, -1);
  } else if (unitClass === 'NECROMANCER') {
    graphics.fillStyle(0x312e81, 1);
    graphics.fillTriangle(0, -27, -11, 2, 11, 2);
    graphics.fillStyle(0xe2e8f0, 1);
    graphics.fillCircle(0, -19, 6);
    graphics.fillStyle(0x7c3aed, 1);
    graphics.fillCircle(-2, -19, 1.5);
    graphics.fillCircle(2, -19, 1.5);
    graphics.lineStyle(2, 0xa78bfa, 1);
    graphics.lineBetween(10, -25, 10, 2);
    graphics.fillStyle(0xc084fc, 1);
    graphics.fillCircle(10, -27, 3);
  }

  // 2. DYNAMIC APPOINTED TASK ATTIRE & TOOLS
  if (task === 'BUILD') {
    // Ancient Builder Spanner & Nature Growth Staff
    graphics.fillStyle(0x78350f, 1);
    graphics.fillRect(9, -24, 2.5, 20); // wooden staff
    graphics.fillStyle(0x22c55e, 1);
    graphics.fillCircle(10, -24, 4); // glowing nature orb on staff
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(10, -24, 1.5);
    // Builder hammer in other hand
    graphics.fillStyle(0x64748b, 1);
    graphics.fillRect(-12, -18, 4, 6);
  } else if (task === 'AETHER') {
    // Mining hardhat with glowing cyan crystal lamp
    graphics.fillStyle(0x0284c7, 1);
    graphics.fillRect(-6, -21, 12, 3);
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillCircle(0, -21, 2.5);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(0, -21, 1);

    // Crystalline Mining Pickaxe held in right hand
    graphics.fillStyle(0x78350f, 1);
    graphics.fillRect(9, -18, 2, 14); // wooden haft
    graphics.fillStyle(0x38bdf8, 1);
    graphics.fillTriangle(6, -20, 14, -20, 10, -15); // crystal pick
    graphics.fillStyle(0xffffff, 0.8);
    graphics.fillCircle(6, -20, 1.5);
  } else if (task === 'WOOD') {
    // Forest Lumberjack Broadaxe
    graphics.fillStyle(0x522e11, 1);
    graphics.fillRect(9, -18, 2.5, 14); // wood handle
    graphics.fillStyle(0x10b981, 1);
    graphics.fillRect(5, -21, 8, 6); // axe blade
    graphics.fillStyle(0xe2e8f0, 0.95);
    graphics.fillRect(11, -21, 2, 6); // razor edge

    // Lumberjack harness
    graphics.lineStyle(1.5, 0x10b981, 0.8);
    graphics.lineBetween(-7, -14, 7, -6);
  } else if (task === 'STONE') {
    // Heavy Quarry Sledgehammer
    graphics.fillStyle(0x334155, 1);
    graphics.fillRect(9, -20, 3, 16); // reinforced handle
    graphics.fillStyle(0x64748b, 1);
    graphics.fillRect(5, -23, 10, 7); // heavy stone head
    graphics.lineStyle(1, 0xf59e0b, 0.9);
    graphics.strokeRect(5, -23, 10, 7);

    // Basalt shoulder pauldron
    graphics.fillStyle(0x1e293b, 1);
    graphics.fillRect(-12, -16, 4, 6);
  } else if (task === 'ESSENCE') {
    // Void Aether Broadsword
    graphics.fillStyle(0xc084fc, 1);
    graphics.fillRect(9, -26, 2.5, 18); // glowing blade
    graphics.fillStyle(0xa855f7, 1);
    graphics.fillRect(6, -12, 8, 2.5); // crossguard
    graphics.fillStyle(0xffffff, 0.95);
    graphics.fillCircle(10, -26, 2); // razor tip

    // Glowing battle crest visor
    graphics.fillStyle(0xa855f7, 0.9);
    graphics.fillRect(-4, -13, 8, 2.5);
  } else if (task === 'FISH') {
    // Fishing rod
    graphics.lineStyle(2, 0x78350f, 1);
    graphics.lineBetween(8, -12, 16, -26);
    graphics.lineStyle(1, 0xffffff, 0.5);
    graphics.lineBetween(16, -26, 16, -10); // fishing line
  } else if (task === 'WATER') {
    // Water Bucket
    graphics.fillStyle(0x737373, 1);
    graphics.fillRect(6, -15, 6, 6);
    graphics.lineStyle(1, 0x171717, 1);
    graphics.strokeRect(6, -15, 6, 6);
    // water inside
    graphics.fillStyle(0x3b82f6, 0.9);
    graphics.fillRect(7, -14, 4, 2);
  } else if (task === 'HEAL' || unitClass === 'AQUA_SLIME') {
    // Golden / emerald glowing healing halo
    graphics.lineStyle(1.5, 0x22c55e, 0.9);
    graphics.strokeEllipse(0, -22, 9, 3);
    graphics.fillStyle(0x86efac, 0.8);
    graphics.fillCircle(0, -22, 1.5);
  }

  // 3. EQUIPPED GEAR OVERLAYS
  if (equipment?.armor) {
    graphics.lineStyle(1.5, 0x38bdf8, 0.85);
    graphics.strokeCircle(0, -12, 10.5);
  }
}

export function renderCargoGraphics(graphics: Phaser.GameObjects.Graphics, task: HarvestTask): void {
  graphics.clear();
  const taskCfg = TASK_CONFIG[task];
  graphics.fillStyle(taskCfg.color, 1);

  if (task === 'AETHER') {
    graphics.fillTriangle(0, -28, -5, -18, 5, -18);
  } else if (task === 'WOOD') {
    graphics.fillRect(-5, -24, 10, 6);
  } else if (task === 'STONE') {
    graphics.fillCircle(0, -22, 5);
  } else if (task === 'ESSENCE') {
    graphics.fillCircle(0, -22, 5.5);
  } else if (task === 'FISH') {
    // Fish shape
    graphics.fillEllipse(0, -22, 6, 4);
    graphics.fillTriangle(-6, -22, -10, -26, -10, -18);
  } else if (task === 'WATER') {
    // Water drop shape
    graphics.fillCircle(0, -22, 4);
    graphics.fillTriangle(-3.5, -23, 3.5, -23, 0, -28);
  }
}
