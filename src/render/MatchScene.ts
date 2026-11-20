import Phaser from 'phaser';
import { computeAIInputs, createAIState, type AIState } from '../ai';
import { AudioPlayer } from '../audio';
import { COUNTRY_INFO, getTeam, SIZE_PARAMS, type Country, type SpecialKind } from '../data';
import { LocalInput, TouchControls } from '../input';
import {
  BALL_RADIUS,
  BEAM_CAST_TICKS,
  CHARGE_FULL,
  DRIBBLE_OFFSET,
  FIELD_D,
  FIELD_W,
  EMPTY_INPUT,
  GOAL_HALF_W,
  LEAP_FLY_TICKS,
  LUNGE_TICKS,
  RIDER_HIT_RADIUS,
  SPECIAL_COOLDOWN_TICKS,
  SPECIAL_STAMINA_COST,
  TICK_HZ,
  autoPkOrders,
  createInitialState,
  isInvincible,
  pkMeterValue,
  step,
  submitPkOrder,
  type GameState,
  type InputFrame,
  type MatchPhase,
  type PkState,
  type Player,
  type Rider,
  type SimEvent,
} from '../sim';
import { DEPTH_SCALE, cameraTargetX, pkCameraX, worldToScreen } from './projection';
import type { ResultInit, ResultScorer } from './ResultScene';
import {
  BALL_SHEET,
  createSpriteAnims,
  fxAnimKey,
  preloadSprites,
  RIDER_SHEET,
  riderAnimKey,
  SPRITE_CONFIGS,
  spriteAnimKey,
  type FxAnim,
  type FxSheet,
  type SpriteAnim,
  type SpriteConfig,
} from './sprites';
import { Stadium } from './stadium';
import type { TeamSelectState } from './TeamSelectScene';
import { applyView, BASE_H, textResolution, type View } from './view';

export interface MatchInit {
  home?: Country;
  away?: Country;
  humanIdx?: number;
  seed?: number;
  halfSeconds?: number;
  /** Skill preview (team select 預覽): the character's id, and the team-select state to return to. */
  preview?: string;
  returnTo?: TeamSelectState;
}

interface PlayerView {
  container: Phaser.GameObjects.Container;
  gfx: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  /** Invincibility timer above the name (human only, during a rampage or lunge). */
  tag: Phaser.GameObjects.Text;
  /** '沉默' above the name while a leap has silenced him. */
  silence: Phaser.GameObjects.Text;
  /** Set when the character's sheet loaded. The block figure is drawn when this is null. */
  sprite: Phaser.GameObjects.Sprite | null;
  spriteCfg: SpriteConfig | null;
}

/** A cavalry rider on screen: its container (team shadow and sprite) on the rider's ground point, and its summoner. */
interface RiderView {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  ownerIdx: number;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
}

/** A playing effect. It is opaque until holdMs, fades out by endMs, then is removed. follow: player idx it stays on. */
interface FxInstance {
  sprite: Phaser.GameObjects.Sprite;
  startMs: number;
  holdMs: number;
  endMs: number;
  follow: number | null;
  offX: number;
  offY: number;
  /** Player idx whose beam channel this effect is, so a cancelled channel can stop it. */
  castOf: number | null;
  /** Player idx whose rampage this effect is, so the rampage's end fades it. */
  rampageOf: number | null;
  /** Feared player idx whose fear this effect is (chains, icon), so the fear's end fades it. */
  fearOf: number | null;
  /** Leaping player idx whose flight this effect is (the crow trail), so the landing fades it. */
  leapOf: number | null;
  /** A follower that rises with his height z (a leap's crow trail). */
  lifted: boolean;
  /** Draw alpha while held. */
  alpha: number;
  /** A follower that turns with his facing: flipped, and its offset x turned around. */
  mirror: boolean;
  /** Depth relative to the followed player's y (0.5 in front of him, negative behind him). */
  depthOff: number;
}

/** Where and how playFx places one effect (screen px). holdMs and endMs default to the animation's length. */
interface FxSpawn {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  flip?: boolean;
  angle?: number;
  holdMs?: number;
  endMs?: number;
  follow?: number;
  offX?: number;
  offY?: number;
  castOf?: number;
  rampageOf?: number;
  fearOf?: number;
  leapOf?: number;
  lifted?: boolean;
  alpha?: number;
  mirror?: boolean;
  depthOff?: number;
}

interface PkOrderRow {
  slot: Phaser.GameObjects.Text;
  role: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  stats: Phaser.GameObjects.Text;
}

type HudStyle = (color: string, size: string, stroke?: boolean) => Phaser.Types.GameObjects.Text.TextStyle;

/** Why the player cannot cast the special where he stands: no ball (a no-ball special needs none). Null when it allows it. */
function positionBlockReason(state: GameState, p: Player): string | null {
  if (!p.specialNoBall && state.ball.ownerIdx !== p.idx) return '需持球';
  return null;
}

/** Why the player cannot cast a special while silenced by a leap. Null when he is not silenced. */
function silenceBlockReason(p: Player): string | null {
  return p.silenceTicks > 0 ? '沉默' : null;
}

/**
 * Why the human's L press starts no special, or null when none of the three reasons applies (the sim then buffers
 * the press). Checked before the step that consumes the press.
 */
function specialBlockReason(state: GameState, p: Player): string | null {
  const silence = silenceBlockReason(p);
  if (silence !== null) return silence;
  const position = positionBlockReason(state, p);
  if (position !== null) return position;
  if (p.specialCooldown > 0) return `冷卻中 ${Math.ceil(p.specialCooldown / TICK_HZ)} 秒`;
  if (p.stamina < SPECIAL_STAMINA_COST) return '體力不足';
  return null;
}

const STEP_MS = 1000 / TICK_HZ;
const MAX_STEPS_PER_FRAME = 4;
const MAX_FRAME_MS = 100;
const CAMERA_LERP = 0.15;
const TRAIL_LEN = 8;
/** The ball sprite's display diameter, and its frame advance: one of the 8 rotation frames per this many px rolled. */
const BALL_DISPLAY_D = BALL_RADIUS * 4.8;
/** The ball art sits on the ground: its centre is drawn this far above the sim ball point. */
const BALL_LIFT = BALL_DISPLAY_D * 0.45;
const BALL_SPIN_FRAMES = 8;
const BALL_SPIN_PX = 5;
/** A ball moving farther than this in one draw is a reposition (kickoff, restart), not a roll. */
const BALL_SPIN_MAX_STEP = 30;
/** Touch devices draw the match bigger: a 280-row view instead of BASE_H (about 1.29× on a phone). */
const MATCH_BASE_H_TOUCH = 280;
/**
 * Touch layout only: the field band moves down by this much in the shorter view, so its far edge clears the top bar
 * and the near edge sits just above the bottom bar.
 */
const TOUCH_FIELD_SHIFT_Y = 60;

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
/** Touch: the aim box moves left of the touch buttons (the K button sits in the top-right corner). */
const PK_AIM_RIGHT_TOUCH = 170;
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
const ORDER_TITLE_Y = 52;
const ORDER_HINT_Y = 74;
const ORDER_COUNT_Y = 292;
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

/**
 * Vertical layout of the kicking-order overlay. Everything scales by H / BASE_H, so the overlay fits a short touch view
 * (H 280) and is unchanged at BASE_H or taller.
 */
function orderLayout(H: number) {
  const k = Math.min(1, H / BASE_H);
  return {
    boxY: ORDER_BOX_Y * k,
    boxH: ORDER_BOX_H * k,
    titleY: ORDER_TITLE_Y * k,
    hintY: ORDER_HINT_Y * k,
    countY: ORDER_COUNT_Y * k,
    rowY0: ORDER_ROW_Y0 * k,
    rowH: ORDER_ROW_H * k,
    rowBoxH: ORDER_ROW_BOX_H * k,
    undoY: ORDER_UNDO_Y * k,
    undoH: ORDER_UNDO_H * k,
  };
}
/** Minimap at the bottom-centre: world units scaled to pixels, MINIMAP_BOTTOM units above the view's bottom edge.
 * The width is capped to W - MINIMAP_SIDE_CLEAR so it stays clear of the touch joystick (left) and buttons (right). */
const MINIMAP_SCALE = 0.15;
const MINIMAP_BOTTOM = 6;
const MINIMAP_SIDE_CLEAR = 340;
/** Top-left HUD: the human's stamina bar (under the name) with a tick at the special cost. */
const STAMINA_BAR_X = 8;
const STAMINA_BAR_Y = 21;
const STAMINA_BAR_W = 110;
const STAMINA_BAR_H = 8;
const STAMINA_LOW_RATIO = 0.5;
/** Off-screen arrow: shown when the human is closer than ARROW_MARGIN to a view edge. The arrow is clamped to
 * the band between the top bar and the bottom edge (or the minimap / touch buttons). */
const ARROW_MARGIN = 10;
const ARROW_SIZE = 12;
const ARROW_EDGE_X = 16;
const ARROW_EDGE_TOP = 44;
const ARROW_EDGE_BOTTOM = 62;
const ARROW_EDGE_BOTTOM_TOUCH = 142;
/** Horizontal speed (sim units per second) above which the sprite runs. */
const RUN_SPEED = 20;
/** How long the special pose (activation) and the special-shot pose override the action animation. */
const SPECIAL_POSE_MS = 900;
const SHOT_POSE_MS = 400;
const ROAR_SHAKE_MS = 160;
const ROAR_SHAKE_INTENSITY = 0.004;
/** Zhang Fei's roar: the charge at his feet (its size), then the soundwave starts after the charge (ROAR_CHARGE_MS). */
const ROAR_CHARGE_FX_SIZE = 110;
const ROAR_CHARGE_MS = 250;
/** The soundwave: width, and how far its left edge sits in front of his feet. */
const ROAR_WAVE_FX_W = 170;
const ROAR_WAVE_AHEAD = 10;
/** Guan Yu's rampage: the aura over him (its size and alpha), the exhaust behind his rear wheel (its size and offset). */
const RAMPAGE_AURA_FX_SIZE = 110;
const RAMPAGE_AURA_ALPHA = 0.85;
const RAMPAGE_EXHAUST_FX_SIZE = 70;
const RAMPAGE_EXHAUST_BACK = 30;
const RAMPAGE_EXHAUST_LIFT = 6;
/** Fade time after a rampage ends or a roar charge plays. */
const FX_FADE_MS = 150;
/** Guan Yu's fire dragon around him during the rampage (its width), and the impact burst (rampage bumps). */
const DRAGON_FX_LEN = 150;
const IMPACT_FX_SIZE = 80;
/** Roar spark on each victim, and the height of a hit's burst over the victim's feet. */
const SPARK_FX_SIZE = 60;
const HIT_FX_LIFT = 20;
/** Simayi's leap: the smoke at his start (its size), the crow trail behind him in the air (its width, its offset behind him and its height), the green ring where he lands (its width), the burst on each victim, the fade after the landing, and the landing crouch's pose time. */
const LEAP_SMOKE_FX_SIZE = 80;
const LEAP_TRAIL_FX_W = 150;
const LEAP_TRAIL_BACK = 50;
const LEAP_TRAIL_LIFT = 28;
const LEAP_RING_FX_W = 150;
const LEAP_VICTIM_FX_SIZE = 80;
const LEAP_SHAKE_MS = 120;
const LEAP_SHAKE_INTENSITY = 0.003;
const LEAP_LAND_POSE_MS = 400;
/** Silence label above a silenced player's name. */
const SILENCE_COLOR = '#7cff6b';
/** Zhang Liao's fear: the ghost burst over him (its width), the chains ring under each feared player (its width), and the '!' icon over his head (its width, gap above his sprite). */
const FEAR_GHOST_FX_SIZE = 150;
const FEAR_CHAIN_FX_SIZE = 80;
const FEAR_ICON_FX_SIZE = 40;
const FEAR_ICON_GAP = 4;
/** Lunge start: a small shake. The dragon holds for the dash, then fades for LUNGE_FADE_MS. */
const LUNGE_SHAKE_MS = 120;
const LUNGE_SHAKE_INTENSITY = 0.002;
const LUNGE_FADE_MS = 150;
/** Lunge dragon: on-screen length and height, and how far ahead of his feet it sits. */
const LUNGE_FX_LEN = 180;
const LUNGE_FX_H = 120;
const LUNGE_FX_AHEAD = 40;
/** Spear thrust streak: length, distance in front of him, and height as a fraction of his sprite height. */
const THRUST_FX_LEN = 70;
const THRUST_FX_AHEAD = 30;
const THRUST_FX_HEIGHT = 0.45;
/** Impact burst at the lunge start and end. */
const BURST_FX_SIZE = 60;
/** Ma Chao's summon: the call's width and its small camera shake. */
const SUMMON_FX_SIZE = 110;
const SUMMON_SHAKE_MS = 120;
const SUMMON_SHAKE_INTENSITY = 0.002;
/** Ma Chao's riders: the burst where a rider appears or hits, the smoke where it vanishes, and the sprite's alpha. */
const RIDER_BURST_FX_SIZE = 70;
const RIDER_SMOKE_FX_SIZE = 80;
const RIDER_ALPHA = 0.95;
/** Zhuge Liang's beam: channel circle over his body (its size), energy ball size, impact size, and the impact height over a victim's feet. */
const BEAM_CHARGE_FX_SIZE = 80;
const BEAM_IMPACT_FX_SIZE = 70;
const BEAM_HIT_LIFT = 20;
const BEAM_FADE_MS = 150;
const BEAM_SHAKE_MS = 120;
const BEAM_SHAKE_INTENSITY = 0.002;
/**
 * Xu Chu's tiger guard: the fire ring round him (its width), the tiger maw over him while a shot is held and the fire roar
 * (both width TIGER_HEAD_FX_W, centred TIGER_HEAD_AHEAD px in front of his feet, at TIGER_HEAD_LIFT of his sprite height),
 * the forward roar (centred TIGER_ROAR_AHEAD px in front), the flaming trail of the spat ball (its width), the roar's
 * length in ms (its 4 frames at 10 fps) and the cast pose time.
 */
const TIGER_RING_FX_W = 110;
const TIGER_HEAD_FX_W = 140;
const TIGER_HEAD_AHEAD = 30;
const TIGER_ROAR_AHEAD = 80;
const TIGER_HEAD_LIFT = 0.9;
const TIGER_TRAIL_FX_W = 120;
const TIGER_ROAR_FX_MS = 400;
const TIGER_POSE_MS = 400;
const TIGER_SHAKE_MS = 160;
const TIGER_SHAKE_INTENSITY = 0.004;
/** Why-not hint above the human's name: shown for HINT_MS, rising HINT_RISE px while it fades. */
const HINT_MS = 1000;
const HINT_RISE = 8;
const HINT_COLOR = '#fff3b0';
const PLAYER_COUNT = 10;
/** Skill preview: a long half so the clock never ends it, the human's L press at 0.6 s and J 1.2 s later (rampage), and the end 4.5 s after L. */
const PREVIEW_HALF_SECONDS = 600;
const PREVIEW_L_TICK = 36;
const PREVIEW_J_TICK = PREVIEW_L_TICK + 72;
const PREVIEW_END_TICK = PREVIEW_L_TICK + 270;
/** After a goal in a preview, the demo ends this long after the celebration starts. */
const PREVIEW_GOAL_END_MS = 1500;
/** Preview start: the human's distance in front of the far goal line, and three defenders' offsets from him (x, y). */
const PREVIEW_GOAL_DIST = 250;
const PREVIEW_DEFENDERS: [number, number][] = [
  [55, -40],
  [55, 40],
  [110, 0],
];
const PREVIEW_BACK_W = 64;
const PREVIEW_BACK_H = 22;

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
  beam: 0xfff27a,
};

function hexCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Left edge of the centred PK order box for a view of width W. */
function orderLeft(W: number): number {
  return (W - ORDER_BOX_W) / 2;
}

/** Minimap scale for a view of width W: MINIMAP_SCALE, shrunk on narrow touch views to clear the touch controls. */
function minimapScale(W: number): number {
  return Math.min(MINIMAP_SCALE, (W - MINIMAP_SIDE_CLEAR) / FIELD_W);
}

function hitRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function previewBackRect(W: number): { x: number; y: number; w: number; h: number } {
  return { x: W - 10 - PREVIEW_BACK_W, y: 6, w: PREVIEW_BACK_W, h: PREVIEW_BACK_H };
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
  private stadium!: Stadium;
  private ballSprite!: Phaser.GameObjects.Sprite;
  /** Ball position at the last draw, and the rotation frame, for the roll animation. */
  private ballSpinX = 0;
  private ballSpinY = 0;
  private ballSpinFrame = 0;
  private ballSpinAcc = 0;
  private ballSpinSign = 1;
  private ballShadowGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private trail: TrailPoint[] = [];
  /** Per player idx: time (ms) until which the pose animation is shown, and which one. */
  private poseUntil: number[] = [];
  private poseAnim: SpriteAnim[] = [];
  private fx: FxInstance[] = [];
  private riderViews = new Map<number, RiderView>();
  /** Zhang Liao's fear: the caster of each player feared by him, and the feared players whose chains are on (see updateFearFx). */
  private fearCaster = new Map<number, number>();
  private fearShown = new Set<number>();
  /** Xu Chu's tiger guard effects: the fire ring round him, the maw over him while a shot is held, and the trail of the spat ball. */
  private tigerRing = new Map<number, FxInstance>();
  private tigerMaw = new Map<number, FxInstance>();
  private tigerTrail: FxInstance | null = null;

  private homeText!: Phaser.GameObjects.Text;
  private awayText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private topBarGfx!: Phaser.GameObjects.Graphics;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private minimapFrames = 0;
  private arrowGfx!: Phaser.GameObjects.Graphics;
  private arrowText!: Phaser.GameObjects.Text;
  private arrowShown = false;
  private view!: View;
  /** Base view height for this device: MATCH_BASE_H_TOUCH on touch devices, BASE_H otherwise. */
  private baseH = BASE_H;
  private clockText!: Phaser.GameObjects.Text;
  private hudNameText!: Phaser.GameObjects.Text;
  private hudStaminaGfx!: Phaser.GameObjects.Graphics;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private specialText!: Phaser.GameObjects.Text;
  private specialUntil = 0;
  private hintText!: Phaser.GameObjects.Text;
  private hintUntil = 0;
  private lastHintText = '';
  /** The human's L button on the previous tick, for the press edge that triggers the special hint. */
  private prevHumanL = false;
  private prevPhase: MatchPhase | null = null;
  private scorers: ResultScorer[] = [];
  private resultQueued = false;

  /** Skill preview mode (null for a real match). The human is scripted; see previewInput. */
  private preview: { id: string; returnTo?: TeamSelectState } | null = null;
  private previewTick = 0;
  private previewEnded = false;
  /** Event types seen during a preview, for the e2e check. */
  private previewEvents: string[] = [];
  private previewGfx!: Phaser.GameObjects.Graphics;
  private previewText!: Phaser.GameObjects.Text;
  private previewBackText!: Phaser.GameObjects.Text;

  private pkObjs: Phaser.GameObjects.Components.Visible[] = [];
  private pkHudGfx!: Phaser.GameObjects.Graphics;
  private pkAimGfx!: Phaser.GameObjects.Graphics;
  private pkScoreText!: Phaser.GameObjects.Text;
  /** Shootout bottom-centre lines: shooter / keeper names and the aim hint. */
  private pkLineText!: Phaser.GameObjects.Text;
  private pkHintText!: Phaser.GameObjects.Text;
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
    this.preview = data?.preview ? { id: data.preview, returnTo: data.returnTo } : null;
    this.previewTick = 0;
    this.previewEnded = false;
    this.previewEvents = [];
  }

  preload(): void {
    preloadSprites(this.load);
  }

  create(): void {
    this.baseH = this.sys.game.device.input.touch ? MATCH_BASE_H_TOUCH : BASE_H;
    this.view = applyView(this, (v) => this.layoutHud(v), this.baseH);
    this.state = createInitialState(
      {
        seed: this.seed,
        teams: [getTeam(this.homeCountry), getTeam(this.awayCountry)],
        halfSeconds: this.preview ? PREVIEW_HALF_SECONDS : this.halfSeconds,
        startInPlay: this.preview !== null,
      },
      SIZE_PARAMS,
    );
    if (this.preview) this.setupPreview();
    this.aiState = createAIState((this.seed ^ 0x5bd1e995) >>> 0);
    this.aiOff = new URLSearchParams(window.location.search).get('ai') === '0';
    this.humanMask = this.state.players.map((p) => p.idx === this.humanIdx);
    this.accumulator = 0;
    this.prevPhase = null;
    this.trail = [];
    this.poseUntil = [];
    this.poseAnim = [];
    this.fx = [];
    this.fearCaster.clear();
    this.fearShown.clear();
    this.tigerRing.clear();
    this.tigerMaw.clear();
    this.tigerTrail = null;
    this.scorers = [];
    this.resultQueued = false;
    this.prevHumanL = false;
    this.hintUntil = 0;
    this.lastHintText = '';
    this.teamColors = [COUNTRY_INFO[this.homeCountry].color, COUNTRY_INFO[this.awayCountry].color];
    this.touch = new TouchControls(this, this.view);
    this.localInput = new LocalInput(this, this.touch);
    this.events.once('shutdown', () => {
      this.localInput.destroy();
      this.touch.destroy();
      this.clearRiders();
    });

    this.stadium = new Stadium(this, new URLSearchParams(window.location.search).get('nosoldiers') !== '1');
    createSpriteAnims(this.anims, this.textures);
    this.createPlayerViews();
    this.ballShadowGfx = this.add.graphics();
    this.trailGfx = this.add.graphics();
    this.ballSprite = this.add
      .sprite(0, 0, BALL_SHEET.key, 0)
      .setScale(BALL_DISPLAY_D / BALL_SHEET.frameWidth);
    this.ballSpinX = this.state.ball.x;
    this.ballSpinY = this.state.ball.y;
    this.createHud();
    if (this.preview) this.createPreviewHud();
    this.layoutHud(this.view);

    const cam = this.cameras.main;
    cam.scrollX = cameraTargetX(this.state.ball.x, this.view.W);
    cam.scrollY = this.fieldScrollY(this.view.H);

    (window as unknown as { __sg: unknown }).__sg = {
      state: () => this.state,
      humanIdx: this.humanIdx,
      scene: this,
      minimap: () => this.minimapFrames,
      arrowVisible: () => this.arrowShown,
      lastHint: () => this.lastHintText,
      preview: () => ({ events: this.previewEvents.slice(), ended: this.previewEnded }),
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
    const inputs = (this.aiOff || this.preview) && !inShootout
      ? this.state.players.map(() => ({ ...EMPTY_INPUT }))
      : computeAIInputs(this.state, this.aiState, this.humanMask);
    inputs[this.humanIdx] = this.preview ? this.previewInput() : this.localInput.sample();
    this.humanInput = inputs[this.humanIdx];
    // A fresh L press in play gets a reason; the hint shows only if this step starts no special for the human.
    const pressedL = this.humanInput.l && !this.prevHumanL;
    this.prevHumanL = this.humanInput.l;
    const blocked =
      pressedL && this.state.match.phase === 'play'
        ? specialBlockReason(this.state, this.state.players[this.humanIdx])
        : null;
    step(this.state, inputs);
    const special = this.state.events.some((e) => e.type === 'special' && e.playerIdx === this.humanIdx);
    if (blocked !== null && !special) this.showHint(blocked);
    this.audio.handleEvents(this.state.events);
    this.updateTrail();
    this.onEvents(this.state.events);
    if (this.preview && this.previewTick > PREVIEW_END_TICK) this.endPreview();
  }

  /** Preview script: one L tick at 0.6 s, and for a rampage one J tick 1.2 s later. Nothing else. */
  private previewInput(): InputFrame {
    const t = this.previewTick;
    this.previewTick++;
    const input: InputFrame = { ...EMPTY_INPUT };
    if (t === PREVIEW_L_TICK) input.l = true;
    if (t === PREVIEW_J_TICK && this.state.players[this.humanIdx].specialMode === 'rampage') input.j = true;
    return input;
  }

  /** Human on the far side of the opponent's goal, owning the ball, with three defenders in front. */
  private setupPreview(): void {
    const { players, ball } = this.state;
    const human = players[this.humanIdx];
    const x = FIELD_W - PREVIEW_GOAL_DIST;
    human.x = x;
    human.y = FIELD_D / 2;
    human.facingX = 1;
    human.facingY = 0;
    PREVIEW_DEFENDERS.forEach(([dx, dy], i) => {
      const p = players[PLAYER_COUNT / 2 + 1 + i];
      p.x = x + dx;
      p.y = FIELD_D / 2 + dy;
    });
    ball.ownerIdx = this.humanIdx;
    ball.lastTouchIdx = this.humanIdx;
    ball.special = null;
    ball.x = human.x + human.facingX * (human.radius + DRIBBLE_OFFSET);
    ball.y = human.y;
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
  }

  private endPreview(): void {
    if (!this.preview || this.previewEnded) return;
    this.previewEnded = true;
    this.scene.start('TeamSelectScene', { returnTo: this.preview.returnTo });
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
    if (this.preview) for (const e of events) this.previewEvents.push(e.type);
    if (match.phase !== this.prevPhase) {
      this.prevPhase = match.phase;
      this.onPhase(match.phase);
    }
    for (const e of events) {
      if (e.type === 'goal') {
        // An untouched ball (scorerIdx -1) has no scorer name.
        const scorerName = players[e.scorerIdx]?.name ?? '';
        this.scorers.push({ team: e.team, name: scorerName, minute: this.elapsedMinute() });
        this.showBanner(`進球！ ${scorerName}`, 2000);
        this.stadium.cheer(this.time.now);
        if (this.preview) this.time.delayedCall(PREVIEW_GOAL_END_MS, () => this.endPreview());
      } else if (e.type === 'special') {
        this.showSpecial(`${e.name}！`, SPECIAL_COLORS[e.kind]);
        // A lunge shows its dash pose for the whole dash, and a beam its channel pose (spriteAnimFor), not the activation pose.
        if (players[e.playerIdx].specialMode !== 'lunge' && players[e.playerIdx].specialMode !== 'beam' && players[e.playerIdx].specialMode !== 'leap') {
          this.playPose(e.playerIdx, 'special', SPECIAL_POSE_MS);
        }
      } else if (e.type === 'specialShot') {
        this.playPose(e.playerIdx, 'shot', SHOT_POSE_MS);
      } else if (e.type === 'rampageStart') {
        this.rampageStartFx(e.playerIdx);
      } else if (e.type === 'rampageEnd') {
        this.rampageEndFx(e.playerIdx);
      } else if (e.type === 'hit') {
        this.specialHitFx(e);
      } else if (e.type === 'beamCharge') {
        this.beamChargeFx(e.playerIdx);
      } else if (e.type === 'beamCancel') {
        this.beamCancelFx(e.playerIdx);
      } else if (e.type === 'beamStrike') {
        const victim = players[e.victimIdx];
        this.cameras.main.shake(BEAM_SHAKE_MS, BEAM_SHAKE_INTENSITY);
        this.impactFx(victim.x, victim.y, BEAM_HIT_LIFT);
      } else if (e.type === 'roar') {
        this.cameras.main.shake(ROAR_SHAKE_MS, ROAR_SHAKE_INTENSITY);
        this.roarFx(e.playerIdx);
      } else if (e.type === 'fear') {
        for (const v of e.victimIdxs) this.fearCaster.set(v, e.playerIdx);
        this.fearCastFx(e.playerIdx);
      } else if (e.type === 'tigerStart') {
        this.tigerRingFx(e.playerIdx);
      } else if (e.type === 'tigerSwallow') {
        this.tigerSwallowFx(e.playerIdx);
        this.playPose(e.playerIdx, 'cast', TIGER_POSE_MS);
      } else if (e.type === 'tigerSpit') {
        this.tigerSpitFx(e.playerIdx);
        this.playPose(e.playerIdx, 'cast', TIGER_POSE_MS);
      } else if (e.type === 'tigerRoar') {
        this.cameras.main.shake(TIGER_SHAKE_MS, TIGER_SHAKE_INTENSITY);
        this.tigerRoarFx(e.playerIdx);
        this.playPose(e.playerIdx, 'cast', TIGER_POSE_MS);
      } else if (e.type === 'tigerEnd') {
        this.fadeTigerRing(e.playerIdx);
        this.fadeTigerMaw(e.playerIdx);
      } else if (e.type === 'attack') {
        if (e.kind === 'punch') this.punchFx(e.playerIdx);
      } else if (e.type === 'lungeStart') {
        this.cameras.main.shake(LUNGE_SHAKE_MS, LUNGE_SHAKE_INTENSITY);
        this.lungeFx(e);
      } else if (e.type === 'lungeEnd') {
        this.burstFx(e.playerIdx, e.x, e.y);
      } else if (e.type === 'leapStart') {
        const p = players[e.playerIdx];
        this.groundFx(e.playerIdx, 'smoke', p.x, p.y, LEAP_SMOKE_FX_SIZE);
      } else if (e.type === 'leapFly') {
        this.leapTrailFx(e.playerIdx);
      } else if (e.type === 'leapLand') {
        this.cameras.main.shake(LEAP_SHAKE_MS, LEAP_SHAKE_INTENSITY);
        this.leapLandFx(e);
        this.playPose(e.playerIdx, 'land', LEAP_LAND_POSE_MS);
      } else if (e.type === 'summonStart') {
        this.cameras.main.shake(SUMMON_SHAKE_MS, SUMMON_SHAKE_INTENSITY);
        this.summonFx(e.playerIdx);
      } else if (e.type === 'riderSpawn') {
        const rider = this.state.riders.find((r) => r.id === e.riderId);
        if (rider) {
          this.riderView(rider);
          this.groundFx(rider.ownerIdx, 'burst', e.x, e.y, RIDER_BURST_FX_SIZE);
        }
      } else if (e.type === 'riderHit') {
        const view = this.riderViews.get(e.riderId);
        if (view) {
          view.sprite.play(riderAnimKey('charge'));
          const victim = players[e.victimIdx];
          this.groundFx(view.ownerIdx, 'burst', victim.x, victim.y, RIDER_BURST_FX_SIZE);
        }
      } else if (e.type === 'riderEnd') {
        const view = this.riderViews.get(e.riderId);
        if (view) this.groundFx(view.ownerIdx, 'smoke', e.x, e.y, RIDER_SMOKE_FX_SIZE);
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
    cam.scrollY = this.fieldScrollY(H);
    this.stadium.update(this.time.now, cam.scrollX, cam.scrollY, H);

    this.state.players.forEach((p, i) => this.drawPlayer(this.playerViews[i], p, time));
    this.drawRiders();
    this.drawBall();
    this.updateFearFx();
    this.updateTigerTrail();
    this.drawFx();
    this.drawHud();
    this.drawMinimap();
    this.drawArrow();
  }

  /** Camera scrollY: centres the field band vertically when the window is taller than the base height. */
  private fieldScrollY(H: number): number {
    const shift = this.baseH === BASE_H ? 0 : TOUCH_FIELD_SHIFT_Y;
    return (this.baseH - H) / 2 + shift;
  }

  /** The character's effect sheet, when its sprite config has one that loaded. */
  private fxOwner(idx: number): { cfg: SpriteConfig; fx: FxSheet } | null {
    const cfg = this.playerViews[idx].spriteCfg;
    if (!cfg?.fx || !this.textures.exists(cfg.fx.key)) return null;
    return { cfg, fx: cfg.fx };
  }

  /** Adds one effect (additive blend) to the scene and tracks it in this.fx until it is removed. */
  private playFx(fx: FxSheet, name: FxAnim, s: FxSpawn): FxInstance | null {
    const def = fx.anims[name];
    if (!def) return null;
    const durMs = (def.frames.length / def.fps) * 1000;
    const holdMs = s.holdMs ?? durMs;
    const sprite = this.add
      .sprite(s.x, s.y, fx.key)
      .setName(`fx:${name}`)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(s.w, s.h)
      .setDepth(s.depth)
      .setFlipX(s.flip ?? false)
      .setRotation(s.angle ?? 0)
      .play(fxAnimKey(fx, name));
    const instance: FxInstance = {
      sprite,
      startMs: this.time.now,
      holdMs,
      endMs: s.endMs ?? holdMs,
      follow: s.follow ?? null,
      offX: s.offX ?? 0,
      offY: s.offY ?? 0,
      castOf: s.castOf ?? null,
      rampageOf: s.rampageOf ?? null,
      fearOf: s.fearOf ?? null,
      leapOf: s.leapOf ?? null,
      lifted: s.lifted ?? false,
      alpha: s.alpha ?? 1,
      mirror: s.mirror ?? false,
      depthOff: s.depthOff ?? 0.5,
    };
    this.fx.push(instance);
    return instance;
  }

  /** A punch's streak in front of him at chest height: Zhao Yun's spear thrust or Zhuge Liang's fan slash (sheet's punch). */
  private punchFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const dir = p.facingX < 0 ? -1 : 1;
    const len = owner.fx.punchWidth ?? THRUST_FX_LEN;
    this.playFx(owner.fx, owner.fx.punch, {
      x: feet.sx + dir * THRUST_FX_AHEAD,
      y: feet.sy - owner.cfg.displayHeight * THRUST_FX_HEIGHT,
      w: len,
      h: (len * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.5,
      flip: dir < 0,
    });
  }

  /** One of an owner's effects on the ground at sim point (x, y), `size` px wide, keeping the sheet's proportions. */
  private groundFx(idx: number, name: FxAnim, x: number, y: number, size: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const pt = worldToScreen(x, y, 0);
    this.playFx(owner.fx, name, {
      x: pt.sx,
      y: pt.sy,
      w: size,
      h: (size * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: y + 0.5,
    });
  }

  /** Ma Chao's summon call: the banner effect at his feet, following him, from the summon start. */
  private summonFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    this.playFx(owner.fx, 'summon', {
      x: feet.sx,
      y: feet.sy,
      w: SUMMON_FX_SIZE,
      h: (SUMMON_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.5,
      follow: idx,
    });
  }

  /** The rider's sprite view, created the first time it is seen. */
  private riderView(r: Rider): RiderView {
    const existing = this.riderViews.get(r.id);
    if (existing) return existing;
    const shadow = this.add.graphics();
    shadow.fillStyle(this.teamColors[r.team], 0.45);
    shadow.fillEllipse(0, 0, RIDER_HIT_RADIUS * 2.4, RIDER_HIT_RADIUS * 1.2);
    const sprite = this.add.sprite(0, 0, RIDER_SHEET.key).play(riderAnimKey('gallop'));
    const container = this.add.container(0, 0, [shadow, sprite]).setName(`rider:${r.id}`);
    const view: RiderView = { container, sprite, ownerIdx: r.ownerIdx };
    this.riderViews.set(r.id, view);
    return view;
  }

  /**
   * One sprite per live rider, on its ground point and depth-sorted with the players by y. A rider whose charge has
   * finished returns to the gallop. Views of riders that are gone are destroyed.
   */
  private drawRiders(): void {
    const live = new Set(this.state.riders.map((r) => r.id));
    for (const [id, view] of this.riderViews) {
      if (live.has(id)) continue;
      view.container.destroy();
      this.riderViews.delete(id);
    }
    const { meta, displayHeight } = RIDER_SHEET;
    const ax = meta.anchorX / meta.frameWidth;
    const ay = meta.anchorY / meta.frameHeight;
    for (const r of this.state.riders) {
      const view = this.riderView(r);
      const { sx, sy } = worldToScreen(r.x, r.y, 0);
      const flip = r.facingX < 0;
      view.container.setPosition(sx, sy).setDepth(r.y);
      view.sprite
        .setOrigin(flip ? 1 - ax : ax, ay)
        .setFlipX(flip)
        .setScale(displayHeight / meta.frameHeight)
        .setAlpha(RIDER_ALPHA);
      if (!view.sprite.anims.isPlaying) view.sprite.play(riderAnimKey('gallop'));
    }
  }

  /** Removes every rider sprite (scene shutdown). */
  private clearRiders(): void {
    for (const view of this.riderViews.values()) view.container.destroy();
    this.riderViews.clear();
  }

  /** Zhuge Liang's effect sheet (channel, energy ball, impact), when it loaded. */
  private beamFx(): FxSheet | null {
    const fx = SPRITE_CONFIGS.zhugeliang?.fx;
    return fx && this.textures.exists(fx.key) ? fx : null;
  }

  /** Zhuge Liang's channel: the bagua circle over his body for the whole cast, following him, then fading. */
  private beamChargeFx(idx: number): void {
    const fx = this.beamFx();
    if (!fx) return;
    const p = this.state.players[idx];
    const lift = (this.playerViews[idx].spriteCfg?.displayHeight ?? 0) / 2;
    const feet = worldToScreen(p.x, p.y, 0);
    const holdMs = (BEAM_CAST_TICKS / TICK_HZ) * 1000;
    this.playFx(fx, 'charge', {
      x: feet.sx,
      y: feet.sy - lift,
      w: BEAM_CHARGE_FX_SIZE,
      h: (BEAM_CHARGE_FX_SIZE * fx.frameHeight) / fx.frameWidth,
      depth: p.y + 0.5,
      holdMs,
      endMs: holdMs + BEAM_FADE_MS,
      follow: idx,
      offX: 0,
      offY: -lift,
      castOf: idx,
    });
  }

  /** A cut-short channel: its bagua circle stops at once and fades out from there. */
  private beamCancelFx(idx: number): void {
    const now = this.time.now;
    for (const f of this.fx) {
      if (f.castOf !== idx) continue;
      f.holdMs = now - f.startMs;
      f.endMs = f.holdMs + BEAM_FADE_MS;
    }
  }

  /** Beam impact burst at sim point (x, y) with height z. */
  private impactFx(x: number, y: number, z: number): void {
    const fx = this.beamFx();
    if (!fx) return;
    const pt = worldToScreen(x, y, z);
    this.playFx(fx, 'impact', {
      x: pt.sx,
      y: pt.sy,
      w: BEAM_IMPACT_FX_SIZE,
      h: (BEAM_IMPACT_FX_SIZE * fx.frameHeight) / fx.frameWidth,
      depth: y + 0.5,
    });
  }

  /** Zhao Yun's lunge: the dragon along the dash, following him for the lunge's length, and a burst where he starts. */
  private lungeFx(e: Extract<SimEvent, { type: 'lungeStart' }>): void {
    this.burstFx(e.playerIdx, e.x, e.y);
    const owner = this.fxOwner(e.playerIdx);
    if (!owner) return;
    // Screen direction of the dash: y is depth, so it is squashed like the field.
    const from = worldToScreen(e.x, e.y, 0);
    const to = worldToScreen(e.x + e.dirX * 100, e.y + e.dirY * 100, 0);
    const len = Math.hypot(to.sx - from.sx, to.sy - from.sy) || 1;
    const ux = (to.sx - from.sx) / len;
    const uy = (to.sy - from.sy) / len;
    // The art faces right. A leftward dash is mirrored, so its angle is taken from the reversed direction.
    const flip = e.dirX < 0;
    const angle = flip ? Math.atan2(-uy, -ux) : Math.atan2(uy, ux);
    const holdMs = (LUNGE_TICKS / TICK_HZ) * 1000;
    this.playFx(owner.fx, 'lunge', {
      x: from.sx + ux * LUNGE_FX_AHEAD,
      y: from.sy + uy * LUNGE_FX_AHEAD,
      w: LUNGE_FX_LEN,
      h: LUNGE_FX_H,
      depth: e.y + 0.5,
      flip,
      angle,
      holdMs,
      endMs: holdMs + LUNGE_FADE_MS,
      follow: e.playerIdx,
      offX: ux * LUNGE_FX_AHEAD,
      offY: uy * LUNGE_FX_AHEAD,
    });
  }

  /** An impact burst on the ground at (x, y) in sim space. */
  private burstFx(idx: number, x: number, y: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const pt = worldToScreen(x, y, 0);
    this.playFx(owner.fx, 'burst', { x: pt.sx, y: pt.sy, w: BURST_FX_SIZE, h: BURST_FX_SIZE, depth: y + 0.5 });
  }

  /** Guan Yu's rampage: the aura and fire dragon over him and the exhaust behind his rear wheel, following him until the rampage ends. */
  private rampageStartFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const dir = p.facingX < 0 ? -1 : 1;
    const forever = Number.POSITIVE_INFINITY;
    const lift = owner.cfg.displayHeight / 2;
    this.playFx(owner.fx, 'aura', {
      x: feet.sx,
      y: feet.sy - lift,
      w: RAMPAGE_AURA_FX_SIZE,
      h: (RAMPAGE_AURA_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y,
      follow: idx,
      offX: 0,
      offY: -lift,
      mirror: true,
      depthOff: -0.5,
      alpha: RAMPAGE_AURA_ALPHA,
      holdMs: forever,
      endMs: forever,
      rampageOf: idx,
    });
    this.playFx(owner.fx, 'dragon', {
      x: feet.sx,
      y: feet.sy - lift,
      w: DRAGON_FX_LEN,
      h: (DRAGON_FX_LEN * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.6,
      follow: idx,
      offX: 0,
      offY: -lift,
      mirror: true,
      depthOff: 0.6,
      holdMs: forever,
      endMs: forever,
      rampageOf: idx,
    });
    this.playFx(owner.fx, 'exhaust', {
      x: feet.sx - dir * RAMPAGE_EXHAUST_BACK,
      y: feet.sy - RAMPAGE_EXHAUST_LIFT,
      w: RAMPAGE_EXHAUST_FX_SIZE,
      h: (RAMPAGE_EXHAUST_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y,
      follow: idx,
      offX: -RAMPAGE_EXHAUST_BACK,
      offY: -RAMPAGE_EXHAUST_LIFT,
      mirror: true,
      depthOff: -0.5,
      holdMs: forever,
      endMs: forever,
      rampageOf: idx,
    });
  }

  /** The rampage ends: its aura and exhaust fade out from now. */
  private rampageEndFx(idx: number): void {
    const now = this.time.now;
    for (const f of this.fx) {
      if (f.rampageOf !== idx) continue;
      f.holdMs = now - f.startMs;
      f.endMs = f.holdMs + FX_FADE_MS;
    }
  }

  /** Simayi's crow flock in the air: trailing him behind his facing, lifted with his height, until the landing fades it. */
  private leapTrailFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const forever = Number.POSITIVE_INFINITY;
    const lift = owner.cfg.displayHeight / 2;
    this.playFx(owner.fx, 'crows', {
      x: feet.sx - LEAP_TRAIL_BACK,
      y: feet.sy - lift,
      w: LEAP_TRAIL_FX_W,
      h: (LEAP_TRAIL_FX_W * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y - 0.5,
      follow: idx,
      offX: -LEAP_TRAIL_BACK,
      offY: -LEAP_TRAIL_LIFT,
      mirror: true,
      depthOff: -0.5,
      lifted: true,
      holdMs: forever,
      endMs: forever,
      leapOf: idx,
    });
  }

  /** Simayi's landing: the green ring on the landing point, and a burst over each victim. */
  private leapLandFx(e: Extract<SimEvent, { type: 'leapLand' }>): void {
    const now = this.time.now;
    for (const f of this.fx) {
      if (f.leapOf !== e.playerIdx) continue;
      f.holdMs = now - f.startMs;
      f.endMs = f.holdMs + FX_FADE_MS;
    }
    this.groundFx(e.playerIdx, 'ring', e.x, e.y, LEAP_RING_FX_W);
    const owner = this.fxOwner(e.playerIdx);
    if (!owner) return;
    for (const idx of e.victimIdxs) {
      const v = this.state.players[idx];
      const pt = worldToScreen(v.x, v.y, HIT_FX_LIFT);
      this.playFx(owner.fx, 'burst', {
        x: pt.sx,
        y: pt.sy,
        w: LEAP_VICTIM_FX_SIZE,
        h: (LEAP_VICTIM_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
        depth: v.y + 0.5,
      });
    }
  }

  /** Zhang Liao's fear cast: the ghost burst over him, not following him. */
  private fearCastFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    this.playFx(owner.fx, 'ghost', {
      x: feet.sx,
      y: feet.sy - owner.cfg.displayHeight / 2,
      w: FEAR_GHOST_FX_SIZE,
      h: (FEAR_GHOST_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.5,
    });
  }

  /**
   * Each feared player gets the chains ring under his feet (behind him) and the '!' icon over his head, both following him
   * for the whole fear. When the fear ends (timer or knock-down) they fade, and the chains shatter once at his feet.
   */
  private updateFearFx(): void {
    for (const p of this.state.players) {
      const feared = p.action === 'fear';
      const shown = this.fearShown.has(p.idx);
      if (feared && !shown) this.fearStartFx(p.idx);
      else if (!feared && shown) this.fearEndFx(p.idx);
    }
  }

  /** The chains and the '!' icon on a feared player, drawn with Zhang Liao's sheet. Nothing when he has no caster or no sheet. */
  private fearStartFx(idx: number): void {
    const caster = this.fearCaster.get(idx);
    const owner = caster === undefined ? null : this.fxOwner(caster);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const forever = Number.POSITIVE_INFINITY;
    const top = this.playerViews[idx].spriteCfg?.displayHeight ?? 40;
    const iconOffY = -(top + FEAR_ICON_GAP + FEAR_ICON_FX_SIZE / 2);
    this.playFx(owner.fx, 'chains', {
      x: feet.sx,
      y: feet.sy,
      w: FEAR_CHAIN_FX_SIZE,
      h: (FEAR_CHAIN_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y - 0.5,
      follow: idx,
      depthOff: -0.5,
      holdMs: forever,
      endMs: forever,
      fearOf: idx,
    });
    this.playFx(owner.fx, 'alarm', {
      x: feet.sx,
      y: feet.sy + iconOffY,
      w: FEAR_ICON_FX_SIZE,
      h: (FEAR_ICON_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.6,
      follow: idx,
      offY: iconOffY,
      depthOff: 0.6,
      holdMs: forever,
      endMs: forever,
      fearOf: idx,
    });
    this.fearShown.add(idx);
  }

  /** A feared player's fear ends: his chains and icon fade from now, and the chains shatter once at his feet. */
  private fearEndFx(idx: number): void {
    const now = this.time.now;
    for (const f of this.fx) {
      if (f.fearOf !== idx) continue;
      f.holdMs = now - f.startMs;
      f.endMs = f.holdMs + FX_FADE_MS;
    }
    this.fearShown.delete(idx);
    const caster = this.fearCaster.get(idx);
    this.fearCaster.delete(idx);
    if (caster === undefined) return;
    const p = this.state.players[idx];
    this.groundFx(caster, 'shatter', p.x, p.y, FEAR_CHAIN_FX_SIZE);
  }

  /** True while a rampage's own aura effect plays for this player (it replaces the drawn ring). */
  private rampageFxOn(p: Player): boolean {
    return p.rampageTicks > 0 && this.fxOwner(p.idx)?.fx.anims.aura !== undefined;
  }

  /** Zhang Fei's roar: the charge at his feet, then the soundwave in front of him once the charge has played. */
  private roarFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const dir = p.facingX < 0 ? -1 : 1;
    this.playFx(owner.fx, 'charge', {
      x: feet.sx,
      y: feet.sy,
      w: ROAR_CHARGE_FX_SIZE,
      h: (ROAR_CHARGE_FX_SIZE * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.5,
      endMs: ROAR_CHARGE_MS + FX_FADE_MS,
    });
    const waveH = (ROAR_WAVE_FX_W * owner.fx.frameHeight) / owner.fx.frameWidth;
    this.time.delayedCall(ROAR_CHARGE_MS, () => {
      this.playFx(owner.fx, 'wave', {
        x: feet.sx + dir * (ROAR_WAVE_AHEAD + ROAR_WAVE_FX_W / 2),
        y: feet.sy - owner.cfg.displayHeight / 2,
        w: ROAR_WAVE_FX_W,
        h: waveH,
        depth: p.y + 0.5,
        flip: dir < 0,
      });
    });
  }

  /** Xu Chu's guard: the fire ring that runs round him until a swallow, a roar or the end fades it. */
  private tigerRingFx(idx: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    this.fadeTigerRing(idx);
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const lift = owner.cfg.displayHeight * 0.5;
    const ring = this.playFx(owner.fx, 'fireRing', {
      x: feet.sx,
      y: feet.sy - lift,
      w: TIGER_RING_FX_W,
      h: (TIGER_RING_FX_W * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y - 0.5,
      holdMs: Number.POSITIVE_INFINITY,
      follow: idx,
      offY: -lift,
      depthOff: -0.5,
    });
    if (ring) this.tigerRing.set(idx, ring);
  }

  /** Xu Chu's tiger head in front of his feet, following him and mirrored to his facing (`ahead` px in front, TIGER_HEAD_LIFT high). */
  private tigerHeadFx(owner: { cfg: SpriteConfig; fx: FxSheet }, idx: number, name: FxAnim, ahead: number, timing: Partial<FxSpawn>): FxInstance | null {
    const p = this.state.players[idx];
    const feet = worldToScreen(p.x, p.y, 0);
    const dir = p.facingX < 0 ? -1 : 1;
    const lift = owner.cfg.displayHeight * TIGER_HEAD_LIFT;
    return this.playFx(owner.fx, name, {
      x: feet.sx + dir * ahead,
      y: feet.sy - lift,
      w: TIGER_HEAD_FX_W,
      h: (TIGER_HEAD_FX_W * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: p.y + 0.5,
      follow: idx,
      offX: ahead,
      offY: -lift,
      mirror: true,
      ...timing,
    });
  }

  /** The swallow: the ring fades, and the maw opens over him and stays until the spit (or the end). */
  private tigerSwallowFx(idx: number): void {
    this.fadeTigerRing(idx);
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const maw = this.tigerHeadFx(owner, idx, 'maw', TIGER_HEAD_AHEAD, { holdMs: Number.POSITIVE_INFINITY });
    if (maw) this.tigerMaw.set(idx, maw);
  }

  /** The spit: the maw closes into a fire beam in front of him, and the spat ball gets its trail. */
  private tigerSpitFx(idx: number): void {
    this.fadeTigerMaw(idx);
    const owner = this.fxOwner(idx);
    if (!owner) return;
    this.tigerHeadFx(owner, idx, 'roar', TIGER_HEAD_AHEAD, { holdMs: TIGER_ROAR_FX_MS, endMs: TIGER_ROAR_FX_MS + FX_FADE_MS });
    const trail = this.playFx(owner.fx, 'trail', {
      x: 0,
      y: 0,
      w: TIGER_TRAIL_FX_W,
      h: (TIGER_TRAIL_FX_W * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: 0,
      holdMs: Number.POSITIVE_INFINITY,
    });
    this.tigerTrail = trail;
  }

  /** The forward roar when the guard runs out: the fire beam in front of him, and the ring fades. */
  private tigerRoarFx(idx: number): void {
    this.fadeTigerRing(idx);
    const owner = this.fxOwner(idx);
    if (!owner) return;
    this.tigerHeadFx(owner, idx, 'roar', TIGER_ROAR_AHEAD, { holdMs: TIGER_ROAR_FX_MS, endMs: TIGER_ROAR_FX_MS + FX_FADE_MS });
  }

  private fadeTigerRing(idx: number): void {
    const ring = this.tigerRing.get(idx);
    if (!ring) return;
    this.fadeFx(ring);
    this.tigerRing.delete(idx);
  }

  private fadeTigerMaw(idx: number): void {
    const maw = this.tigerMaw.get(idx);
    if (!maw) return;
    this.fadeFx(maw);
    this.tigerMaw.delete(idx);
  }

  /** Starts the fade of an effect that was playing with no end (its holdMs was open-ended). */
  private fadeFx(f: FxInstance): void {
    f.holdMs = this.time.now - f.startMs;
    f.endMs = f.holdMs + FX_FADE_MS;
  }

  /**
   * The spat ball's flaming trail: on the ball while it flies, turned to its screen velocity (mirrored when flying left),
   * and faded at its first landing.
   */
  private updateTigerTrail(): void {
    const trail = this.tigerTrail;
    if (!trail) return;
    const ball = this.state.ball;
    if (ball.tiger?.phase !== 'flight') {
      this.fadeFx(trail);
      this.tigerTrail = null;
      return;
    }
    const pt = worldToScreen(ball.x, ball.y, ball.z);
    // Screen velocity: x as is, y squashed like the field, and a rise in z goes up the screen.
    const vx = ball.vx;
    const vy = ball.vy * DEPTH_SCALE - ball.vz;
    // The art faces right. A leftward flight is mirrored, so its angle is taken from the reversed direction.
    const flip = vx < 0;
    const angle = flip ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx);
    trail.sprite.setPosition(pt.sx, pt.sy - BALL_LIFT).setFlipX(flip).setRotation(angle).setDepth(ball.y + 0.4);
  }

  /** A special's hit: Zhang Fei's roar gives a spark on the victim, Guan Yu's rampage bump an impact burst. */
  private specialHitFx(e: Extract<SimEvent, { type: 'hit' }>): void {
    if (e.kind !== 'special') return;
    const attacker = this.state.players[e.attackerIdx];
    const victim = this.state.players[e.victimIdx];
    if (attacker.specialMode === 'roar') {
      this.ownerImpact(attacker.idx, victim.x, victim.y, HIT_FX_LIFT, SPARK_FX_SIZE);
    } else if (attacker.rampageTicks > 0 || attacker.specialMode === 'tiger') {
      this.ownerImpact(attacker.idx, victim.x, victim.y, HIT_FX_LIFT, IMPACT_FX_SIZE);
    }
  }

  /** One of an owner's impact bursts in the air at sim point (x, y, z), `size` px wide. */
  private ownerImpact(idx: number, x: number, y: number, z: number, size: number): void {
    const owner = this.fxOwner(idx);
    if (!owner) return;
    const pt = worldToScreen(x, y, z);
    this.playFx(owner.fx, 'impact', {
      x: pt.sx,
      y: pt.sy,
      w: size,
      h: (size * owner.fx.frameHeight) / owner.fx.frameWidth,
      depth: y + 0.5,
    });
  }

  /** Keeps the attached effects on their player and removes each effect once its end time has passed. */
  private drawFx(): void {
    const now = this.time.now;
    this.fx = this.fx.filter((f) => {
      const t = now - f.startMs;
      if (t >= f.endMs) {
        f.sprite.destroy();
        return false;
      }
      f.sprite.setAlpha((t < f.holdMs ? 1 : 1 - (t - f.holdMs) / (f.endMs - f.holdMs)) * f.alpha);
      if (f.follow !== null) {
        const p = this.state.players[f.follow];
        const feet = worldToScreen(p.x, p.y, 0);
        const dir = f.mirror && p.facingX < 0 ? -1 : 1;
        const lift = f.lifted ? p.z : 0;
        f.sprite.setPosition(feet.sx + f.offX * dir, feet.sy + f.offY - lift).setDepth(p.y + f.depthOff);
        if (f.mirror) f.sprite.setFlipX(p.facingX < 0);
      }
      return true;
    });
  }

  /** Field overview in the top-left: players, ball, goals and the camera's x range. Hidden during the shootout. */
  private drawMinimap(): void {
    const visible = this.state.match.pk === null && this.preview === null;
    this.minimapGfx.setVisible(visible);
    if (!visible) return;
    this.minimapFrames++;

    const g = this.minimapGfx.clear();
    const { W, H } = this.view;
    const s = minimapScale(W);
    const w = FIELD_W * s;
    const h = FIELD_D * s;
    const ox = (W - w) / 2;
    const oy = H - MINIMAP_BOTTOM - h;
    const mx = (x: number) => ox + x * s;
    const my = (y: number) => oy + y * s;
    const { players, ball } = this.state;

    g.fillStyle(0x0b3d1e, 0.6);
    g.fillRect(ox, oy, w, h);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(ox, oy, w, h);
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
    const x0 = Math.max(ox, mx(cam.scrollX));
    const x1 = Math.min(ox + w, mx(cam.scrollX + W));
    if (x1 > x0) {
      g.lineStyle(1, 0xffffff, 1);
      g.strokeRect(x0, oy, x1 - x0, h);
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
    const show = this.state.match.phase === 'play' && this.state.match.pk === null && outside && this.preview === null;
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
      const tag = this.add
        .text(0, 0, '', { ...style, fontSize: '11px', color: hexCss(GOLD) })
        .setOrigin(0.5, 1)
        .setVisible(false);
      const silence = this.add
        .text(0, 0, '沉默', { ...style, fontSize: '11px', color: SILENCE_COLOR })
        .setOrigin(0.5, 1)
        .setVisible(false);
      const parts = sprite ? [gfx, sprite, label, tag, silence] : [gfx, label, tag, silence];
      const container = this.add.container(0, 0, parts);
      return { container, gfx, label, sprite, spriteCfg, tag, silence };
    });
    // The special hint lives in the human's container, so it follows the figure above the name.
    this.hintText = this.add
      .text(0, 0, '', { ...style, fontSize: '11px', color: HINT_COLOR, strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.playerViews[this.humanIdx].container.add(this.hintText);
  }

  /** Sprite config for a character whose sheet loaded. Null means the block figure is drawn. */
  private spriteConfigFor(charId: string): SpriteConfig | null {
    const cfg = SPRITE_CONFIGS[charId];
    return cfg && this.textures.exists(cfg.key) ? cfg : null;
  }

  /**
   * Which sprite animation a player shows: a special pose in progress first, then the sim action, then the rampage
   * loop, then charging, then speed (run above RUN_SPEED, otherwise idle).
   */
  private spriteAnimFor(p: Player): SpriteAnim {
    if (this.poseUntil[p.idx] > this.time.now) return this.poseAnim[p.idx];
    switch (p.action) {
      case 'punch':
      case 'tackle':
        return 'attack';
      case 'fear':
        return 'hitstun';
      case 'hitstun':
      case 'down':
      case 'dive':
      case 'recover':
      case 'lunge':
      case 'cast':
        return p.action;
      case 'leap':
        // The back-hop shows the crouch, then the flight shows the dash pose.
        return p.actionTimer > LEAP_FLY_TICKS ? 'special' : 'lunge';
      case 'charge':
        return 'charge';
      default:
        break;
    }
    if (p.rampageTicks > 0) return 'rampage';
    if (p.chargeTicks > 0) return 'charge';
    return Math.abs(p.vx) > RUN_SPEED ? 'run' : 'idle';
  }

  /** Plays a special pose on this player's sprite and holds it for `ms`. */
  private playPose(idx: number, anim: 'special' | 'shot' | 'land' | 'cast', ms: number): void {
    this.poseUntil[idx] = this.time.now + ms;
    this.poseAnim[idx] = anim;
    const view = this.playerViews[idx];
    if (view?.sprite && view.spriteCfg) view.sprite.play(spriteAnimKey(view.spriteCfg, anim));
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

    // Shadow on the ground (sprites set their own width, e.g. wider under the bike).
    const shadowScale = view.sprite !== null && view.spriteCfg !== null ? view.spriteCfg.shadowScale : 1;
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 0, r * 2.4 * shadowScale, r * 1.2);

    // Charge ring.
    if (p.chargeTicks > 0) {
      const ratio = Math.min(1, p.chargeTicks / CHARGE_FULL);
      const pulse = 0.5 + 0.5 * Math.sin(time / 80);
      const R = r * 1.4 + ratio * r * 1.2;
      g.lineStyle(2, ratio >= 1 ? GOLD : 0xffffff, 0.4 + 0.6 * pulse);
      g.strokeEllipse(0, 0, R * 2, R * 2 * DEPTH_SCALE);
    }

    // Invincible aura (rampage or lunge): a pulsing gold ring over an orange glow, under the sprite. A rampage that has its own aura effect skips it.
    if (isInvincible(p) && !this.rampageFxOn(p)) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 90);
      const R = r * 2.7 + r * 0.45 * pulse;
      g.fillStyle(0xff8c1a, 0.22 + 0.14 * pulse);
      g.fillEllipse(0, 0, R * 2.3, R * 2.3 * DEPTH_SCALE);
      g.lineStyle(3, GOLD, 0.6 + 0.4 * pulse);
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
    const invincible = p.idx === this.humanIdx && isInvincible(p);
    view.tag.setVisible(invincible);
    if (invincible) {
      const ticks = p.action === 'lunge' || p.action === 'leap' ? p.actionTimer : p.rampageTicks;
      view.tag.setPosition(0, labelY - 20).setText(`無敵 ${(ticks / TICK_HZ).toFixed(1)}`);
    }
    const silenced = p.silenceTicks > 0;
    view.silence.setVisible(silenced);
    if (silenced) view.silence.setPosition(0, labelY - 22);
    if (p.idx === this.humanIdx) {
      const tipY = labelY - 13;
      g.fillStyle(HUMAN_MARK, 1);
      g.fillTriangle(0, tipY, -3, tipY - 5, 3, tipY - 5);
      this.placeSpecialHint(labelY);
    }
  }

  /** Shows a why-not hint for HINT_MS, rising and fading above the human's name (container space). */
  private showHint(text: string): void {
    this.lastHintText = text;
    this.hintText.setText(text).setVisible(true);
    this.hintUntil = this.time.now + HINT_MS;
  }

  private placeSpecialHint(labelY: number): void {
    const left = this.hintUntil - this.time.now;
    if (left <= 0) {
      this.hintText.setVisible(false);
      return;
    }
    const t = 1 - left / HINT_MS;
    this.hintText.setPosition(0, labelY - 40 - HINT_RISE * t).setAlpha(1 - t);
  }

  private drawBall(): void {
    const ball = this.state.ball;
    const shadow = worldToScreen(ball.x, ball.y, 0);
    const scale = Math.min(1, Math.max(0.35, 1 - ball.z / 140));
    this.ballShadowGfx.clear().setDepth(ball.y);
    this.ballShadowGfx.fillStyle(0x000000, 0.35 * scale);
    this.ballShadowGfx.fillEllipse(shadow.sx, shadow.sy, 18 * scale, 6.5 * scale);

    this.trailGfx.clear().setDepth(ball.y);
    const kind = ball.special?.kind;
    // A beam's flight is drawn by its energy ball instead of the trail.
    if (kind && kind !== 'beam' && this.trail.length > 0) {
      const color = SPECIAL_COLORS[kind];
      this.trail.forEach((pt, i) => {
        const ratio = (i + 1) / this.trail.length;
        const pos = worldToScreen(pt.x, pt.y, pt.z);
        this.trailGfx.fillStyle(color, 0.15 + 0.5 * ratio);
        this.trailGfx.fillCircle(pos.sx, pos.sy - BALL_LIFT, (BALL_DISPLAY_D / 2) * (0.4 + 0.6 * ratio));
      });
    }

    const pos = worldToScreen(ball.x, ball.y, ball.z);
    this.spinBall(ball.x, ball.y);
    // A held shot sits in the tiger's mouth, just behind the maw's effect (which is in front of his body).
    const held = ball.tiger?.phase === 'hold';
    this.ballSprite.setPosition(pos.sx, pos.sy - BALL_LIFT).setFrame(this.ballSpinFrame).setDepth(ball.y + (held ? 0.4 : 0.5));
  }

  /** Advances the ball's rotation frame by the ground distance it rolled since the last draw. Reversed when moving left. */
  private spinBall(x: number, y: number): void {
    const dx = x - this.ballSpinX;
    const dy = y - this.ballSpinY;
    this.ballSpinX = x;
    this.ballSpinY = y;
    const step = Math.hypot(dx, dy);
    if (step > BALL_SPIN_MAX_STEP || step === 0) return;
    if (dx !== 0) this.ballSpinSign = Math.sign(dx);
    this.ballSpinAcc += step;
    const frames = Math.floor(this.ballSpinAcc / BALL_SPIN_PX);
    if (frames === 0) return;
    this.ballSpinAcc -= frames * BALL_SPIN_PX;
    this.ballSpinFrame = (((this.ballSpinFrame + this.ballSpinSign * frames) % BALL_SPIN_FRAMES) + BALL_SPIN_FRAMES) % BALL_SPIN_FRAMES;
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

    this.hudNameText = this.add
      .text(0, 0, '', style('#ffffff', '12px'))
      .setScrollFactor(0)
      .setDepth(hudDepth + 1);
    this.hudStaminaGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth + 1);

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

    this.topBarGfx.clear().fillStyle(0x000000, 0.25).fillRect(0, 0, W, 34);
    this.homeText.setPosition(W / 2 - 8, 17);
    this.dashText.setPosition(W / 2, 17);
    this.awayText.setPosition(W / 2 + 8, 17);
    this.clockText.setPosition(W - 10, 17);

    this.hudNameText.setPosition(STAMINA_BAR_X, 3);
    this.bannerText.setPosition(W / 2, H / 2 - 30);
    this.specialText.setPosition(W / 2, H / 2 + 20);
    this.pkMeterLabel.setPosition(W - PK_METER_RIGHT - 6, H - PK_METER_BOTTOM + PK_METER_H / 2);
    this.pkLineText.setPosition(W / 2, H - 40);
    this.pkHintText.setPosition(W / 2, H - 2);

    const left = orderLeft(W);
    const o = orderLayout(H);
    this.pkOrderTitle.setPosition(W / 2, o.titleY);
    this.pkOrderHint.setPosition(W / 2, o.hintY);
    this.pkOrderCount.setPosition(W / 2, o.countY);
    this.pkOrderUndo.setPosition(left + ORDER_UNDO_X + ORDER_UNDO_W / 2, o.undoY + o.undoH / 2);
    this.pkOrderRows.forEach((row, i) => {
      const y = o.rowY0 + i * o.rowH;
      row.slot.setPosition(left + ORDER_ROW_X + 20, y);
      row.role.setPosition(left + ORDER_ROW_X + 54, y);
      row.name.setPosition(left + ORDER_ROW_X + 80, y);
      row.stats.setPosition(left + ORDER_ROW_X + 332, y);
    });
    if (this.pkOrderOpen) this.refreshPkOrder();
    if (this.preview) this.layoutPreviewHud(v);
  }

  /** Preview HUD: the banner at top-left, and 返回 at top-right. The match HUD and touch controls are hidden. */
  private createPreviewHud(): void {
    const hudDepth = 1000;
    const hide = (o: Phaser.GameObjects.Components.Visible) => o.setVisible(false);
    this.touch.setVisible(false);
    [this.topBarGfx, this.homeText, this.dashText, this.awayText, this.clockText, this.hudNameText].forEach(hide);
    const style = (size: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: FONT,
      fontSize: size,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: textResolution(),
    });
    const human = this.state.players[this.humanIdx];
    this.previewGfx = this.add.graphics().setScrollFactor(0).setDepth(hudDepth + 2);
    this.previewText = this.add
      .text(0, 0, `技能預覽：${human.name}・${human.specialName}`, style('14px'))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(hudDepth + 2);
    this.previewBackText = this.add
      .text(0, 0, '返回', style('13px'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(hudDepth + 3);
    this.input.on('pointerdown', this.onPreviewPointer);
    this.layoutPreviewHud(this.view);
  }

  private layoutPreviewHud(v: View): void {
    const back = previewBackRect(v.W);
    this.previewGfx
      .clear()
      .fillStyle(0x000000, 0.55)
      .fillRect(back.x, back.y, back.w, back.h)
      .lineStyle(2, GOLD, 1)
      .strokeRect(back.x, back.y, back.w, back.h);
    this.previewText.setPosition(v.W / 2, 8);
    this.previewBackText.setPosition(back.x + back.w / 2, back.y + back.h / 2);
  }

  /** Tap on 返回 (logical units) ends the preview at any time. Other taps do nothing. */
  private onPreviewPointer = (pointer: Phaser.Input.Pointer): void => {
    const x = pointer.x / this.view.Z;
    const y = pointer.y / this.view.Z;
    if (hitRect(x, y, previewBackRect(this.view.W))) this.endPreview();
  };

  /** Re-applies the current text resolution to every text object (HUD, touch labels, player names). */
  private refreshTextResolution(): void {
    const res = textResolution();
    this.children.list.forEach((o) => {
      if (o instanceof Phaser.GameObjects.Text) o.setResolution(res);
    });
    this.playerViews.forEach((v) => {
      v.label.setResolution(res);
      v.tag.setResolution(res);
    });
    // layoutHud can run before createPlayerViews (applyView in create), so the hint may not exist yet.
    if (this.hintText) this.hintText.setResolution(res);
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
    this.pkLineText = add(0, 0, '', '#ffffff', '14px').setOrigin(0.5, 1);
    this.pkHintText = add(0, 0, '', '#ffd98a', '11px').setOrigin(0.5, 1);
    this.pkMeterLabel = add(0, 0, '#ffffff', '12px', '力量')
      .setOrigin(1, 0.5);
    this.pkObjs = [
      this.pkHudGfx,
      this.pkAimGfx,
      this.pkScoreText,
      this.pkHomeText,
      this.pkAwayText,
      this.pkLineText,
      this.pkHintText,
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
    const o = orderLayout(this.view.H);
    const undoX = left + ORDER_UNDO_X;
    if (x >= undoX && x < undoX + ORDER_UNDO_W && y >= o.undoY && y < o.undoY + o.undoH) {
      this.pkOrderTap = 'undo';
      return;
    }
    const rowX = left + ORDER_ROW_X;
    for (let i = 0; i < this.pkOrderRows.length; i++) {
      const top = o.rowY0 + i * o.rowH - o.rowBoxH / 2;
      if (x >= rowX && x < rowX + ORDER_ROW_W && y >= top && y < top + o.rowBoxH) {
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
    this.touch.setPk(pk !== null);
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
    if (this.preview) return;
    const { match, players } = this.state;
    const secs = Math.ceil(match.clockTicks / TICK_HZ);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.clockText.setText(`${match.half === 1 ? '上半場' : '下半場'} ${mm}:${ss}`);

    const p = players[this.humanIdx];
    const block =
      silenceBlockReason(p) ?? positionBlockReason(this.state, p) ?? (p.stamina < SPECIAL_STAMINA_COST ? '體力不足' : null);
    this.touch.setSpecialStatus({ cooldownTicks: p.specialCooldown, cooldownTotal: SPECIAL_COOLDOWN_TICKS, block });
    this.hudNameText.setText(p.name).setVisible(true);

    // Stamina bar: green, yellow below half, red below the special cost; a white tick marks the special cost.
    const staminaRatio = Math.max(0, Math.min(1, p.stamina / p.maxStamina));
    const costRatio = SPECIAL_STAMINA_COST / p.maxStamina;
    const fill = staminaRatio < costRatio ? 0xff3b3b : staminaRatio < STAMINA_LOW_RATIO ? 0xf2c94c : 0x6cd46c;
    const g = this.hudStaminaGfx.clear();
    g.fillStyle(0x333333, 1);
    g.fillRect(STAMINA_BAR_X, STAMINA_BAR_Y, STAMINA_BAR_W, STAMINA_BAR_H);
    g.fillStyle(fill, 1);
    g.fillRect(STAMINA_BAR_X, STAMINA_BAR_Y, STAMINA_BAR_W * staminaRatio, STAMINA_BAR_H);
    g.fillStyle(0xffffff, 1);
    g.fillRect(STAMINA_BAR_X + STAMINA_BAR_W * costRatio - 0.5, STAMINA_BAR_Y - 2, 1, STAMINA_BAR_H + 4);
  }

  /** Shootout HUD: title, PK score, per-team kick markers, shooter/keeper line, aim helpers and power meter. */
  private drawPkHud(pk: PkState): void {
    const { players } = this.state;
    const { W, H } = this.view;
    const aimRight = this.touch.isShown() ? PK_AIM_RIGHT_TOUCH : PK_AIM_RIGHT;
    const sudden = pk.kicks[0].length >= PK_ROUNDS && pk.kicks[1].length >= PK_ROUNDS;
    this.clockText.setText(sudden ? 'PK 大戰　驟死' : 'PK 大戰');
    this.pkScoreText.setText(`PK ${pk.score[0]} - ${pk.score[1]}`);
    this.hudStaminaGfx.clear();
    this.hudNameText.setVisible(false);

    const g = this.pkHudGfx.clear();
    g.fillStyle(0x000000, 0.55);
    g.fillRect(PK_PANEL_X, PK_PANEL_Y, PK_PANEL_W, PK_PANEL_H);
    this.drawPkMarks(g, pk, 0, 64);
    this.drawPkMarks(g, pk, 1, 85);

    const live = pk.stage === 'aim' || pk.stage === 'flight' || pk.stage === 'result';
    const shooter = live ? players[pk.shooterIdx] : undefined;
    const keeper = live ? players[pk.keeperIdx] : undefined;
    this.pkLineText.setText(shooter && keeper ? `射門：${shooter.name}　守門：${keeper.name}` : '');

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
    this.pkHintText.setText(hint);

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
      aim.fillRect((W - aimRight) - 6, PK_AIM_Y - 6, boxW + 12, boxH + 12);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const on = col === selCol && (row === 0) === selHigh;
          aim.fillStyle(on ? highlight : 0x2b333d, 1);
          aim.fillRect(
            (W - aimRight) + col * (PK_CELL_W + PK_CELL_GAP),
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
    const o = orderLayout(this.view.H);
    const g = this.pkOrderGfx.clear();
    g.fillStyle(0x000000, 0.8);
    g.fillRect(left, o.boxY, ORDER_BOX_W, o.boxH);
    roster.forEach((idx, i) => {
      const p = this.state.players[idx];
      const pos = this.pkOrderPicks.indexOf(idx);
      g.fillStyle(i === this.pkOrderCursor ? 0x3a5a7a : 0x1d2630, 1);
      g.fillRect(left + ORDER_ROW_X, o.rowY0 + i * o.rowH - o.rowBoxH / 2, ORDER_ROW_W, o.rowBoxH);
      const row = this.pkOrderRows[i];
      row.slot.setText(pos >= 0 ? String(pos + 1) : '-');
      row.role.setText(p.role);
      row.name.setText(p.name);
      row.stats.setText(`力量 ${p.stats.power}　技巧 ${p.stats.technique}`);
    });
    g.fillStyle(0x3a5a7a, 1);
    g.fillRect(left + ORDER_UNDO_X, o.undoY, ORDER_UNDO_W, o.undoH);
    this.pkOrderCount.setText(`已選 ${this.pkOrderPicks.length} / ${PK_ROUNDS}`);
  }

  private setPkOrderVisible(visible: boolean): void {
    this.pkOrderObjs.forEach((o) => o.setVisible(visible));
  }
}
