import type Phaser from 'phaser';

/**
 * Animated character sprites. A character with an entry in SPRITE_CONFIGS is drawn from its sheet instead of the
 * block figure. The sheet is produced by tools/make-sprite.mjs (public/sprites/<id>.png + .json); the meta below
 * copies that JSON, so re-run the tool and update the numbers here if the sheet changes.
 */

/** `rampage` loops while invincible with the ball; `shot` is the special ball's launch pose; `lunge` is the dash pose. */
export type SpriteAnim = 'idle' | 'run' | 'attack' | 'charge' | 'special' | 'rampage' | 'shot' | 'hitstun' | 'down' | 'dive' | 'recover' | 'lunge';

/** Effects played over the character (see MatchScene): a spear thrust, the lunge's dragon, and an impact burst. */
export type FxAnim = 'thrust' | 'lunge' | 'burst';

export interface SpriteMeta {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  /** Ground contact point in frame pixels (between the wheels). */
  anchorX: number;
  anchorY: number;
}

/** `repeat` -1 loops; 0 plays once and holds the last frame. */
export interface SpriteAnimDef {
  frames: number[];
  fps: number;
  repeat: number;
}

/** Effect sheet: frames are played with additive blending, so the black background drops out. Frame indices are row-major. */
export interface FxSheet {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  anims: Record<FxAnim, SpriteAnimDef>;
}

export interface SpriteConfig {
  key: string;
  url: string;
  meta: SpriteMeta;
  /** Logical px for the whole frame height (the art is shorter than the frame, see meta.anchorY). */
  displayHeight: number;
  /** Shadow width multiplier vs the block figure (wider under Guan Yu's bike). */
  shadowScale: number;
  anims: Record<SpriteAnim, SpriteAnimDef>;
  /** Optional effect sheet for this character's thrust, lunge and impact burst. */
  fx?: FxSheet;
}

const GUANYU_META: SpriteMeta = { frameWidth: 197, frameHeight: 209, cols: 4, rows: 5, anchorX: 106, anchorY: 202 };
const ZHANGFEI_META: SpriteMeta = { frameWidth: 211, frameHeight: 205, cols: 4, rows: 5, anchorX: 91, anchorY: 198 };
const ZHAOYUN_META: SpriteMeta = { frameWidth: 211, frameHeight: 204, cols: 4, rows: 5, anchorX: 94, anchorY: 191 };

/** Frame index of a sheet cell (row-major) for a sheet with this meta. */
const cellAt = (meta: SpriteMeta) => (row: number, col: number): number => row * meta.cols + col;
const at = cellAt(GUANYU_META);
const zat = cellAt(ZHANGFEI_META);
const yat = cellAt(ZHAOYUN_META);
/** The Zhao Yun effect sheet is 4 columns of 181 px frames. */
const fxat = (row: number, col: number): number => row * 4 + col;

export const SPRITE_CONFIGS: Partial<Record<string, SpriteConfig>> = {
  guanyu: {
    key: 'sprite-guanyu',
    url: 'sprites/guanyu.png',
    meta: GUANYU_META,
    displayHeight: 63,
    shadowScale: 1.6,
    anims: {
      idle: { frames: [at(0, 0), at(0, 1), at(0, 2), at(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [at(1, 0), at(1, 1), at(1, 2), at(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [at(2, 0), at(2, 1), at(2, 2), at(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [at(3, 0)], fps: 1, repeat: -1 },
      special: { frames: [at(3, 1), at(3, 2), at(3, 3)], fps: 10, repeat: 0 },
      rampage: { frames: [at(3, 1), at(3, 2)], fps: 8, repeat: -1 },
      lunge: { frames: [at(3, 1), at(3, 2)], fps: 8, repeat: -1 },
      shot: { frames: [at(3, 3)], fps: 1, repeat: -1 },
      dive: { frames: [at(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [at(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [at(4, 1), at(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [at(4, 3)], fps: 1, repeat: -1 },
    },
  },
  zhangfei: {
    key: 'sprite-zhangfei',
    url: 'sprites/zhangfei.png',
    meta: ZHANGFEI_META,
    displayHeight: 60,
    shadowScale: 1.1,
    anims: {
      idle: { frames: [zat(0, 0), zat(0, 1), zat(0, 2), zat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [zat(1, 0), zat(1, 1), zat(1, 2), zat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [zat(2, 0), zat(2, 1), zat(2, 2), zat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [zat(2, 0)], fps: 1, repeat: -1 },
      special: { frames: [zat(3, 0), zat(3, 1), zat(3, 2), zat(3, 3)], fps: 10, repeat: 0 },
      rampage: { frames: [zat(3, 3)], fps: 1, repeat: -1 },
      lunge: { frames: [zat(3, 3)], fps: 1, repeat: -1 },
      shot: { frames: [zat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [zat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [zat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [zat(4, 1), zat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [zat(4, 3)], fps: 1, repeat: -1 },
    },
  },
  zhaoyun: {
    key: 'sprite-zhaoyun',
    url: 'sprites/zhaoyun.png',
    meta: ZHAOYUN_META,
    displayHeight: 58,
    shadowScale: 1.1,
    anims: {
      idle: { frames: [yat(0, 0), yat(0, 1), yat(0, 2), yat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [yat(1, 0), yat(1, 1), yat(1, 2), yat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [yat(2, 0), yat(2, 1), yat(2, 2), yat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [yat(3, 0)], fps: 1, repeat: -1 },
      special: { frames: [yat(3, 0), yat(3, 1), yat(3, 2), yat(3, 3)], fps: 10, repeat: 0 },
      rampage: { frames: [yat(3, 1), yat(3, 2)], fps: 8, repeat: -1 },
      lunge: { frames: [yat(3, 1), yat(3, 2)], fps: 8, repeat: -1 },
      shot: { frames: [yat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [yat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [yat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [yat(4, 1), yat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [yat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-zhaoyun',
      url: 'sprites/zhaoyun-fx.png',
      frameWidth: 181,
      frameHeight: 181,
      anims: {
        thrust: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        lunge: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 16, repeat: 0 },
        burst: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: 0 },
      },
    },
  },
};

export function spriteAnimKey(cfg: SpriteConfig, anim: SpriteAnim): string {
  return `${cfg.key}:${anim}`;
}

export function fxAnimKey(fx: FxSheet, anim: FxAnim): string {
  return `${fx.key}:${anim}`;
}

/** Queues every configured sheet and effect sheet. A failed load leaves the texture missing, and the match falls back to block figures. */
export function preloadSprites(load: Phaser.Loader.LoaderPlugin): void {
  for (const cfg of Object.values(SPRITE_CONFIGS)) {
    if (!cfg) continue;
    load.spritesheet(cfg.key, cfg.url, { frameWidth: cfg.meta.frameWidth, frameHeight: cfg.meta.frameHeight });
    if (cfg.fx) load.spritesheet(cfg.fx.key, cfg.fx.url, { frameWidth: cfg.fx.frameWidth, frameHeight: cfg.fx.frameHeight });
  }
}

/** Registers the animations of every loaded sheet. Animations are global to the game, so existing keys are kept. */
export function createSpriteAnims(anims: Phaser.Animations.AnimationManager, textures: Phaser.Textures.TextureManager): void {
  for (const cfg of Object.values(SPRITE_CONFIGS)) {
    if (!cfg || !textures.exists(cfg.key)) continue;
    for (const name of Object.keys(cfg.anims) as SpriteAnim[]) {
      const key = spriteAnimKey(cfg, name);
      if (anims.exists(key)) continue;
      const def = cfg.anims[name];
      anims.create({
        key,
        frames: anims.generateFrameNumbers(cfg.key, { frames: def.frames }),
        frameRate: def.fps,
        repeat: def.repeat,
      });
    }
    const fx = cfg.fx;
    if (!fx || !textures.exists(fx.key)) continue;
    for (const name of Object.keys(fx.anims) as FxAnim[]) {
      const key = fxAnimKey(fx, name);
      if (anims.exists(key)) continue;
      const def = fx.anims[name];
      anims.create({
        key,
        frames: anims.generateFrameNumbers(fx.key, { frames: def.frames }),
        frameRate: def.fps,
        repeat: def.repeat,
      });
    }
  }
}
