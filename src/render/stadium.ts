import Phaser from 'phaser';
import { FIELD_D, FIELD_W, GK_AREA_DEPTH, GOAL_DEPTH, GOAL_H, GOAL_HALF_W } from '../sim/constants';
import { DEPTH_SCALE, FIELD_TOP, worldToScreen } from './projection';
import { BALL_SHEET, GOAL_POST_META, SOLDIER_SHEET, STADIUM_KEYS } from './sprites';

/** Tiled strips are this wide and start this far left: they cover any view plus the backdrop's parallax drift. */
const STRIP_X = -800;
const STRIP_W = 3000;
const STRIP_H = 1000;

/** Grass starts just above the far touchline; the backdrop's bottom edge sits on it. */
const GRASS_TOP = FIELD_TOP - 6;
const GRASS_TILE_SCALE = 0.55;

/** Backdrop: the 1024×240 art at half size. It drifts at BG_PARALLAX of the camera's speed. */
const BG_TILE_SCALE = 0.5;
const BG_H = 240 * BG_TILE_SCALE;
const BG_TOP = GRASS_TOP - BG_H;
const BG_PARALLAX = 0.5;
const SKY_COLOR = 0xc8643a;

/**
 * Foreground barricades (opaque grass top edge). Their top sits just over the near crowd's feet, so the crowd shows
 * above them, and the strip runs down past the bottom of the view.
 */
const FG_H = 52;
const FG_TILE_SCALE = FG_H / 138;

const LINE_COLOR = 0xffffff;
const LINE_ALPHA = 0.85;

/** Goal: the posts reach 1.3× the crossbar height (the dragon head sits above it); the far post is 0.9× the near one. */
const POST_H = GOAL_H * 1.3;
const FAR_POST_SCALE = 0.9;
const NET_COLOR = 0xd9c39a;
const NET_ALPHA = 0.85;
const NET_CELL = 6;
const NET_DEPTH = -5;
const BAR_RED = 0xb3262a;
const BAR_GOLD = 0xe8b84a;
const BAR_OUTLINE = 0x3a0d0d;
const BACK_WOOD = 0x7a2a1e;

/** Crowd: spacing along the touchlines, and how far past each end of the field it runs. */
const CROWD_X0 = -80;
const CROWD_X1 = FIELD_W + 80;
const CROWD_SPACING = 22;
const SOLDIER_COLS = SOLDIER_SHEET.meta.cols;
const FAR_BACK_FEET_Y = FIELD_TOP - 7;
const FAR_FRONT_FEET_Y = FIELD_TOP - 2;
const FAR_BACK_H = 30;
const FAR_FRONT_H = 34;
const NEAR_H = 40;
const NEAR_FEET_Y = worldToScreen(0, FIELD_D + 12, 0).sy;
const FG_TOP = NEAR_FEET_Y - 8;
const FAR_BACK_TINT = 0xb4b4c0;
const FAR_DEPTH = -35;
const NEAR_DEPTH = -10;
const FG_DEPTH = -8;
const LINES_DEPTH = -38;
const GRASS_DEPTH = -40;
const BG_DEPTH = -58;
const SKY_DEPTH = -60;
/** Soldiers hop and run twice as fast for this long after a goal. */
const CHEER_MS = 3000;
const CHEER_SPEED = 2;
const HOP_PX = 4;
const HOP_RAD_PER_MS = (Math.PI * 2 * 2.2) / 1000;
const ANIM_FPS_MIN = 5;
const ANIM_FPS_SPAN = 3;

interface Soldier {
  sprite: Phaser.GameObjects.Sprite;
  row: number;
  fps: number;
  /** Start offset in frames, so the crowd is not in step. */
  phase: number;
  feetY: number;
  /** Hop offset in radians, per soldier. */
  hopPhase: number;
}

/** Deterministic value in [0, 1) for a soldier index, so the crowd varies but repeats exactly. */
function unit(i: number, salt: number): number {
  return (((i + 1) * salt) % 9973) / 9973;
}

/**
 * The stadium around the match: sky, tiled backdrop with parallax, tiled grass, field lines, the two goals, a
 * cheering crowd on both touchlines and the foreground barricades. Everything is a plain image or a sprite.
 */
export class Stadium {
  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.TileSprite;
  private readonly fg: Phaser.GameObjects.TileSprite;
  private readonly soldiers: Soldier[] = [];
  private lastNow: number;
  /** Animation clock in ms. Cheering runs it faster; soldiers pick their frame from it. */
  private animMs = 0;
  private cheerUntil = 0;

  constructor(scene: Phaser.Scene, withSoldiers: boolean) {
    this.scene = scene;
    this.lastNow = scene.time.now;

    scene.add.graphics().fillStyle(SKY_COLOR, 1).fillRect(STRIP_X, -1000, STRIP_W, BG_TOP + 1000).setDepth(SKY_DEPTH);
    this.bg = scene.add
      .tileSprite(STRIP_X, BG_TOP, STRIP_W, BG_H, STADIUM_KEYS.bg)
      .setOrigin(0, 0)
      .setTileScale(BG_TILE_SCALE, BG_TILE_SCALE)
      .setDepth(BG_DEPTH);
    scene.add
      .tileSprite(STRIP_X, GRASS_TOP, STRIP_W, STRIP_H, STADIUM_KEYS.grass)
      .setOrigin(0, 0)
      .setTileScale(GRASS_TILE_SCALE, GRASS_TILE_SCALE)
      .setDepth(GRASS_DEPTH);
    this.fg = scene.add
      .tileSprite(STRIP_X, FG_TOP, STRIP_W, FG_H, STADIUM_KEYS.fg)
      .setOrigin(0, 0)
      .setTileScale(FG_TILE_SCALE, FG_TILE_SCALE)
      .setDepth(FG_DEPTH);

    this.drawLines();
    this.drawGoal(0, 0);
    this.drawGoal(FIELD_W, 1);
    if (withSoldiers) this.buildCrowd();
  }

  /** Per-frame update: backdrop parallax, foreground at the bottom of the view, and the crowd's frames and hops. */
  update(now: number, camX: number, scrollY: number, H: number): void {
    const dt = Math.min(now - this.lastNow, 100);
    this.lastNow = now;
    const cheering = now < this.cheerUntil;
    this.animMs += cheering ? dt * CHEER_SPEED : dt;

    this.bg.x = STRIP_X + BG_PARALLAX * camX;
    // Taller views (wider windows than 16:9 show more field) need the strip to reach the bottom of the view.
    const fgH = Math.max(FG_H, scrollY + H - FG_TOP);
    if (fgH !== this.fg.height) this.fg.setSize(STRIP_W, fgH);

    for (const s of this.soldiers) {
      const frame = Math.floor((this.animMs / 1000) * s.fps + s.phase) % SOLDIER_COLS;
      const hop = cheering ? HOP_PX * Math.abs(Math.sin(this.animMs * HOP_RAD_PER_MS + s.hopPhase)) : 0;
      s.sprite.setFrame(s.row * SOLDIER_COLS + frame).setY(s.feetY - hop);
    }
  }

  /** A goal was scored: the crowd cheers, running and hopping faster for a few seconds. */
  cheer(now: number): void {
    this.cheerUntil = now + CHEER_MS;
  }

  private drawLines(): void {
    const py = (y: number) => worldToScreen(0, y, 0).sy;
    const g = this.scene.add.graphics().setDepth(LINES_DEPTH);
    g.lineStyle(2, LINE_COLOR, LINE_ALPHA);
    g.lineBetween(0, py(0), FIELD_W, py(0));
    g.lineBetween(0, py(FIELD_D), FIELD_W, py(FIELD_D));
    g.lineBetween(0, py(0), 0, py(FIELD_D));
    g.lineBetween(FIELD_W, py(0), FIELD_W, py(FIELD_D));
    g.lineBetween(FIELD_W / 2, py(0), FIELD_W / 2, py(FIELD_D));
    g.strokeEllipse(FIELD_W / 2, py(FIELD_D / 2), 120, 120 * DEPTH_SCALE);

    const areaTop = py(FIELD_D / 2 - 90);
    const areaH = 180 * DEPTH_SCALE;
    g.strokeRect(0, areaTop, GK_AREA_DEPTH, areaH);
    g.strokeRect(FIELD_W - GK_AREA_DEPTH, areaTop, GK_AREA_DEPTH, areaH);
  }

  /**
   * One goal on the line at xLine, its net reaching back GOAL_DEPTH. Side 0 is the left goal (dragon faces right into
   * the field), side 1 the right goal (flipped). The mouth projects onto the goal line, so the crossbar is a vertical
   * stroke on screen and the net a strip GOAL_DEPTH px wide.
   */
  private drawGoal(xLine: number, side: 0 | 1): void {
    const yFar = FIELD_D / 2 - GOAL_HALF_W;
    const yNear = FIELD_D / 2 + GOAL_HALF_W;
    const xBack = xLine + (side === 0 ? -GOAL_DEPTH : GOAL_DEPTH);
    const at = (x: number, y: number, z: number) => worldToScreen(x, y, z).sy;
    const netX0 = Math.min(xLine, xBack);
    const netX1 = Math.max(xLine, xBack);
    const netY0 = at(xLine, yFar, GOAL_H);
    const netY1 = at(xLine, yNear, 0);

    const net = this.scene.add.graphics().setDepth(NET_DEPTH);
    net.fillStyle(NET_COLOR, 0.14);
    net.fillRect(netX0, netY0, GOAL_DEPTH, netY1 - netY0);
    net.lineStyle(1, NET_COLOR, NET_ALPHA);
    drawDiagonals(net, netX0, netX1, netY0, netY1, 1);
    drawDiagonals(net, netX0, netX1, netY0, netY1, -1);
    net.lineStyle(2, BACK_WOOD, 1);
    net.lineBetween(xBack, netY0, xBack, netY1);

    const barTop = at(xLine, yFar, GOAL_H);
    const barBottom = at(xLine, yNear, GOAL_H);
    const bar = this.scene.add.graphics().setDepth(yFar + 0.4);
    bar.fillStyle(BAR_OUTLINE, 1);
    bar.fillRect(xLine - 3, barTop - 1, 6, barBottom - barTop + 2);
    bar.fillStyle(BAR_RED, 1);
    bar.fillRect(xLine - 2, barTop, 4, barBottom - barTop);
    bar.fillStyle(BAR_GOLD, 1);
    for (const t of [0.25, 0.5, 0.75]) bar.fillRect(xLine - 2.5, barTop + t * (barBottom - barTop) - 1, 5, 2);

    const postScale = POST_H / GOAL_POST_META.height;
    this.addPost(xLine, yNear, postScale, side, yNear + 0.5);
    this.addPost(xLine, yFar, postScale * FAR_POST_SCALE, side, yFar + 0.5);
  }

  /** A goal post stood on the goal line: its foot (footX, footY in the art) sits on the ground point, centred on x. */
  private addPost(xLine: number, y: number, scale: number, side: 0 | 1, depth: number): void {
    const { sx, sy } = worldToScreen(xLine, y, 0);
    const { width, footX, footY } = GOAL_POST_META;
    const flip = side === 1;
    const originX = (flip ? width - footX : footX) / width;
    this.scene.add
      .image(sx, sy, STADIUM_KEYS.goalPost)
      .setOrigin(originX, footY / GOAL_POST_META.height)
      .setScale(scale)
      .setFlipX(flip)
      .setDepth(depth);
  }

  /** The crowd: two staggered far rows facing the camera (behind the far touchline), and one row from behind below the near touchline. */
  private buildCrowd(): void {
    const far = (feetY: number, displayH: number, offset: number, back: boolean) => {
      for (let x = CROWD_X0 + offset; x <= CROWD_X1; x += CROWD_SPACING) {
        const i = this.soldiers.length;
        const drummer = i % 6 === 5;
        const row = drummer ? 2 : unit(i, 31) < 0.5 ? 0 : 1;
        this.addSoldier(x, feetY, displayH, row, FAR_DEPTH, i, back ? FAR_BACK_TINT : undefined);
      }
    };
    far(FAR_BACK_FEET_Y, FAR_BACK_H, 0, true);
    far(FAR_FRONT_FEET_Y, FAR_FRONT_H, CROWD_SPACING / 2, false);

    for (let x = CROWD_X0; x <= CROWD_X1; x += CROWD_SPACING) {
      const i = this.soldiers.length;
      const row = 3 + Math.floor(unit(i, 53) * 3);
      this.addSoldier(x, NEAR_FEET_Y, NEAR_H, row, NEAR_DEPTH, i, undefined);
    }
  }

  private addSoldier(x: number, feetY: number, displayH: number, row: number, depth: number, i: number, tint: number | undefined): void {
    const { frameWidth, frameHeight, anchorX, anchorY } = SOLDIER_SHEET.meta;
    const sprite = this.scene.add
      .sprite(x, feetY, SOLDIER_SHEET.key, row * SOLDIER_COLS)
      .setOrigin(anchorX / frameWidth, anchorY / frameHeight)
      .setScale(displayH / frameHeight)
      .setFlipX(unit(i, 17) < 0.5)
      .setDepth(depth);
    if (tint !== undefined) sprite.setTint(tint);
    this.soldiers.push({
      sprite,
      row,
      fps: ANIM_FPS_MIN + unit(i, 7919) * ANIM_FPS_SPAN,
      phase: unit(i, 104729) * SOLDIER_COLS,
      feetY,
      hopPhase: unit(i, 1299709) * Math.PI * 2,
    });
  }
}

/** Diagonal rope lines of one slope (+1 or -1), clipped to the net rectangle. */
function drawDiagonals(g: Phaser.GameObjects.Graphics, x0: number, x1: number, y0: number, y1: number, slope: 1 | -1): void {
  // Slope +1 lines are sy = sx + c, slope -1 lines are sy = -sx + c. c spans the rectangle's corners.
  const cMin = slope === 1 ? y0 - x1 : y0 + x0;
  const cMax = slope === 1 ? y1 - x0 : y1 + x1;
  for (let c = cMin; c <= cMax; c += NET_CELL) {
    const xa = slope === 1 ? Math.max(x0, y0 - c) : Math.max(x0, c - y1);
    const xb = slope === 1 ? Math.min(x1, y1 - c) : Math.min(x1, c - y0);
    if (xa > xb) continue;
    g.lineBetween(xa, slope * xa + c, xb, slope * xb + c);
  }
}
