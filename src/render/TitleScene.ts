import Phaser from 'phaser';

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const GOLD_CSS = '#ffd98a';

/** Best-effort fullscreen and landscape lock for phones. Failures (e.g. iOS) are ignored. */
function tryFullscreenLandscape(scene: Phaser.Scene): void {
  try {
    scene.scale.startFullscreen();
  } catch {
    // Fullscreen not available.
  }
  try {
    screen.orientation?.lock?.('landscape')?.catch(() => undefined);
  } catch {
    // Orientation lock not available.
  }
}

/** Title screen: press J / Enter / Space / click to go to team select. */
export class TitleScene extends Phaser.Scene {
  private started = false;
  private startKeys!: Record<'J' | 'ENTER' | 'SPACE', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    (window as unknown as { __sgScene: string }).__sgScene = 'TitleScene';
    this.started = false;

    this.drawBackground();

    const style = (size: string, color = '#ffffff', stroke = true): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: size,
      color,
      stroke: stroke ? '#000000' : undefined,
      strokeThickness: stroke ? 4 : 0,
      resolution: 2,
    });

    this.add.text(320, 110, '三國戰鬥足球', style('48px', GOLD_CSS, true)).setOrigin(0.5);
    this.add.text(320, 160, '5 人制亂鬥足球', style('16px')).setOrigin(0.5);

    const prompt = this.add.text(320, 230, '按 J 或 Enter 開始', style('18px')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    const helpStyle = style('11px', '#d0d8e0', false);
    this.add
      .text(320, 296, 'WASD 移動（連按兩下衝刺）　J 射門／攻擊（按住蓄力必殺）', helpStyle)
      .setOrigin(0.5);
    this.add.text(320, 316, 'K 傳球／跳躍　L 叫傳球', helpStyle).setOrigin(0.5);

    const keyboard = this.input.keyboard!;
    this.startKeys = keyboard.addKeys('J,ENTER,SPACE') as Record<'J' | 'ENTER' | 'SPACE', Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', () => {
      if (this.sys.game.device.input.touch) tryFullscreenLandscape(this);
      this.go();
    });
  }

  update(): void {
    const { J, ENTER, SPACE } = this.startKeys;
    if (Phaser.Input.Keyboard.JustDown(J) || Phaser.Input.Keyboard.JustDown(ENTER) || Phaser.Input.Keyboard.JustDown(SPACE)) {
      this.go();
    }
  }

  private go(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start('TeamSelectScene');
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0b0f14, 1);
    g.fillRect(0, 0, 640, 360);
    for (let y = 0, i = 0; y < 360; y += 30, i++) {
      g.fillStyle(i % 2 === 0 ? 0x1d5a2a : 0x194d24, 1);
      g.fillRect(0, y, 640, 30);
    }
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 80, 640, 200);
  }
}
