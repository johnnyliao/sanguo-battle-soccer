import Phaser from 'phaser';
import { computeAIInputs, createAIState, type AIState } from '../ai';
import { AudioPlayer } from '../audio';
import { COUNTRY_INFO, getTeam, SIZE_PARAMS, type Country, type SpecialKind } from '../data';
import { LocalInput } from '../input';
import {
  BALL_RADIUS,
  CHARGE_FULL,
  FIELD_D,
  FIELD_W,
  GK_AREA_DEPTH,
  GOAL_DEPTH,
  GOAL_H,
  EMPTY_INPUT,
  GOAL_HALF_W,
  TICK_HZ,
  createInitialState,
  step,
  type GameState,
  type MatchPhase,
  type MatchState,
  type Player,
  type SimEvent,
} from '../sim';
import { DEPTH_SCALE, cameraTargetX, worldToScreen, FIELD_TOP } from './projection';
import type { ResultInit, ResultScorer } from './ResultScene';

export interface MatchInit {
  home?: Country;
  away?: Country;
  humanIdx?: number;
  seed?: number;
  halfSeconds?: number;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

const STEP_MS = 1000 / TICK_HZ;
const MAX_STEPS_PER_FRAME = 4;
const MAX_FRAME_MS = 100;
const CAMERA_LERP = 0.15;
const TRAIL_LEN = 8;
const PLAY_AREA_TOP = FIELD_TOP;
const GRASS_X0 = -60;
const GRASS_X1 = FIELD_W + 60;

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const SKIN = 0xf1c27d;
const GK_TINT = 0xffe14d;
const HUMAN_MARK = 0xffe14d;
const GOLD = 0xffd700;
const SPECIAL_COLORS: Record<SpecialKind, number> = {
  straight: 0xff9f1c,
  zigzag: 0x3ff0ff,
  lob: 0xb07cff,
  pierce: 0xff3b3b,
};

function hexCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function darken(color: number, f: number): number {
  const ch = (shift: number) => Math.round(((color >> shift) & 0xff) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class MatchScene extends Phaser.Scene {
  private homeCountry: Country = 'shu';
  private awayCountry: Country = 'wei';
  private humanIdx = 4;
  private seed = 1;
  private halfSeconds = 120;

  private state!: GameState;
  private localInput!: LocalInput;
  private aiState!: AIState;
  private humanMask: boolean[] = [];
  /** Test-only (`?ai=0`): non-human players stand still instead of running AI. */
  private aiOff = false;
  private audio = new AudioPlayer();
  private accumulator = 0;
  private teamColors: [number, number] = [0, 0];
  private playerViews: PlayerView[] = [];
  private ballGfx!: Phaser.GameObjects.Graphics;
  private ballShadowGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private trail: TrailPoint[] = [];

  private homeText!: Phaser.GameObjects.Text;
  private awayText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private hudNameText!: Phaser.GameObjects.Text;
  private hudSpecialText!: Phaser.GameObjects.Text;
  private hudBarsGfx!: Phaser.GameObjects.Graphics;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private specialText!: Phaser.GameObjects.Text;
  private specialUntil = 0;
  private prevPhase: MatchPhase | null = null;
  private scorers: ResultScorer[] = [];
  private resultQueued = false;

  constructor() {
    super('MatchScene');
  }

  init(data?: MatchInit): void {
    this.homeCountry = data?.home ?? 'shu';
    this.awayCountry = data?.away ?? 'wei';
    this.humanIdx = data?.humanIdx ?? 4;
    this.seed = data?.seed ?? 1;
    this.halfSeconds = data?.halfSeconds ?? 120;
  }

  create(): void {
    this.state = createInitialState(
      {
        seed: this.seed,
        teams: [getTeam(this.homeCountry), getTeam(this.awayCountry)],
        halfSeconds: this.halfSeconds,
      },
      SIZE_PARAMS,
    );
    this.aiState = createAIState((this.seed ^ 0x5bd1e995) >>> 0);
    this.aiOff = new URLSearchParams(window.location.search).get('ai') === '0';
    this.humanMask = this.state.players.map((p) => p.idx === this.humanIdx);
    this.accumulator = 0;
    this.prevPhase = null;
    this.trail = [];
    this.scorers = [];
    this.resultQueued = false;
    this.teamColors = [COUNTRY_INFO[this.homeCountry].color, COUNTRY_INFO[this.awayCountry].color];
    this.localInput = new LocalInput(this);
    this.events.once('shutdown', () => this.localInput.destroy());

    this.drawField();
    this.createPlayerViews();
    this.ballShadowGfx = this.add.graphics();
    this.trailGfx = this.add.graphics();
    this.ballGfx = this.add.graphics();
    this.createHud();

    const cam = this.cameras.main;
    cam.scrollX = cameraTargetX(this.state.ball.x);
    cam.scrollY = 0;

    (window as unknown as { __sg: unknown }).__sg = {
      state: () => this.state,
      humanIdx: this.humanIdx,
      scene: this,
    };
    (window as unknown as { __sgScene: string }).__sgScene = 'MatchScene';

    this.onEvents([]);
    this.drawAll(0);
  }

  update(time: number, delta: number): void {
    this.accumulator += Math.min(delta, MAX_FRAME_MS);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.tickOnce();
      this.accumulator -= STEP_MS;
      steps++;
    }
    // Hit the step cap: drop the backlog instead of falling further behind.
    if (this.accumulator >= STEP_MS) this.accumulator = 0;
    this.drawAll(time);
  }

  private tickOnce(): void {
    const inputs = this.aiOff
      ? this.state.players.map(() => ({ ...EMPTY_INPUT }))
      : computeAIInputs(this.state, this.aiState, this.humanMask);
    inputs[this.humanIdx] = this.localInput.sample();
    step(this.state, inputs);
    this.audio.handleEvents(this.state.events);
    this.updateTrail();
    this.onEvents(this.state.events);
  }

  private updateTrail(): void {
    const ball = this.state.ball;
    if (!ball.special) {
      this.trail = [];
      return;
    }
    this.trail.push({ x: ball.x, y: ball.y, z: ball.z });
    if (this.trail.length > TRAIL_LEN) this.trail.shift();
  }

  private onEvents(events: SimEvent[]): void {
    const { match, players } = this.state;
    if (match.phase !== this.prevPhase) {
      this.prevPhase = match.phase;
      this.onPhase(match.phase);
    }
    for (const e of events) {
      if (e.type === 'goal') {
        this.scorers.push({ team: e.team, name: players[e.scorerIdx].name, minute: this.elapsedMinute() });
        this.showBanner(`進球！ ${players[e.scorerIdx].name}`, 2000);
      } else if (e.type === 'special') {
        this.showSpecial(`${e.name}！`, SPECIAL_COLORS[e.kind]);
      }
    }
  }

  private onPhase(phase: MatchPhase): void {
    const [s0, s1] = this.state.match.score;
    switch (phase) {
      case 'kickoff':
        this.showBanner('開球', 1200);
        break;
      case 'halftime':
        this.showBanner('中場休息', 2000);
        break;
      case 'fulltime':
        this.showBanner(`比賽結束 ${s0} - ${s1}`, Number.POSITIVE_INFINITY);
        this.queueResult();
        break;
      case 'pk':
        this.showBanner('PK 大戰', 2000);
        break;
      default:
        break;
    }
  }

  /** Match time elapsed so far, in whole minutes rounded up (second half counts from the first half's end). */
  private elapsedMinute(): number {
    const { match } = this.state;
    const inHalf = match.halfTicks - match.clockTicks;
    const elapsedTicks = match.half === 1 ? inHalf : match.halfTicks + inHalf;
    return Math.ceil(elapsedTicks / TICK_HZ / 60);
  }

  private queueResult(): void {
    if (this.resultQueued) return;
    this.resultQueued = true;
    this.time.delayedCall(3000, () => {
      const { match } = this.state;
      const pk = (match as MatchState & { pk?: { score: [number, number] } }).pk ?? null;
      const data: ResultInit = {
        home: this.homeCountry,
        away: this.awayCountry,
        score: [match.score[0], match.score[1]],
        pk,
        scorers: this.scorers,
      };
      this.scene.start('ResultScene', data);
    });
  }

  private showBanner(text: string, ms: number): void {
    this.bannerText.setText(text).setVisible(true);
    this.bannerUntil = this.time.now + ms;
  }

  private showSpecial(text: string, color: number): void {
    this.specialText.setText(text).setColor(hexCss(color)).setVisible(true);
    this.specialUntil = this.time.now + 1000;
  }

  // ---------- drawing ----------

  private drawAll(time: number): void {
    const cam = this.cameras.main;
    cam.scrollX += (cameraTargetX(this.state.ball.x) - cam.scrollX) * CAMERA_LERP;
    cam.scrollY = 0;

    this.state.players.forEach((p, i) => this.drawPlayer(this.playerViews[i], p, time));
    this.drawBall();
    this.drawHud();
  }

  private drawField(): void {
    const top = PLAY_AREA_TOP;
    const bottom = FIELD_TOP + FIELD_D * DEPTH_SCALE;
    const py = (y: number) => worldToScreen(0, y, 0).sy;

    const g = this.add.graphics().setDepth(-20);
    g.fillStyle(0x12161d, 1);
    g.fillRect(-200, 0, FIELD_W + 400, 360);

    for (let x = GRASS_X0, i = 0; x < GRASS_X1; x += 100, i++) {
      g.fillStyle(i % 2 === 0 ? 0x2e8b3a : 0x2a8035, 1);
      g.fillRect(x, top, Math.min(100, GRASS_X1 - x), bottom - top);
    }

    g.lineStyle(2, 0xffffff, 0.9);
    g.lineBetween(0, py(0), FIELD_W, py(0));
    g.lineBetween(0, py(FIELD_D), FIELD_W, py(FIELD_D));
    g.lineBetween(0, py(0), 0, py(FIELD_D));
    g.lineBetween(FIELD_W, py(0), FIELD_W, py(FIELD_D));
    g.lineBetween(FIELD_W / 2, py(0), FIELD_W / 2, py(FIELD_D));
    g.strokeEllipse(FIELD_W / 2, py(FIELD_D / 2), 120, 120 * DEPTH_SCALE);

    const areaTop = py(FIELD_D / 2 - 90);
    const areaH = (FIELD_D / 2 + 90 - (FIELD_D / 2 - 90)) * DEPTH_SCALE;
    g.strokeRect(0, areaTop, GK_AREA_DEPTH, areaH);
    g.strokeRect(FIELD_W - GK_AREA_DEPTH, areaTop, GK_AREA_DEPTH, areaH);

    this.drawGoal(0, -GOAL_DEPTH);
    this.drawGoal(FIELD_W, FIELD_W + GOAL_DEPTH);
  }

  /** Goal at xLine with its net reaching back to xBack. Far post sits behind players, near post in front. */
  private drawGoal(xLine: number, xBack: number): void {
    const yFar = FIELD_D / 2 - GOAL_HALF_W;
    const yNear = FIELD_D / 2 + GOAL_HALF_W;
    const top = (y: number) => worldToScreen(0, y, GOAL_H).sy;
    const base = (y: number) => worldToScreen(0, y, 0).sy;

    const netLeft = Math.min(xLine, xBack);
    const netTop = top(yFar);
    const netBottom = base(yNear);
    const netW = GOAL_DEPTH;

    const net = this.add.graphics().setDepth(-5);
    net.fillStyle(0xcfd8e3, 0.18);
    net.fillRect(netLeft, netTop, netW, netBottom - netTop);
    net.lineStyle(1, 0xffffff, 0.35);
    for (let y = netTop; y <= netBottom; y += 4) net.lineBetween(netLeft, y, netLeft + netW, y);
    for (let x = netLeft; x <= netLeft + netW; x += 4) net.lineBetween(x, netTop, x, netBottom);

    const far = this.add.graphics().setDepth(60);
    far.lineStyle(2, 0xffffff, 1);
    far.lineBetween(xLine, base(yFar), xLine, top(yFar));
    far.lineBetween(xLine, top(yFar), xLine, top(yNear));

    const near = this.add.graphics().setDepth(300);
    near.lineStyle(2, 0xffffff, 1);
    near.lineBetween(xLine, base(yNear), xLine, top(yNear));
  }

  private createPlayerViews(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      resolution: 2,
    };
    this.playerViews = this.state.players.map((p) => {
      const gfx = this.add.graphics();
      const label = this.add.text(0, 0, p.name, style).setOrigin(0.5, 1);
      const container = this.add.container(0, 0, [gfx, label]);
      return { container, gfx, label };
    });
  }

  private drawPlayer(view: PlayerView, p: Player, time: number): void {
    const { sx, sy } = worldToScreen(p.x, p.y, 0);
    view.container.setPosition(sx, sy).setDepth(p.y);

    const g = view.gfx;
    g.clear();
    g.setAlpha(p.action === 'hitstun' && Math.floor(time / 50) % 2 === 1 ? 0.35 : 1);

    const r = p.radius;
    const lift = p.z;
    const teamColor = this.teamColors[p.team];
    const bodyColor = p.role === 'GK' ? mix(teamColor, GK_TINT, 0.5) : teamColor;
    const outline = darken(bodyColor, 0.5);
    const facingX = p.facingX >= 0 ? 1 : -1;
    const facingY = p.facingY;

    // Shadow on the ground.
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 0, r * 2.4, r * 1.2);

    // Charge ring.
    if (p.chargeTicks > 0) {
      const ratio = Math.min(1, p.chargeTicks / CHARGE_FULL);
      const pulse = 0.5 + 0.5 * Math.sin(time / 80);
      const R = r * 1.4 + ratio * r * 1.2;
      g.lineStyle(2, ratio >= 1 ? GOLD : 0xffffff, 0.4 + 0.6 * pulse);
      g.strokeEllipse(0, 0, R * 2, R * 2 * DEPTH_SCALE);
    }

    const lying = p.action === 'down' || p.action === 'dive';
    const tackling = p.action === 'tackle';
    const bodyH = tackling ? r * 1.5 : r * 2.4;
    const headR = Math.max(3, r * 0.6);
    let bodyX: number;
    let bodyY: number;
    let bodyW: number;
    let bodyHgt: number;
    let headCx: number;
    let headCy: number;
    if (lying) {
      bodyW = r * 2.4;
      bodyHgt = r * 1.1;
      bodyX = -bodyW / 2;
      bodyY = -lift - bodyHgt;
      headCx = facingX * (bodyW / 2 + headR);
      headCy = -lift - bodyHgt / 2;
    } else {
      bodyW = r * 2;
      bodyHgt = bodyH;
      const lean = tackling ? facingX * r * 0.6 : 0;
      bodyX = -bodyW / 2 + lean;
      bodyY = -lift - bodyH;
      headCx = lean;
      headCy = bodyY - headR * (tackling ? 0.8 : 1);
    }
    const topY = Math.min(bodyY, headCy - headR);

    // Attack and kick limbs (drawn behind the body).
    const shoulderY = -lift - bodyHgt * 0.7;
    if (p.action === 'punch') {
      g.lineStyle(4, outline, 1);
      g.lineBetween(facingX * r * 0.3, shoulderY, facingX * r * 2.2, shoulderY + facingY * r * 1.2);
      g.lineStyle(3, SKIN, 1);
      g.lineBetween(facingX * r * 0.3, shoulderY, facingX * r * 2.2, shoulderY + facingY * r * 1.2);
    } else if (p.action === 'flykick') {
      const hipY = -lift - bodyHgt * 0.35;
      g.lineStyle(5, outline, 1);
      g.lineBetween(0, hipY, facingX * r * 2.6, -lift - r * 0.4);
      g.lineStyle(3, darken(bodyColor, 0.8), 1);
      g.lineBetween(0, hipY, facingX * r * 2.6, -lift - r * 0.4);
    }

    // Body.
    g.fillStyle(bodyColor, 1);
    g.fillRect(bodyX, bodyY, bodyW, bodyHgt);
    g.lineStyle(1, outline, 1);
    g.strokeRect(bodyX, bodyY, bodyW, bodyHgt);

    // Head and facing eye.
    g.fillStyle(SKIN, 1);
    g.fillCircle(headCx, headCy, headR);
    g.lineStyle(1, 0x5a3b1e, 1);
    g.strokeCircle(headCx, headCy, headR);
    g.fillStyle(0x222222, 1);
    g.fillCircle(headCx + facingX * headR * 0.4, headCy - headR * 0.15, Math.max(1, headR * 0.18));

    // Human marker above the name.
    const labelY = topY - 2;
    view.label.setPosition(0, labelY);
    if (p.idx === this.humanIdx) {
      const tipY = labelY - 13;
      g.fillStyle(HUMAN_MARK, 1);
      g.fillTriangle(0, tipY, -3, tipY - 5, 3, tipY - 5);
    }
  }

  private drawBall(): void {
    const ball = this.state.ball;
    const shadow = worldToScreen(ball.x, ball.y, 0);
    const scale = Math.min(1, Math.max(0.35, 1 - ball.z / 140));
    this.ballShadowGfx.clear().setDepth(ball.y);
    this.ballShadowGfx.fillStyle(0x000000, 0.35 * scale);
    this.ballShadowGfx.fillEllipse(shadow.sx, shadow.sy, 9 * scale, 4.5 * scale);

    this.trailGfx.clear().setDepth(ball.y);
    const kind = ball.special?.kind;
    if (kind && this.trail.length > 0) {
      const color = SPECIAL_COLORS[kind];
      this.trail.forEach((pt, i) => {
        const ratio = (i + 1) / this.trail.length;
        const pos = worldToScreen(pt.x, pt.y, pt.z);
        this.trailGfx.fillStyle(color, 0.15 + 0.5 * ratio);
        this.trailGfx.fillCircle(pos.sx, pos.sy, BALL_RADIUS * (0.4 + 0.6 * ratio));
      });
    }

    const pos = worldToScreen(ball.x, ball.y, ball.z);
    this.ballGfx.clear().setDepth(ball.y + 0.5);
    this.ballGfx.fillStyle(0xffffff, 1);
    this.ballGfx.fillCircle(pos.sx, pos.sy, BALL_RADIUS);
    this.ballGfx.lineStyle(1, 0x333333, 1);
    this.ballGfx.strokeCircle(pos.sx, pos.sy, BALL_RADIUS);
  }

  // ---------- HUD ----------

  private createHud(): void {
    const home = COUNTRY_INFO[this.homeCountry];
    const away = COUNTRY_INFO[this.awayCountry];
    const hudDepth = 1000;
    const style = (color: string, size: string, stroke = true): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: size,
      color,
      stroke: stroke ? '#000000' : undefined,
      strokeThickness: stroke ? 3 : 0,
      resolution: 2,
    });

    const topBar = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    topBar.fillStyle(0x000000, 0.55);
    topBar.fillRect(0, 0, 640, 34);

    this.homeText = this.add
      .text(312, 17, '', style(hexCss(home.color), '16px'))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.add
      .text(320, 17, '-', style('#ffffff', '16px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.awayText = this.add
      .text(328, 17, '', style(hexCss(away.color), '16px'))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.clockText = this.add
      .text(630, 17, '', style('#ffffff', '14px'))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);

    const panel = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    panel.fillStyle(0x000000, 0.55);
    panel.fillRect(0, 322, 640, 38);

    this.hudNameText = this.add
      .text(8, 325, '', style('#ffffff', '14px'))
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.hudSpecialText = this.add
      .text(8, 343, '', style('#ffd98a', '12px', false))
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.hudBarsGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth + 1);

    this.bannerText = this.add
      .text(320, 150, '', style('#ffffff', '26px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2)
      .setVisible(false);
    this.specialText = this.add
      .text(320, 200, '', style('#ffffff', '36px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2)
      .setVisible(false);
  }

  private drawHud(): void {
    const { match, players } = this.state;
    const [s0, s1] = match.score;
    const home = COUNTRY_INFO[this.homeCountry];
    const away = COUNTRY_INFO[this.awayCountry];
    this.homeText.setText(`${home.name} ${s0}`);
    this.awayText.setText(`${s1} ${away.name}`);

    const secs = Math.ceil(match.clockTicks / TICK_HZ);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.clockText.setText(`${match.half === 1 ? '上半場' : '下半場'} ${mm}:${ss}`);

    const p = players[this.humanIdx];
    this.hudNameText.setText(p.name);
    this.hudSpecialText.setText(`必殺：${p.specialName}`);

    const barX = 150;
    const barW = 180;
    const staminaRatio = Math.max(0, Math.min(1, p.stamina / p.maxStamina));
    const chargeRatio = Math.min(1, p.chargeTicks / CHARGE_FULL);
    this.hudBarsGfx.clear();
    this.hudBarsGfx.fillStyle(0x333333, 1);
    this.hudBarsGfx.fillRect(barX, 330, barW, 7);
    this.hudBarsGfx.fillRect(barX, 345, barW, 7);
    this.hudBarsGfx.fillStyle(0x6cd46c, 1);
    this.hudBarsGfx.fillRect(barX, 330, barW * staminaRatio, 7);
    this.hudBarsGfx.fillStyle(chargeRatio >= 1 ? GOLD : 0x4fb3ff, 1);
    this.hudBarsGfx.fillRect(barX, 345, barW * chargeRatio, 7);

    const now = this.time.now;
    if (now > this.bannerUntil) this.bannerText.setVisible(false);
    if (now > this.specialUntil) this.specialText.setVisible(false);
  }
}
