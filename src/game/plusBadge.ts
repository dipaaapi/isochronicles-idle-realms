import Phaser from 'phaser';

/**
 * Gold "+N" above a minion's or invader's head (Generals show theirs through
 * the brawl badge). Created on first use and kept on the container's data.
 */
export function setPlusBadge(scene: Phaser.Scene, container: Phaser.GameObjects.Container, level: number): void {
  let badge = container.getData('seaBadge') as Phaser.GameObjects.Text | undefined;
  if (level <= 0) {
    badge?.setText('');
    return;
  }
  if (!badge || !badge.active) {
    badge = scene.add.text(8, -42, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#fde047', stroke: '#0c4a6e', strokeThickness: 3, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    container.add(badge);
    container.setData('seaBadge', badge);
  }
  badge.setText(`+${level}`);
}
