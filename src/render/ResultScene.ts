import Phaser from 'phaser';
import { COUNTRY_INFO, type Country } from '../data';

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export interface ResultScorer {
  team: 0 | 1;
  name: string;
  minute: number;
}

export interface ResultInit {
  home: Country;
  away: Country;
  score: [number, number];
  pk: { score: [number, number] } | null;
  scorers: ResultScorer[];
}

function hexCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Winning team index (0 = home, 1 = away) from the score, then the PK score. null when still level. */
function winnerOf(r: ResultInit): 0 | 1 | null {
  const [s0, s1] = r.score;
  if (s0 !== s1) return s0 > s1 ? 0 : 1;
  if (r.pk && r.pk.score[0] !== r.pk.score[1]) return r.pk.score[0] > r.pk.score[1] ? 0 : 1;
  return null;
}

export class ResultScene extends Phaser.Scene {
  private result!: ResultInit;
  private started = false;
  private confirmKeys!: Record<'J' | 'ENTER', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultInit): void {
    this.result = data;
  }

  create(): void {
    (window as unknown as { __sgScene: string }).__sgScene = 'ResultScene';
    this.started = false;
    const r = this.result;
    const homeInfo = COUNTRY_INFO[r.home];
    const awayInfo = COUNTRY_INFO[r.away];

    const g = this.add.graphics();
    g.fillStyle(0x0b0f14, 1);
    g.fillRect(0, 0, 640, 360);
    g.fillStyle(0x1d5a2a, 0.35);
    g.fillRect(0, 60, 640, 240);

    const style = (size: string, color = '#ffffff', stroke = true): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: size,
      color,
      stroke: stroke ? '#000000' : undefined,
      strokeThickness: stroke ? 4 : 0,
      resolution: 2,
    });

    this.add.text(320, 30, '比賽結束', style('26px', '#ffd98a')).setOrigin(0.5);

    this.add
      .text(250, 96, homeInfo.name, style('30px', hexCss(homeInfo.color)))
      .setOrigin(1, 0.5);
    this.add.text(320, 96, `${r.score[0]} - ${r.score[1]}`, style('40px')).setOrigin(0.5);
    this.add
      .text(390, 96, awayInfo.name, style('30px', hexCss(awayInfo.color)))
      .setOrigin(0, 0.5);

    if (r.pk) {
      this.add
        .text(320, 136, `PK ${r.pk.score[0]} - ${r.pk.score[1]}`, style('18px', '#ffffff'))
        .setOrigin(0.5);
    }

    const winner = winnerOf(r);
    const winnerText = winner === null ? '平手' : `${COUNTRY_INFO[winner === 0 ? r.home : r.away].name} 勝利！`;
    this.add.text(320, 170, winnerText, style('22px', '#ffd98a')).setOrigin(0.5);

    this.drawScorers(0, r.home, 160);
    this.drawScorers(1, r.away, 480);

    const prompt = this.add.text(320, 330, '按 J 回到標題', style('16px')).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    this.confirmKeys = this.input.keyboard!.addKeys('J,ENTER') as Record<'J' | 'ENTER', Phaser.Input.Keyboard.Key>;
  }

  update(): void {
    const { J, ENTER } = this.confirmKeys;
    if (Phaser.Input.Keyboard.JustDown(J) || Phaser.Input.Keyboard.JustDown(ENTER)) {
      this.backToTitle();
    }
  }

  private backToTitle(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start('TitleScene');
  }

  private drawScorers(team: 0 | 1, country: Country, centerX: number): void {
    const info = COUNTRY_INFO[country];
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: 2,
    };
    this.add
      .text(centerX, 196, `${info.name} 進球`, { ...style, color: hexCss(info.color) })
      .setOrigin(0.5, 0);
    const scorers = this.result.scorers.filter((s) => s.team === team);
    if (scorers.length === 0) {
      this.add.text(centerX, 220, '（無進球）', { ...style, color: '#b0b8c0' }).setOrigin(0.5, 0);
      return;
    }
    scorers.forEach((s, i) => {
      this.add.text(centerX, 220 + i * 22, `${s.name}  ${s.minute}'`, style).setOrigin(0.5, 0);
    });
  }
}
