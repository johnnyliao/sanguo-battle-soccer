import Phaser from 'phaser';
import {
  COUNTRY_INFO,
  getTeam,
  type BodySize,
  type CharacterDef,
  type Country,
  type Role,
  type SpecialKind,
  type Stats,
} from '../data';
import { applyView, textResolution, type View } from './view';

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const GOLD = 0xffd700;
const GREY_PANEL = 0x3a3f46;
const GREY_TEXT = '#7a8088';
const DEFAULT_HALF_SECONDS = 120;

const COUNTRIES: Country[] = ['wei', 'shu', 'wu'];
const GK_SLOT = 0;
const FW_SLOT = 4;
const PANEL_Y = 90;
const PANEL_W = 170;
const PANEL_H = 200;
const ROW_Y0 = 58;
const ROW_STEP = 50;
const ROW_H = 46;
const ROW_X = 10;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** On-screen buttons (touch): 返回 bottom-left, 確定 bottom-right. */
function buttonRects(v: View): { back: Rect; confirm: Rect } {
  return {
    back: { x: 60, y: v.H - 42, w: 120, h: 34 },
    confirm: { x: v.W - 180, y: v.H - 42, w: 120, h: 34 },
  };
}

function hitRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Panels sit in a row centred on the view: 190 apart, the middle one on W / 2. */
function panelCenterX(index: number, v: View): number {
  return v.W / 2 + (index - 1) * 190;
}

function panelRect(index: number, v: View): Rect {
  return { x: panelCenterX(index, v) - PANEL_W / 2, y: PANEL_Y, w: PANEL_W, h: PANEL_H };
}

const ROLE_LABEL: Record<Role, string> = { GK: '守門員', DF: '後衛', MF: '中場', FW: '前鋒' };
const SIZE_LABEL: Record<BodySize, string> = { S: '小', M: '中', L: '大' };
const KIND_LABEL: Record<SpecialKind, string> = { straight: '直線', zigzag: '蛇行', lob: '高吊', pierce: '穿人' };
const STATS: { label: string; key: keyof Stats }[] = [
  { label: '力', key: 'power' },
  { label: '速', key: 'speed' },
  { label: '體', key: 'stamina' },
  { label: '技', key: 'technique' },
  { label: '守', key: 'defense' },
];

type Stage = 'own' | 'opp' | 'general';

function darken(color: number, f: number): number {
  const ch = (shift: number) => Math.round(((color >> shift) & 0xff) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class TeamSelectScene extends Phaser.Scene {
  private stage: Stage = 'own';
  /** Panel cursor for the country stages (own / opp). */
  private cursor = 0;
  private ownCountry: Country = 'wei';
  private oppCountry: Country = 'wu';
  private generalCursor = FW_SLOT;
  private roster: CharacterDef[] = [];
  private halfSeconds = DEFAULT_HALF_SECONDS;
  private started = false;

  private keys!: Record<'A' | 'D' | 'W' | 'S' | 'J' | 'K' | 'ENTER' | 'ESC' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN', Phaser.Input.Keyboard.Key>;

  private panelGfx!: Phaser.GameObjects.Graphics;
  private panelTexts: Phaser.GameObjects.Text[][] = [];
  private panelTags: Phaser.GameObjects.Text[] = [];
  private headerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private listGroup!: Phaser.GameObjects.Container;
  private view!: View;

  constructor() {
    super('TeamSelectScene');
  }

  create(): void {
    (window as unknown as { __sgScene: string }).__sgScene = 'TeamSelectScene';
    this.view = applyView(this, (v) => {
      this.view = v;
      this.buildObjects();
      this.refreshStage();
    });
    (window as unknown as { __sgMenu: () => unknown }).__sgMenu = () => ({
      stage: this.stage,
      cursor: this.stage === 'general' ? this.generalCursor : this.cursor,
      own: this.ownCountry,
      opp: this.oppCountry,
    });

    this.started = false;
    this.stage = 'own';
    this.cursor = 0;
    this.generalCursor = FW_SLOT;
    this.halfSeconds = readHalfSeconds();

    const keyboard = this.input.keyboard!;
    this.keys = keyboard.addKeys('A,D,W,S,J,K,ENTER,ESC,LEFT,RIGHT,UP,DOWN') as typeof this.keys;

    this.buildObjects();
    this.input.on('pointerdown', this.onPointer);

    this.enterStage('own');
  }

  update(): void {
    const k = this.keys;
    const justDown = Phaser.Input.Keyboard.JustDown;
    const left = justDown(k.A) || justDown(k.LEFT);
    const right = justDown(k.D) || justDown(k.RIGHT);
    const up = justDown(k.W) || justDown(k.UP);
    const down = justDown(k.S) || justDown(k.DOWN);
    const confirm = justDown(k.J) || justDown(k.ENTER);
    const back = justDown(k.K) || justDown(k.ESC);

    if (this.stage === 'general') {
      if (up) this.generalCursor = Math.max(GK_SLOT, this.generalCursor - 1);
      if (down) this.generalCursor = Math.min(FW_SLOT, this.generalCursor + 1);
      if (up || down) this.renderList();
    } else {
      if (left) this.cursor = this.nextSelectable(this.cursor, -1);
      if (right) this.cursor = this.nextSelectable(this.cursor, 1);
      if (left || right) this.renderPanels();
    }

    if (confirm) this.onConfirm();
    else if (back) this.onBack();
  }

  /** J / Enter / 確定: confirm the highlighted panel or general. */
  private onConfirm(): void {
    if (this.stage === 'general') {
      this.startMatch();
    } else if (this.stage === 'own') {
      this.ownCountry = COUNTRIES[this.cursor];
      this.enterStage('opp');
    } else {
      this.oppCountry = COUNTRIES[this.cursor];
      this.enterStage('general');
    }
  }

  /** K / Esc / 返回: go back one stage, or to the title from the first stage. */
  private onBack(): void {
    if (this.stage === 'general') this.enterStage('opp');
    else if (this.stage === 'opp') this.enterStage('own');
    else this.scene.start('TitleScene');
  }

  /**
   * Touch / mouse. Country stages: tap a panel to move the cursor there, tap the cursor panel again to confirm.
   * General: tap a row to select it, tap the selected row again to confirm. 確定 / 返回 always work.
   */
  private onPointer = (pointer: Phaser.Input.Pointer): void => {
    // Canvas pixels to logical view units.
    const x = pointer.x / this.view.Z;
    const y = pointer.y / this.view.Z;
    const { back, confirm } = buttonRects(this.view);
    if (hitRect(x, y, confirm)) {
      this.onConfirm();
      return;
    }
    if (hitRect(x, y, back)) {
      this.onBack();
      return;
    }

    if (this.stage === 'general') {
      const slot = Math.floor((y - ROW_Y0) / ROW_STEP);
      const inRow =
        x >= ROW_X && x < this.view.W - ROW_X && slot >= GK_SLOT && slot <= FW_SLOT && y - ROW_Y0 - slot * ROW_STEP < ROW_H;
      if (!inRow) return;
      if (slot === this.generalCursor) {
        this.startMatch();
      } else {
        this.generalCursor = slot;
        this.renderList();
      }
      return;
    }

    const index = COUNTRIES.findIndex((_, i) => hitRect(x, y, panelRect(i, this.view)));
    if (index < 0 || this.isDisabled(index)) return;
    if (index === this.cursor) {
      this.onConfirm();
    } else {
      this.cursor = index;
      this.renderPanels();
    }
  };

  /** Creates the screen objects for the current view. Runs on create and on every resize. */
  private buildObjects(): void {
    this.children.removeAll(true);
    this.panelTexts = [];
    this.panelTags = [];
    const { W, H } = this.view;
    this.add.graphics().fillStyle(0x0b0f14, 1).fillRect(0, 0, W, H);
    this.createPanels();
    this.listGroup = this.add.container(0, 0);
    this.headerText = this.add.text(W / 2, 26, '', this.textStyle('22px', '#ffffff')).setOrigin(0.5);
    this.hintText = this.add.text(W / 2, H - 20, '', this.textStyle('12px', '#d0d8e0', false)).setOrigin(0.5);

    this.drawButtons();
  }

  private textStyle(size: string, color: string, stroke = true): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: FONT,
      fontSize: size,
      color,
      stroke: stroke ? '#000000' : undefined,
      strokeThickness: stroke ? 3 : 0,
      resolution: textResolution(),
    };
  }

  private enterStage(stage: Stage): void {
    this.stage = stage;
    if (stage === 'own') {
      this.cursor = COUNTRIES.indexOf(this.ownCountry);
    } else if (stage === 'opp') {
      this.cursor = this.nextSelectable(-1, 1);
    } else {
      this.roster = getTeam(this.ownCountry);
      this.generalCursor = FW_SLOT;
    }
    this.refreshStage();
  }

  /** Header, hints, panels or list for the current stage. Does not change the cursors. */
  private refreshStage(): void {
    const stage = this.stage;
    this.headerText.setText(
      stage === 'own' ? '選擇你的國家' : stage === 'opp' ? '選擇對手' : '選擇操控的武將',
    );
    this.hintText.setText(
      stage === 'own'
        ? 'A/D 移動　J 確認　K/Esc 返回標題'
        : stage === 'opp'
          ? 'A/D 移動　J 確認　K 返回'
          : 'W/S 移動　J 確認　K 返回',
    );
    const panelsVisible = stage !== 'general';
    this.panelGfx.setVisible(panelsVisible);
    this.panelTexts.flat().forEach((t) => t.setVisible(panelsVisible));
    this.panelTags.forEach((t) => t.setVisible(stage === 'opp'));
    this.listGroup.setVisible(!panelsVisible);
    if (panelsVisible) this.renderPanels();
    else this.renderList();
  }

  /** Next panel index from `from` in direction `dir`, skipping the greyed own country in the opponent stage. */
  private nextSelectable(from: number, dir: 1 | -1): number {
    let i = from + dir;
    while (i >= 0 && i < COUNTRIES.length) {
      if (!this.isDisabled(i)) return i;
      i += dir;
    }
    return from < 0 ? 0 : from;
  }

  private isDisabled(index: number): boolean {
    return this.stage === 'opp' && COUNTRIES[index] === this.ownCountry;
  }

  private drawButtons(): void {
    const button = (r: Rect, label: string) => {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.55);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(2, GOLD, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      this.add.text(r.x + r.w / 2, r.y + r.h / 2, label, this.textStyle('16px', '#ffffff')).setOrigin(0.5);
    };
    const { back, confirm } = buttonRects(this.view);
    button(back, '返回');
    button(confirm, '確定');
  }

  private createPanels(): void {
    this.panelGfx = this.add.graphics();
    COUNTRIES.forEach((country, i) => {
      const cx = panelCenterX(i, this.view);
      const name = this.add.text(cx, 190, COUNTRY_INFO[country].name, this.textStyle('56px', '#ffffff')).setOrigin(0.5);
      const sub = this.add.text(cx, 262, '5 人隊', this.textStyle('14px', '#ffffff')).setOrigin(0.5);
      this.panelTexts.push([name, sub]);
      const tag = this.add.text(cx, 112, '己方', this.textStyle('14px', '#ffd98a')).setOrigin(0.5).setVisible(false);
      this.panelTags.push(tag);
    });
  }

  private renderPanels(): void {
    const g = this.panelGfx;
    g.clear();
    COUNTRIES.forEach((country, i) => {
      const cx = panelCenterX(i, this.view);
      const x = cx - 85;
      const y = PANEL_Y;
      const w = PANEL_W;
      const h = PANEL_H;
      const disabled = this.isDisabled(i);
      const color = disabled ? GREY_PANEL : COUNTRY_INFO[country].color;
      g.fillStyle(color, disabled ? 0.8 : 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(0x000000, 0.18);
      g.fillRect(x, y + h - 36, w, 36);
      g.lineStyle(2, darken(color, 0.5), 1);
      g.strokeRect(x, y, w, h);
      if (i === this.cursor) {
        g.lineStyle(3, GOLD, 1);
        g.strokeRect(x - 4, y - 4, w + 8, h + 8);
      }

      const [name, sub] = this.panelTexts[i];
      name.setColor(disabled ? GREY_TEXT : '#ffffff');
      sub.setColor(disabled ? GREY_TEXT : '#ffffff');
      this.panelTags[i].setVisible(this.stage === 'opp' && country === this.ownCountry);
    });
  }

  private renderList(): void {
    this.listGroup.removeAll(true);
    const add = (obj: Phaser.GameObjects.GameObject) => this.listGroup.add(obj);
    const team = this.roster;
    const teamColor = COUNTRY_INFO[this.ownCountry].color;

    team.forEach((c, slot) => {
      const y0 = ROW_Y0 + slot * ROW_STEP;
      const selected = slot === this.generalCursor;
      const bg = this.add.graphics();
      bg.fillStyle(selected ? teamColor : 0x000000, selected ? 0.35 : 0.45);
      bg.fillRect(ROW_X, y0, this.view.W - ROW_X * 2, 46);
      if (selected) {
        bg.lineStyle(2, GOLD, 1);
        bg.strokeRect(ROW_X, y0, this.view.W - ROW_X * 2, 46);
      }
      add(bg);

      add(this.add.text(22, y0 + 8, ROLE_LABEL[c.role], this.textStyle('11px', '#ffd98a', false)));
      add(this.add.text(22, y0 + 24, c.name, this.textStyle('17px', '#ffffff')));
      add(this.add.text(96, y0 + 10, `體型 ${SIZE_LABEL[c.size]}`, this.textStyle('11px', '#d0d8e0', false)));

      STATS.forEach((stat, si) => {
        const x = 170 + si * 56;
        const value = c.stats[stat.key];
        add(this.add.text(x, y0 + 6, stat.label, this.textStyle('11px', '#ffffff', false)));
        const barBg = this.add.graphics();
        barBg.fillStyle(0x333333, 1);
        barBg.fillRect(x, y0 + 26, 34, 6);
        barBg.fillStyle(value >= 8 ? GOLD : 0x6cd46c, 1);
        barBg.fillRect(x, y0 + 26, (34 * value) / 10, 6);
        add(barBg);
        add(this.add.text(x + 38, y0 + 20, String(value), this.textStyle('11px', '#ffffff', false)));
      });

      const specialX = this.view.W - 178;
      add(this.add.text(specialX, y0 + 8, c.special.name, this.textStyle('13px', '#ffd98a')));
      add(this.add.text(specialX, y0 + 26, `必殺・${KIND_LABEL[c.special.kind]}`, this.textStyle('11px', '#d0d8e0', false)));
    });
  }

  private startMatch(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start('MatchScene', {
      home: this.ownCountry,
      away: this.oppCountry,
      humanIdx: this.generalCursor,
      seed: Date.now() >>> 0,
      halfSeconds: this.halfSeconds,
    });
  }
}

/** Half length from the `half` URL query param (seconds), default 120. */
function readHalfSeconds(): number {
  const raw = new URLSearchParams(window.location.search).get('half');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HALF_SECONDS;
}
