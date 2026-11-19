import Phaser from 'phaser';
import { computeAIInputs, createAIState, type AIState } from '../ai';
import { AudioPlayer } from '../audio';
import { COUNTRY_INFO, getTeam, SIZE_PARAMS, type Country, type SpecialKind } from '../data';
import { LocalInput, TouchControls } from '../input';
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
  autoPkOrders,
  createInitialState,
  pkMeterValue,
  step,
  submitPkOrder,
  type GameState,
  type InputFrame,
  type MatchPhase,
  type PkState,
  type Player,
  type SimEvent,
} from '../sim';
import { DEPTH_SCALE, cameraTargetX, pkCameraX, worldToScreen, FIELD_TOP } from './projection';
import type { ResultInit, ResultScorer } from './ResultScene';
import { createSpriteAnims, preloadSprites, SPRITE_CONFIGS, spriteAnimKey, type SpriteAnim, type SpriteConfig } from './sprites';
import { applyView, BASE_H, textResolution, type View } from './view';

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
  /** Set when the character's sheet loaded. The block figure is drawn when this is null. */
  sprite: Phaser.GameObjects.Sprite | null;
  spriteCfg: SpriteConfig | null;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

interface PkOrderRow {
  slot: Phaser.GameObjects.Text;
  role: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  stats: Phaser.GameObjects.Text;
}

type HudStyle = (color: string, size: string, stroke?: boolean) => Phaser.Types.GameObjects.Text.TextStyle;

const STEP_MS = 1000 / TICK_HZ;
const MAX_STEPS_PER_FRAME = 4;
const MAX_FRAME_MS = 100;
const CAMERA_LERP = 0.15;
const TRAIL_LEN = 8;
const PLAY_AREA_TOP = FIELD_TOP;
const GRASS_X0 = -60;
const GRASS_X1 = FIELD_W + 60;

/** Regulation kicks per team in the shootout (sim/pk.ts uses the same count). */
const PK_ROUNDS = 5;
const PK_RESULT_BANNER_MS = 1200;
const PK_PANEL_X = 0;
const PK_PANEL_Y = 36;
const PK_PANEL_W = 196;
const PK_PANEL_H = 58;
const PK_MARK_X0 = 92;
const PK_MARK_STEP = 18;
/** Aim box and power meter are anchored to the right / bottom edges of the view. */
const PK_AIM_RIGHT = 88;
const PK_AIM_Y = 44;
const PK_CELL_W = 24;
const PK_CELL_H = 22;
const PK_CELL_GAP = 2;
const PK_METER_RIGHT = 172;
const PK_METER_BOTTOM = 28;
const PK_METER_W = 160;
const PK_METER_H = 10;
const ORDER_BOX_Y = 40;
const ORDER_BOX_W = 380;
const ORDER_BOX_H = 276;
const ORDER_ROW_Y0 = 98;
const ORDER_ROW_H = 36;
/** Order overlay x offsets are measured from the box's left edge (the box is centred on the view). */
const ORDER_ROW_X = 16;
const ORDER_ROW_W = 348;
const ORDER_ROW_BOX_H = 30;
const ORDER_UNDO_X = 250;
const ORDER_UNDO_Y = 280;
const ORDER_UNDO_W = 120;
const ORDER_UNDO_H = 26;
/** Minimap in the top-left band under the top bar: world units scaled to pixels. */
const MINIMAP_X = 8;
const MINIMAP_Y = 40;
const MINIMAP_SCALE = 0.15;
/** Off-screen arrow: shown when the human is closer than ARROW_MARGIN to a view edge. The arrow is clamped to
 * the band between the top bar / minimap and the bottom HUD (or the touch buttons). */
const ARROW_MARGIN = 10;
const ARROW_SIZE = 12;
const ARROW_EDGE_X = 16;
const ARROW_EDGE_TOP = 104;
const ARROW_EDGE_BOTTOM = 62;
const ARROW_EDGE_BOTTOM_TOUCH = 142;
/** Horizontal speed (sim units per second) above which the sprite runs. */
const RUN_SPEED = 20;
/** How long the special-shot pose overrides the action animation. */
const SPECIAL_POSE_MS = 900;
/** The bike is wider than the block body, so the shadow is widened to match. */
const SPRITE_SHADOW_SCALE = 1.6;
const PLAYER_COUNT = 10;

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

/** Left edge of the centred PK order box for a view of width W. */
function orderLeft(W: number): number {
  return (W - ORDER_BOX_W) / 2;
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

/**
 * Match setup from the URL (test entry, `?quick=1&home=shu&away=wei&human=1`). Only valid values are used:
 * both countries must be known and different, and humanIdx must be a player index.
 */
function matchFromUrl(search: string): MatchInit {
  const q = new URLSearchParams(search);
  const country = (v: string | null): Country | null =>
    (Object.keys(COUNTRY_INFO) as Country[]).find((c) => c === v) ?? null;
  const home = country(q.get('home'));
  const away = country(q.get('away'));
  const human = Number(q.get('human'));
  const out: MatchInit = {};
  if (home && away && home !== away) {
    out.home = home;
    out.away = away;
  }
  if (q.has('human') && Number.isInteger(human) && human >= 0 && human < PLAYER_COUNT) out.humanIdx = human;
  return out;
}

export class MatchScene extends Phaser.Scene {
  private homeCountry: Country = 'shu';
  private awayCountry: Country = 'wei';
  private humanIdx = 4;
  private seed = 1;
  private halfSeconds = 120;

  private state!: GameState;
  private localInput!: LocalInput;
  private touch!: TouchControls;
  private aiState!: AIState;
  private humanMask: boolean[] = [];
  /** Test-only (`?ai=0`): non-human players stand still instead of running AI (the shootout still runs AI). */
  private aiOff = false;
  /** The human's InputFrame from the latest sim tick. */
  private humanInput: InputFrame = { ...EMPTY_INPUT };
  private audio = new AudioPlayer();
  private accumulator = 0;
  private teamColors: [number, number] = [0, 0];
  private playerViews: PlayerView[] = [];
  private ballGfx!: Phaser.GameObjects.Graphics;
  private ballShadowGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private trail: TrailPoint[] = [];
  /** Per player idx: time (ms) until which the special-shot pose is shown. */
  private specialAnimUntil: number[] = [];

  private homeText!: Phaser.GameObjects.Text;
  private awayText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private topBarGfx!: Phaser.GameObjects.Graphics;
  private bottomBarGfx!: Phaser.GameObjects.Graphics;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private minimapFrames = 0;
  private arrowGfx!: Phaser.GameObjects.Graphics;
  private arrowText!: Phaser.GameObjects.Text;
  private arrowShown = false;
  private view!: View;
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

  private pkObjs: Phaser.GameObjects.Components.Visible[] = [];
  private pkHudGfx!: Phaser.GameObjects.Graphics;
  private pkAimGfx!: Phaser.GameObjects.Graphics;
  private pkScoreText!: Phaser.GameObjects.Text;
  private pkHomeText!: Phaser.GameObjects.Text;
  private pkAwayText!: Phaser.GameObjects.Text;
  private pkMeterLabel!: Phaser.GameObjects.Text;
  private pkOrderKeys!: Record<'W' | 'S' | 'J' | 'K', Phaser.Input.Keyboard.Key>;
  private pkOrderObjs: Phaser.GameObjects.Components.Visible[] = [];
  private pkOrderGfx!: Phaser.GameObjects.Graphics;
  private pkOrderRows: PkOrderRow[] = [];
  private pkOrderCount!: Phaser.GameObjects.Text;
  private pkOrderTitle!: Phaser.GameObjects.Text;
  private pkOrderHint!: Phaser.GameObjects.Text;
  private pkOrderUndo!: Phaser.GameObjects.Text;
  private pkOrderOpen = false;
  private pkOrderCursor = 0;
  private pkOrderPicks: number[] = [];
  /** Pending pointer tap on the order overlay: a row index, or 'undo' for the 重選 button. */
  private pkOrderTap: number | 'undo' | null = null;

  constructor() {
    super('MatchScene');
  }

  init(data?: MatchInit): void {
    // Explicit data wins. The test URL params fill in when the scene is auto-started (?quick) without them.
    const url = matchFromUrl(window.location.search);
    this.homeCountry = data?.home ?? url.home ?? 'shu';
    this.awayCountry = data?.away ?? url.away ?? 'wei';
    this.humanIdx = data?.humanIdx ?? url.humanIdx ?? 4;
    this.seed = data?.seed ?? 1;
    this.halfSeconds = data?.halfSeconds ?? 120;
  }

  preload(): void {
    preloadSprites(this.load);
  }

  create(): void {
    this.view = applyView(this, (v) => this.layoutHud(v));
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
    this.specialAnimUntil = [];
    this.scorers = [];
    this.resultQueued = false;
    this.teamColors = [COUNTRY_INFO[this.homeCountry].color, COUNTRY_INFO[this.awayCountry].color];
    this.touch = new TouchControls(this, this.view);
    this.localInput = new LocalInput(this, this.touch);
    this.events.once('shutdown', () => {
      this.localInput.destroy();
      this.touch.destroy();
    });

    this.drawField();
    createSpriteAnims(this.anims, this.textures);
    this.createPlayerViews();
    this.ballShadowGfx = this.add.graphics();
    this.trailGfx = this.add.graphics();
    this.ballGfx = this.add.graphics();
    this.createHud();
    this.layoutHud(this.view);

    const cam = this.cameras.main;
    cam.scrollX = cameraTargetX(this.state.ball.x, this.view.W);
    cam.scrollY = (BASE_H - this.view.H) / 2;

    (window as unknown as { __sg: unknown }).__sg = {
      state: () => this.state,
      humanIdx: this.humanIdx,
      scene: this,
      minimap: () => this.minimapFrames,
      arrowVisible: () => this.arrowShown,
    };
    (window as unknown as { __sgScene: string }).__sgScene = 'MatchScene';

    this.onEvents([]);
    this.drawAll(0);
  }

  update(time: number, delta: number): void {
    this.updatePkOrder();
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
    const inShootout = this.state.match.phase === 'pk';
    const inputs = this.aiOff && !inShootout
      ? this.state.players.map(() => ({ ...EMPTY_INPUT }))
      : computeAIInputs(this.state, this.aiState, this.humanMask);
    inputs[this.humanIdx] = this.localInput.sample();
    this.humanInput = inputs[this.humanIdx];
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
        this.playSpecialPose(e.playerIdx);
      } else if (e.type === 'pkResult') {
        const text = e.outcome === 'goal' ? '進球！' : e.outcome === 'save' ? '撲救！' : '射偏！';
        this.showBanner(text, PK_RESULT_BANNER_MS);
      } else if (e.type === 'pkEnd') {
        const winner = COUNTRY_INFO[e.winner === 0 ? this.homeCountry : this.awayCountry].name;
        this.showBanner(`${winner} 勝利！`, Number.POSITIVE_INFINITY);
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
        autoPkOrders(this.state, 0);
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
      const data: ResultInit = {
        home: this.homeCountry,
        away: this.awayCountry,
        score: [match.score[0], match.score[1]],
        pk: match.pk ? [match.pk.score[0], match.pk.score[1]] : null,
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
    const { W, H } = this.view;
    if (this.state.match.phase === 'pk') {
      cam.scrollX = pkCameraX(W);
    } else {
      cam.scrollX += (cameraTargetX(this.state.ball.x, W) - cam.scrollX) * CAMERA_LERP;
    }
    // Centre the field band vertically when the window is taller than the 360 base height.
    cam.scrollY = (BASE_H - H) / 2;

    this.state.players.forEach((p, i) => this.drawPlayer(this.playerViews[i], p, time));
    this.drawBall();
    this.drawHud();
    this.drawMinimap();
    this.drawArrow();
  }

  /** Field overview in the top-left: players, ball, goals and the camera's x range. Hidden during the shootout. */
  private drawMinimap(): void {
    const visible = this.state.match.pk === null;
    this.minimapGfx.setVisible(visible);
    if (!visible) return;
    this.minimapFrames++;

    const g = this.minimapGfx.clear();
    const s = MINIMAP_SCALE;
    const mx = (x: number) => MINIMAP_X + x * s;
    const my = (y: number) => MINIMAP_Y + y * s;
    const w = FIELD_W * s;
    const h = FIELD_D * s;
    const { players, ball } = this.state;

    g.fillStyle(0x0b3d1e, 0.6);
    g.fillRect(MINIMAP_X, MINIMAP_Y, w, h);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(MINIMAP_X, MINIMAP_Y, w, h);
    g.lineBetween(mx(FIELD_W / 2), my(0), mx(FIELD_W / 2), my(FIELD_D));

    // Goals: a white bar across each goal mouth.
    g.lineStyle(2, 0xffffff, 1);
    for (const x of [0, FIELD_W]) {
      g.lineBetween(mx(x), my(FIELD_D / 2 - GOAL_HALF_W), mx(x), my(FIELD_D / 2 + GOAL_HALF_W));
    }

    for (const p of players) {
      const base = this.teamColors[p.team];
      const color = p.role === 'GK' ? mix(base, 0xffffff, 0.35) : base;
      g.fillStyle(color, p.action === 'down' ? 0.35 : 1);
      g.fillCircle(mx(p.x), my(p.y), 1.5);
    }
    const human = players[this.humanIdx];
    g.lineStyle(1, HUMAN_MARK, 1);
    g.strokeCircle(mx(human.x), my(human.y), 3.5);

    const kind = ball.special?.kind;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(mx(ball.x), my(ball.y), kind ? 3 : 2);
    if (kind) {
      g.lineStyle(1, SPECIAL_COLORS[kind], 1);
      g.strokeCircle(mx(ball.x), my(ball.y), 3);
    }

    const cam = this.cameras.main;
    const x0 = Math.max(MINIMAP_X, mx(cam.scrollX));
    const x1 = Math.min(MINIMAP_X + w, mx(cam.scrollX + this.view.W));
    if (x1 > x0) {
      g.lineStyle(1, 0xffffff, 1);
      g.strokeRect(x0, MINIMAP_Y, x1 - x0, h);
    }
  }

  /**
   * Yellow arrow at the screen edge pointing at the human when the human is outside the camera view.
   * Play phase only (not during the shootout or the order overlay).
   */
  private drawArrow(): void {
    const g = this.arrowGfx.clear();
    const { W, H } = this.view;
    const cam = this.cameras.main;
    const human = this.state.players[this.humanIdx];
    const { sx, sy } = worldToScreen(human.x, human.y, human.z);
    const px = sx - cam.scrollX;
    const py = sy - cam.scrollY;
    const outside = px < ARROW_MARGIN || px > W - ARROW_MARGIN || py < ARROW_MARGIN || py > H - ARROW_MARGIN;
    const show = this.state.match.phase === 'play' && this.state.match.pk === null && outside;
    this.arrowShown = show;
    this.arrowText.setVisible(show);
    if (!show) return;

    // Ray from the view centre to the human, clamped to the band that keeps the arrow off the HUD.
    const cx = W / 2;
    const cy = H / 2;
    const minX = ARROW_EDGE_X;
    const maxX = W - ARROW_EDGE_X;
    const minY = ARROW_EDGE_TOP;
    const maxY = H - (this.touch.isShown() ? ARROW_EDGE_BOTTOM_TOUCH : ARROW_EDGE_BOTTOM);
    const dx = px - cx;
    const dy = py - cy;
    let t = Number.POSITIVE_INFINITY;
    if (dx > 0) t = Math.min(t, (maxX - cx) / dx);
    else if (dx < 0) t = Math.min(t, (minX - cx) / dx);
    if (dy > 0) t = Math.min(t, (maxY - cy) / dy);
    else if (dy < 0) t = Math.min(t, (minY - cy) / dy);
    const ex = cx + dx * t;
    const ey = cy + dy * t;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const tipX = ex + ux * ARROW_SIZE;
    const tipY = ey + uy * ARROW_SIZE;
    const baseX = ex - ux * ARROW_SIZE * 0.5;
    const baseY = ey - uy * ARROW_SIZE * 0.5;
    const half = ARROW_SIZE * 0.6;
    const ax = [tipX, baseX + nx * half, baseX - nx * half];
    const ay = [tipY, baseY + ny * half, baseY - ny * half];
    g.fillStyle(HUMAN_MARK, 1);
    g.fillTriangle(ax[0], ay[0], ax[1], ay[1], ax[2], ay[2]);
    g.lineStyle(1, 0x000000, 0.8);
    g.strokeTriangle(ax[0], ay[0], ax[1], ay[1], ax[2], ay[2]);
    this.arrowText.setPosition(ex - ux * 18, ey - uy * 18);
  }

  private drawField(): void {
    const top = PLAY_AREA_TOP;
    const bottom = FIELD_TOP + FIELD_D * DEPTH_SCALE;
    const py = (y: number) => worldToScreen(0, y, 0).sy;

    const g = this.add.graphics().setDepth(-20);
    g.fillStyle(0x12161d, 1);
    g.fillRect(-400, -1000, FIELD_W + 800, 3000);

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
      resolution: textResolution(),
    };
    this.playerViews = this.state.players.map((p) => {
      const gfx = this.add.graphics();
      const spriteCfg = this.spriteConfigFor(p.charId);
      const sprite = spriteCfg ? this.add.sprite(0, 0, spriteCfg.key) : null;
      const label = this.add.text(0, 0, p.name, style).setOrigin(0.5, 1);
      const container = this.add.container(0, 0, sprite ? [gfx, sprite, label] : [gfx, label]);
      return { container, gfx, label, sprite, spriteCfg };
    });
  }

  /** Sprite config for a character whose sheet loaded. Null means the block figure is drawn. */
  private spriteConfigFor(charId: string): SpriteConfig | null {
    const cfg = SPRITE_CONFIGS[charId];
    return cfg && this.textures.exists(cfg.key) ? cfg : null;
  }

  /**
   * Which sprite animation a player shows: a special shot in progress first, then the sim action, then charging,
   * then speed (run above RUN_SPEED, otherwise idle).
   */
  private spriteAnimFor(p: Player): SpriteAnim {
    if (this.specialAnimUntil[p.idx] > this.time.now) return 'special';
    switch (p.action) {
      case 'punch':
      case 'tackle':
        return 'attack';
      case 'jump':
      case 'flykick':
        return 'jump';
      case 'hitstun':
      case 'down':
      case 'dive':
      case 'recover':
        return p.action;
      case 'charge':
        return 'charge';
      default:
        break;
    }
    if (p.chargeTicks > 0) return 'charge';
    return Math.abs(p.vx) > RUN_SPEED ? 'run' : 'idle';
  }

  /** Plays the special-shot pose on this player's sprite and holds it for SPECIAL_POSE_MS. */
  private playSpecialPose(idx: number): void {
    this.specialAnimUntil[idx] = this.time.now + SPECIAL_POSE_MS;
    const view = this.playerViews[idx];
    if (view?.sprite && view.spriteCfg) view.sprite.play(spriteAnimKey(view.spriteCfg, 'special'));
  }

  /**
   * Draws the sprite for a player: the animation comes from the sim state, the frame is anchored at the ground
   * point between the wheels and flipped by facing. Returns the top of the frame in container space (for the label).
   */
  private drawSpritePlayer(sprite: Phaser.GameObjects.Sprite, cfg: SpriteConfig, p: Player, time: number, hitFlicker: boolean): number {
    const anim = this.spriteAnimFor(p);
    const key = spriteAnimKey(cfg, anim);
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key);

    const { meta } = cfg;
    const scale = cfg.displayHeight / meta.frameHeight;
    const flip = p.facingX < 0;
    const ax = meta.anchorX / meta.frameWidth;
    const ay = meta.anchorY / meta.frameHeight;
    const pulse = 0.5 + 0.5 * Math.sin(time / 80);
    const alpha = hitFlicker ? 0.35 : anim === 'charge' ? 0.7 + 0.3 * pulse : 1;
    // Flipping mirrors the frame around its box, so the anchor's x is mirrored too.
    sprite
      .setOrigin(flip ? 1 - ax : ax, ay)
      .setFlipX(flip)
      .setScale(scale)
      .setPosition(0, -p.z)
      .setAlpha(alpha);
    return -p.z - meta.anchorY * scale;
  }

  private drawPlayer(view: PlayerView, p: Player, time: number): void {
    const { sx, sy } = worldToScreen(p.x, p.y, 0);
    view.container.setPosition(sx, sy).setDepth(p.y);

    const g = view.gfx;
    g.clear();
    const hitFlicker = p.action === 'hitstun' && Math.floor(time / 50) % 2 === 1;
    g.setAlpha(hitFlicker ? 0.35 : 1);

    const r = p.radius;
    const lift = p.z;
    const teamColor = this.teamColors[p.team];
    const bodyColor = p.role === 'GK' ? mix(teamColor, GK_TINT, 0.5) : teamColor;
    const outline = darken(bodyColor, 0.5);
    const facingX = p.facingX >= 0 ? 1 : -1;
    const facingY = p.facingY;

    // Shadow on the ground (wider under the bike).
    const spriteOn = view.sprite !== null && view.spriteCfg !== null;
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 0, r * 2.4 * (spriteOn ? SPRITE_SHADOW_SCALE : 1), r * 1.2);

    // Charge ring.
    if (p.chargeTicks > 0) {
      const ratio = Math.min(1, p.chargeTicks / CHARGE_FULL);
      const pulse = 0.5 + 0.5 * Math.sin(time / 80);
      const R = r * 1.4 + ratio * r * 1.2;
      g.lineStyle(2, ratio >= 1 ? GOLD : 0xffffff, 0.4 + 0.6 * pulse);
      g.strokeEllipse(0, 0, R * 2, R * 2 * DEPTH_SCALE);
    }

    let topY: number;
    if (view.sprite && view.spriteCfg) {
      topY = this.drawSpritePlayer(view.sprite, view.spriteCfg, p, time, hitFlicker);
    } else {
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
      topY = Math.min(bodyY, headCy - headR);

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
    }

    // Name label above the top of the figure; human marker above the name.
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
      resolution: textResolution(),
    });

    // Positions are set by layoutHud (objects start at the origin).
    this.topBarGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    this.homeText = this.add
      .text(0, 0, '', style(hexCss(home.color), '16px'))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.dashText = this.add
      .text(0, 0, '-', style('#ffffff', '16px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.awayText = this.add
      .text(0, 0, '', style(hexCss(away.color), '16px'))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.clockText = this.add
      .text(0, 0, '', style('#ffffff', '14px'))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);

    this.bottomBarGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    this.hudNameText = this.add
      .text(0, 0, '', style('#ffffff', '14px'))
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.hudSpecialText = this.add
      .text(0, 0, '', style('#ffd98a', '12px', false))
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.hudBarsGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth + 1);

    this.bannerText = this.add
      .text(0, 0, '', style('#ffffff', '26px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2)
      .setVisible(false);
    this.specialText = this.add
      .text(0, 0, '', style('#ffffff', '36px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2)
      .setVisible(false);

    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth);
    this.arrowGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth + 1);
    this.arrowText = this.add
      .text(0, 0, this.state.players[this.humanIdx].name, style(hexCss(HUMAN_MARK), '11px'))
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2)
      .setVisible(false);

    this.createPkHud(style, hudDepth);
    this.createPkOrder(style, hudDepth);
  }

  /** Positions the HUD for a logical view. Runs on create and on every resize. */
  private layoutHud(v: View): void {
    this.view = v;
    const { W, H } = v;
    this.touch.setView(v);
    this.refreshTextResolution();

    this.topBarGfx.clear().fillStyle(0x000000, 0.55).fillRect(0, 0, W, 34);
    this.homeText.setPosition(W / 2 - 8, 17);
    this.dashText.setPosition(W / 2, 17);
    this.awayText.setPosition(W / 2 + 8, 17);
    this.clockText.setPosition(W - 10, 17);

    this.bottomBarGfx.clear().fillStyle(0x000000, 0.55).fillRect(0, H - 38, W, 38);
    this.hudNameText.setPosition(8, H - 35);
    this.hudSpecialText.setPosition(8, H - 17);
    this.bannerText.setPosition(W / 2, H / 2 - 30);
    this.specialText.setPosition(W / 2, H / 2 + 20);
    this.pkMeterLabel.setPosition(W - PK_METER_RIGHT - 6, H - PK_METER_BOTTOM + PK_METER_H / 2);

    const left = orderLeft(W);
    this.pkOrderTitle.setPosition(W / 2, 52);
    this.pkOrderHint.setPosition(W / 2, 74);
    this.pkOrderCount.setPosition(W / 2, 292);
    this.pkOrderUndo.setPosition(left + ORDER_UNDO_X + ORDER_UNDO_W / 2, ORDER_UNDO_Y + ORDER_UNDO_H / 2);
    this.pkOrderRows.forEach((row, i) => {
      const y = ORDER_ROW_Y0 + i * ORDER_ROW_H;
      row.slot.setPosition(left + ORDER_ROW_X + 20, y);
      row.role.setPosition(left + ORDER_ROW_X + 54, y);
      row.name.setPosition(left + ORDER_ROW_X + 80, y);
      row.stats.setPosition(left + ORDER_ROW_X + 332, y);
    });
    if (this.pkOrderOpen) this.refreshPkOrder();
  }

  /** Re-applies the current text resolution to every text object (HUD, touch labels, player names). */
  private refreshTextResolution(): void {
    const res = textResolution();
    this.children.list.forEach((o) => {
      if (o instanceof Phaser.GameObjects.Text) o.setResolution(res);
    });
    this.playerViews.forEach((v) => v.label.setResolution(res));
  }

  private createPkHud(style: HudStyle, depth: number): void {
    const add = (x: number, y: number, color: string, size: string, text = '') =>
      this.add
        .text(x, y, text, style(color, size))
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);
    this.pkHudGfx = this.add.graphics().setScrollFactor(0).setDepth(depth);
    this.pkAimGfx = this.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    this.pkScoreText = add(8, 46, '#ffffff', '13px');
    const home = COUNTRY_INFO[this.homeCountry];
    const away = COUNTRY_INFO[this.awayCountry];
    this.pkHomeText = add(8, 64, hexCss(home.color), '13px', home.name);
    this.pkAwayText = add(8, 85, hexCss(away.color), '13px', away.name);
    this.pkMeterLabel = add(0, 0, '#ffffff', '12px', '力量')
      .setOrigin(1, 0.5);
    this.pkObjs = [
      this.pkHudGfx,
      this.pkAimGfx,
      this.pkScoreText,
      this.pkHomeText,
      this.pkAwayText,
      this.pkMeterLabel,
    ];
  }

  /** Kicking-order overlay for the human team (shown during stage 'order' while the order is still open). */
  private createPkOrder(style: HudStyle, depth: number): void {
    this.pkOrderOpen = false;
    this.pkOrderCursor = 0;
    this.pkOrderPicks = [];
    this.pkOrderKeys = this.input.keyboard!.addKeys('W,S,J,K') as Record<
      'W' | 'S' | 'J' | 'K',
      Phaser.Input.Keyboard.Key
    >;

    const add = (
      x: number,
      y: number,
      text: string,
      color: string,
      size: string,
      originX: number,
      stroke = true,
    ) =>
      this.add
        .text(x, y, text, style(color, size, stroke))
        .setOrigin(originX, 0.5)
        .setScrollFactor(0)
        .setDepth(depth + 1);

    this.pkOrderGfx = this.add.graphics().setScrollFactor(0).setDepth(depth);
    // Positions are set by layoutHud.
    this.pkOrderTitle = add(0, 0, '選擇踢球順序', '#ffd98a', '18px', 0.5);
    this.pkOrderHint = add(0, 0, 'W/S 移動　J 加入（依序踢）　K 取消最後一位', '#ffffff', '12px', 0.5, false);
    this.pkOrderCount = add(0, 0, '', '#ffffff', '12px', 0.5);
    this.pkOrderUndo = add(0, 0, '重選', '#ffffff', '14px', 0.5);
    this.pkOrderRows = Array.from({ length: PK_ROUNDS }, () => ({
      slot: add(0, 0, '', '#ffd98a', '16px', 0.5),
      role: add(0, 0, '', '#9fd3ff', '12px', 0.5),
      name: add(0, 0, '', '#ffffff', '16px', 0),
      stats: add(0, 0, '', '#cfd8e3', '12px', 1, false),
    }));
    this.pkOrderObjs = [
      this.pkOrderGfx,
      this.pkOrderTitle,
      this.pkOrderHint,
      this.pkOrderCount,
      this.pkOrderUndo,
      ...this.pkOrderRows.flatMap((r) => [r.slot, r.role, r.name, r.stats]),
    ];
    this.input.on('pointerdown', this.onPkOrderPointer);
    this.setPkOrderVisible(false);
  }

  /** Pointer tap on the order overlay: a row picks that player (same as J), 重選 undoes the last pick (same as K). */
  private onPkOrderPointer = (pointer: Phaser.Input.Pointer): void => {
    if (!this.pkOrderOpen) return;
    // Canvas pixels to logical view units.
    const x = pointer.x / this.view.Z;
    const y = pointer.y / this.view.Z;
    const left = orderLeft(this.view.W);
    const undoX = left + ORDER_UNDO_X;
    if (x >= undoX && x < undoX + ORDER_UNDO_W && y >= ORDER_UNDO_Y && y < ORDER_UNDO_Y + ORDER_UNDO_H) {
      this.pkOrderTap = 'undo';
      return;
    }
    const rowX = left + ORDER_ROW_X;
    for (let i = 0; i < this.pkOrderRows.length; i++) {
      const top = ORDER_ROW_Y0 + i * ORDER_ROW_H - ORDER_ROW_BOX_H / 2;
      if (x >= rowX && x < rowX + ORDER_ROW_W && y >= top && y < top + ORDER_ROW_BOX_H) {
        this.pkOrderTap = i;
        return;
      }
    }
  };

  private drawHud(): void {
    const { match } = this.state;
    const [s0, s1] = match.score;
    const home = COUNTRY_INFO[this.homeCountry];
    const away = COUNTRY_INFO[this.awayCountry];
    this.homeText.setText(`${home.name} ${s0}`);
    this.awayText.setText(`${s1} ${away.name}`);

    const pk = match.pk;
    // The order overlay covers the PK panel, so the panel waits until the order is set.
    this.pkObjs.forEach((o) => o.setVisible(pk !== null && pk.stage !== 'order'));
    if (pk !== null) {
      this.drawPkHud(pk);
    } else {
      this.drawMatchHud();
    }

    const now = this.time.now;
    if (now > this.bannerUntil) this.bannerText.setVisible(false);
    if (now > this.specialUntil) this.specialText.setVisible(false);
  }

  private drawMatchHud(): void {
    const { match, players } = this.state;
    const { H } = this.view;
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
    this.hudBarsGfx.fillRect(barX, H - 30, barW, 7);
    this.hudBarsGfx.fillRect(barX, H - 15, barW, 7);
    this.hudBarsGfx.fillStyle(0x6cd46c, 1);
    this.hudBarsGfx.fillRect(barX, H - 30, barW * staminaRatio, 7);
    this.hudBarsGfx.fillStyle(chargeRatio >= 1 ? GOLD : 0x4fb3ff, 1);
    this.hudBarsGfx.fillRect(barX, H - 15, barW * chargeRatio, 7);
  }

  /** Shootout HUD: title, PK score, per-team kick markers, shooter/keeper line, aim helpers and power meter. */
  private drawPkHud(pk: PkState): void {
    const { players } = this.state;
    const { W, H } = this.view;
    const sudden = pk.kicks[0].length >= PK_ROUNDS && pk.kicks[1].length >= PK_ROUNDS;
    this.clockText.setText(sudden ? 'PK 大戰　驟死' : 'PK 大戰');
    this.pkScoreText.setText(`PK ${pk.score[0]} - ${pk.score[1]}`);
    this.hudBarsGfx.clear();

    const g = this.pkHudGfx.clear();
    g.fillStyle(0x000000, 0.55);
    g.fillRect(PK_PANEL_X, PK_PANEL_Y, PK_PANEL_W, PK_PANEL_H);
    this.drawPkMarks(g, pk, 0, 64);
    this.drawPkMarks(g, pk, 1, 85);

    const live = pk.stage === 'aim' || pk.stage === 'flight' || pk.stage === 'result';
    const shooter = live ? players[pk.shooterIdx] : undefined;
    const keeper = live ? players[pk.keeperIdx] : undefined;
    this.hudNameText.setText(shooter && keeper ? `射門：${shooter.name}　守門：${keeper.name}` : '');

    const humanShoots = live && pk.shooterIdx === this.humanIdx;
    const humanKeeps = live && pk.keeperIdx === this.humanIdx;
    let hint = '';
    const touchUi = this.touch.isShown();
    if (pk.stage === 'aim' && humanShoots) {
      hint = touchUi
        ? '搖桿上下選方向，按住 K 高球，按住 J 蓄力放開射門'
        : 'W/S 選方向（不按＝中間），按住 K 射高球；按住 J 蓄力，放開射門';
    } else if (pk.stage === 'aim' && humanKeeps) {
      hint = touchUi ? '搖桿上下猜方向，按住 K 撲高球' : 'W/S 猜方向，按住 K 撲高球';
    } else if (pk.stage === 'aim') {
      hint = '觀看中…';
    }
    this.hudSpecialText.setText(hint);

    const aiming = pk.stage === 'aim' && (humanShoots || humanKeeps);
    const aim = this.pkAimGfx.clear();
    if (aiming) {
      // 3 columns (left = W / far post, right = S / near post) x 2 rows (top = K high, bottom = low).
      const selCol = this.humanInput.moveY + 1;
      const selHigh = this.humanInput.k;
      const highlight = humanShoots ? HUMAN_MARK : 0x4fb3ff;
      const boxW = 3 * PK_CELL_W + 2 * PK_CELL_GAP;
      const boxH = 2 * PK_CELL_H + PK_CELL_GAP;
      aim.fillStyle(0x000000, 0.55);
      aim.fillRect((W - PK_AIM_RIGHT) - 6, PK_AIM_Y - 6, boxW + 12, boxH + 12);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const on = col === selCol && (row === 0) === selHigh;
          aim.fillStyle(on ? highlight : 0x2b333d, 1);
          aim.fillRect(
            (W - PK_AIM_RIGHT) + col * (PK_CELL_W + PK_CELL_GAP),
            PK_AIM_Y + row * (PK_CELL_H + PK_CELL_GAP),
            PK_CELL_W,
            PK_CELL_H,
          );
        }
      }
    }

    const showMeter = aiming && humanShoots;
    this.pkMeterLabel.setVisible(showMeter);
    if (showMeter) {
      const value = pk.meterTicks >= 0 ? pkMeterValue(pk.meterTicks) : 0;
      aim.fillStyle(0x333333, 1);
      aim.fillRect((W - PK_METER_RIGHT), (H - PK_METER_BOTTOM), PK_METER_W, PK_METER_H);
      aim.fillStyle(0xffffff, 1);
      aim.fillRect((W - PK_METER_RIGHT), (H - PK_METER_BOTTOM), PK_METER_W * value, PK_METER_H);
      // Zones are drawn over the fill so they stay visible while the bar passes them.
      aim.fillStyle(0x6cd46c, 0.55);
      aim.fillRect((W - PK_METER_RIGHT) + PK_METER_W * 0.6, (H - PK_METER_BOTTOM), PK_METER_W * 0.3, PK_METER_H);
      aim.fillStyle(0xff3b3b, 0.75);
      aim.fillRect((W - PK_METER_RIGHT) + PK_METER_W * 0.92, (H - PK_METER_BOTTOM), PK_METER_W * 0.08, PK_METER_H);
    }
  }

  /** One team's row of 5 kick markers (pending ○, goal ●, miss ✕). Sudden death shows the last 5 kicks. */
  private drawPkMarks(g: Phaser.GameObjects.Graphics, pk: PkState, team: 0 | 1, y: number): void {
    const kicks = pk.kicks[team];
    const shown = kicks.length > PK_ROUNDS ? kicks.slice(-PK_ROUNDS) : kicks;
    for (let i = 0; i < PK_ROUNDS; i++) {
      const x = PK_MARK_X0 + i * PK_MARK_STEP;
      const kick = shown[i];
      if (kick === undefined) {
        g.lineStyle(2, 0x9aa3ad, 1);
        g.strokeCircle(x, y, 5);
      } else if (kick === 'goal') {
        g.fillStyle(0x3ddc6a, 1);
        g.fillCircle(x, y, 5);
      } else {
        g.lineStyle(2, 0xff4d4d, 1);
        g.lineBetween(x - 4, y - 4, x + 4, y + 4);
        g.lineBetween(x + 4, y - 4, x - 4, y + 4);
      }
    }
  }

  /** Human picks team 0's kicking order: W/S move, J appends the highlighted player, K removes the last pick. */
  private updatePkOrder(): void {
    const { W, S, J, K } = this.pkOrderKeys;
    // Consume every key each frame so presses made while the overlay is closed do not fire later.
    const up = Phaser.Input.Keyboard.JustDown(W);
    const down = Phaser.Input.Keyboard.JustDown(S);
    const pick = Phaser.Input.Keyboard.JustDown(J);
    const undo = Phaser.Input.Keyboard.JustDown(K);
    const tap = this.pkOrderTap;
    this.pkOrderTap = null;

    const pk = this.state.match.pk;
    const open = pk !== null && pk.stage === 'order' && pk.order[0] === null;
    if (!open) {
      if (this.pkOrderOpen) {
        this.setPkOrderVisible(false);
        this.touch.setVisible(true);
      }
      this.pkOrderOpen = false;
      return;
    }
    if (!this.pkOrderOpen) {
      this.pkOrderOpen = true;
      this.pkOrderCursor = 0;
      this.pkOrderPicks = [];
      this.setPkOrderVisible(true);
      this.touch.setVisible(false);
      this.refreshPkOrder();
    }

    const roster = this.humanRoster();
    if (up) this.pkOrderCursor = (this.pkOrderCursor + roster.length - 1) % roster.length;
    if (down) this.pkOrderCursor = (this.pkOrderCursor + 1) % roster.length;
    const tapRow = typeof tap === 'number' ? tap : null;
    if (tapRow !== null) this.pkOrderCursor = tapRow;
    if (pick || tapRow !== null) {
      const idx = roster[this.pkOrderCursor];
      if (!this.pkOrderPicks.includes(idx)) {
        this.pkOrderPicks.push(idx);
        // Move the cursor to the next player who is not picked yet.
        for (let step = 1; step <= roster.length; step++) {
          const next = (this.pkOrderCursor + step) % roster.length;
          if (!this.pkOrderPicks.includes(roster[next])) {
            this.pkOrderCursor = next;
            break;
          }
        }
      }
    }
    if ((undo || tap === 'undo') && this.pkOrderPicks.length > 0) {
      const last = this.pkOrderPicks.pop() as number;
      this.pkOrderCursor = roster.indexOf(last);
    }
    if (up || down || pick || undo || tap !== null) this.refreshPkOrder();

    if (this.pkOrderPicks.length === roster.length) {
      submitPkOrder(this.state, 0, this.pkOrderPicks);
    }
  }

  private humanRoster(): number[] {
    return this.state.players.filter((p) => p.team === 0).map((p) => p.idx);
  }

  private refreshPkOrder(): void {
    const roster = this.humanRoster();
    const left = orderLeft(this.view.W);
    const g = this.pkOrderGfx.clear();
    g.fillStyle(0x000000, 0.8);
    g.fillRect(left, ORDER_BOX_Y, ORDER_BOX_W, ORDER_BOX_H);
    roster.forEach((idx, i) => {
      const p = this.state.players[idx];
      const pos = this.pkOrderPicks.indexOf(idx);
      g.fillStyle(i === this.pkOrderCursor ? 0x3a5a7a : 0x1d2630, 1);
      g.fillRect(left + ORDER_ROW_X, ORDER_ROW_Y0 + i * ORDER_ROW_H - ORDER_ROW_BOX_H / 2, ORDER_ROW_W, ORDER_ROW_BOX_H);
      const row = this.pkOrderRows[i];
      row.slot.setText(pos >= 0 ? String(pos + 1) : '-');
      row.role.setText(p.role);
      row.name.setText(p.name);
      row.stats.setText(`力量 ${p.stats.power}　技巧 ${p.stats.technique}`);
    });
    g.fillStyle(0x3a5a7a, 1);
    g.fillRect(left + ORDER_UNDO_X, ORDER_UNDO_Y, ORDER_UNDO_W, ORDER_UNDO_H);
    this.pkOrderCount.setText(`已選 ${this.pkOrderPicks.length} / ${PK_ROUNDS}`);
  }

  private setPkOrderVisible(visible: boolean): void {
    this.pkOrderObjs.forEach((o) => o.setVisible(visible));
  }
}
