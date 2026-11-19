import type Phaser from 'phaser';

/**
 * Animated character sprites. A character with an entry in SPRITE_CONFIGS is drawn from its sheet instead of the
 * block figure. The sheet is produced by tools/make-sprite.mjs (public/sprites/<id>.png + .json); the meta below
 * copies that JSON, so re-run the tool and update the numbers here if the sheet changes.
 */

/** `rampage` loops while invincible with the ball; `shot` is the special ball's launch pose. */
export type SpriteAnim = 'idle' | 'run' | 'attack' | 'charge' | 'special' | 'rampage' | 'shot' | 'jump' | 'hitstun' | 'down' | 'dive' | 'recover';

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

export interface SpriteConfig {
  key: string;
  url: string;
  meta: SpriteMeta;
  /** Logical px for the whole frame height (the art is shorter than the frame, see meta.anchorY). */
  displayHeight: number;
  anims: Record<SpriteAnim, SpriteAnimDef>;
}

const GUANYU_META: SpriteMeta = { frameWidth: 197, frameHeight: 209, cols: 4, rows: 5, anchorX: 106, anchorY: 202 };

/** Frame index of a sheet cell (row-major). */
const at = (row: number, col: number): number => row * GUANYU_META.cols + col;

export const SPRITE_CONFIGS: Partial<Record<string, SpriteConfig>> = {
  guanyu: {
    key: 'sprite-guanyu',
    url: 'sprites/guanyu.png',
    meta: GUANYU_META,
    displayHeight: 63,
    anims: {
      idle: { frames: [at(0, 0), at(0, 1), at(0, 2), at(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [at(1, 0), at(1, 1), at(1, 2), at(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [at(2, 0), at(2, 1), at(2, 2), at(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [at(3, 0)], fps: 1, repeat: -1 },
      special: { frames: [at(3, 1), at(3, 2), at(3, 3)], fps: 10, repeat: 0 },
      rampage: { frames: [at(3, 1), at(3, 2)], fps: 8, repeat: -1 },
      shot: { frames: [at(3, 3)], fps: 1, repeat: -1 },
      jump: { frames: [at(3, 1)], fps: 1, repeat: -1 },
      dive: { frames: [at(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [at(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [at(4, 1), at(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [at(4, 3)], fps: 1, repeat: -1 },
    },
  },
};

export function spriteAnimKey(cfg: SpriteConfig, anim: SpriteAnim): string {
  return `${cfg.key}:${anim}`;
}

/** Queues every configured sheet. A failed load leaves the texture missing, and the match falls back to block figures. */
export function preloadSprites(load: Phaser.Loader.LoaderPlugin): void {
  for (const cfg of Object.values(SPRITE_CONFIGS)) {
    if (!cfg) continue;
    load.spritesheet(cfg.key, cfg.url, { frameWidth: cfg.meta.frameWidth, frameHeight: cfg.meta.frameHeight });
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
  }
}
