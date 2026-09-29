import Phaser from 'phaser';
import { InvaderType, INVADER_CONFIGS } from '../../types/game';

/**
 * Legacy vector invader bodies, drawn when an enemy spawns before its baked
 * pixel sprite sheet is ready (see sprites/CharacterSprites.ts).
 */

export function renderInvaderBody(graphics: Phaser.GameObjects.Graphics, type: InvaderType): void {
  graphics.clear();
  const cfg = INVADER_CONFIGS[type];

  if (type === 'HUMAN_KNIGHT' || type === 'VOID_SHADE') {
    // Human Crusader Knight: Shining silver armor, blue cape, iron helmet & sword
    // Cape
    graphics.fillStyle(0x2563eb, 0.9);
    graphics.fillTriangle(0, -18, -9, 0, 9, 0);
    // Silver Torso & Helmet
    graphics.fillStyle(0x94a3b8, 1);
    graphics.fillCircle(0, -14, 6.5);
    // Helmet visor slit
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillRect(-3.5, -15, 7, 2);
    // Gold Crusader Cross
    graphics.fillStyle(0xfbbf24, 1);
    graphics.fillRect(-1, -12, 2, 6);
    graphics.fillRect(-3, -10, 6, 2);
    // Steel Broadsword in hand
    graphics.fillStyle(0xe2e8f0, 1);
    graphics.fillRect(8, -20, 2, 14);
    graphics.fillStyle(0x64748b, 1);
    graphics.fillRect(6, -10, 6, 2);
  } else if (type === 'HUMAN_ARCHER') {
    // Human Ranger / Archer: Green cloak, leather vest, curved wooden bow
    graphics.fillStyle(0x166534, 1);
    graphics.fillTriangle(0, -20, -7, -2, 7, -2);
    graphics.fillStyle(0x15803d, 1);
    graphics.fillCircle(0, -14, 5.5);
    // Face & Archer Hood
    graphics.fillStyle(0xfde047, 1);
    graphics.fillCircle(0, -14, 3);
    // Curved Wooden Bow
    graphics.lineStyle(2, 0x854d0e, 1);
    graphics.strokeCircle(8, -12, 6);
    // Arrow
    graphics.lineStyle(1, 0xffffff, 0.9);
    graphics.lineBetween(4, -12, 12, -12);
  } else if (type === 'MECHA_SCOUT' || type === 'RIFT_STALKER') {
    // Cybernetic Mecha Walker Drone: Dual hydraulic metal legs, glowing neon scanning visor
    // Walker Legs
    graphics.fillStyle(0x475569, 1);
    graphics.fillRect(-8, -4, 4, 7);
    graphics.fillRect(4, -4, 4, 7);
    // Cockpit Chassis
    graphics.fillStyle(0x334155, 1);
    graphics.fillRoundedRect(-9, -20, 18, 14, 4);
    // Cybernetic Neon Scanning Eye (Yellow/Cyan)
    graphics.fillStyle(cfg.color, 1);
    graphics.fillRect(-6, -15, 12, 3);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(0, -13.5, 1.5);
    // Sensor Antenna
    graphics.fillStyle(0x64748b, 1);
    graphics.fillRect(4, -26, 2, 7);
    graphics.fillStyle(0xef4444, 1);
    graphics.fillCircle(5, -26, 2);
  } else if (type === 'DEEP_ONE') {
    // DEEP_ONE: Squid-like sea monster with tentacles
    graphics.fillStyle(0x0284c7, 1); // Dark blue body
    graphics.fillEllipse(0, -14, 12, 16);
    graphics.fillStyle(0x0c4a6e, 1); // Darker shading
    graphics.fillEllipse(0, -15, 10, 14);
    // Giant glowing yellow eye
    graphics.fillStyle(0xfacc15, 1);
    graphics.fillCircle(0, -14, 4);
    graphics.fillStyle(0x000000, 1);
    graphics.fillRect(-1, -16, 2, 4); // Slit pupil
    // Tentacles
    graphics.lineStyle(3, 0x0284c7, 1);
    graphics.beginPath();
    graphics.moveTo(-4, -6);
    graphics.lineTo(-8, 2);
    graphics.lineTo(-12, 0);
    graphics.strokePath();
    graphics.beginPath();
    graphics.moveTo(4, -6);
    graphics.lineTo(8, 2);
    graphics.lineTo(12, 0);
    graphics.strokePath();
    graphics.beginPath();
    graphics.moveTo(0, -4);
    graphics.lineTo(0, 4);
    graphics.lineTo(3, 6);
    graphics.strokePath();
  } else {
    // MECHA_TITAN / CORRUPTED_GOLEM: Heavy Heavy Combat Mecha
    // Heavy Hydraulic Tread Legs
    graphics.fillStyle(0x1e293b, 1);
    graphics.fillRect(-12, -6, 7, 9);
    graphics.fillRect(5, -6, 7, 9);
    // Armored Chestplate Chassis
    graphics.fillStyle(0x334155, 1);
    graphics.fillRoundedRect(-14, -26, 28, 20, 5);
    // Hazard Stripes & Power Core
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillRect(-8, -23, 16, 3);
    graphics.fillStyle(0xef4444, 1);
    graphics.fillCircle(0, -16, 5);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(0, -16, 2);
    // Dual Gatling Arm Cannons
    graphics.fillStyle(0x0f172a, 1);
    graphics.fillRect(-17, -22, 4, 15);
    graphics.fillRect(13, -22, 4, 15);
  }
}

