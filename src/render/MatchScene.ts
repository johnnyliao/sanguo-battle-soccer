import Phaser from 'phaser';

export class MatchScene extends Phaser.Scene {
  constructor() {
    super('MatchScene');
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2e8b3a, 1);
    g.fillRect(0, 0, 640, 360);

    g.lineStyle(2, 0xffffff, 1);
    g.lineBetween(320, 0, 320, 360);
    g.strokeCircle(320, 180, 50);
  }
}
