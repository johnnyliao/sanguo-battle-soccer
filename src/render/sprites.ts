import type Phaser from 'phaser';

/**
 * Animated character sprites. A character with an entry in SPRITE_CONFIGS is drawn from its sheet instead of the
 * block figure. The sheet is produced by tools/make-sprite.mjs (public/sprites/<id>.png + .json); the meta below
 * copies that JSON, so re-run the tool and update the numbers here if the sheet changes.
 */

/** `rampage` loops while invincible with the ball; `shot` is the special ball's launch pose; `lunge` is the dash pose (Guan Yu's ride loop); `dismount` is Guan Yu's pose as his ride ends; `cast` is the beam channel; `land` is a leap's landing crouch (Simayi only); `slashSwing` is Cao Cao's blade swing, played once per swing and held on its last frame until the next. */
export type SpriteAnim = 'idle' | 'run' | 'attack' | 'charge' | 'special' | 'cast' | 'rampage' | 'shot' | 'hitstun' | 'down' | 'dive' | 'recover' | 'lunge' | 'dismount' | 'land' | 'slashSwing';

/**
 * Effects played over the character (see MatchScene): a spear thrust or fan slash, the lunge's dragon, an impact burst,
 * for Zhuge Liang's beam the channel circle, the energy ball and the impact, for Ma Chao's summon the call and the
 * smoke a rider leaves when it vanishes, for Guan Yu's ride the exhaust behind the bike, the fire dragon around him, the flame ring at his start,
 * the fire trail behind him and the impact on each victim,
 * and for Zhang Fei's roar the charge and the soundwave, for Zhang Liao's fear the ghost burst over him, the chains ring and
 * the '!' icon over each feared player, and the chains' shatter when the fear ends. For Simayi's leap: the feather fan slash
 * (punch), the smoke at his start, the crow flock trailing him in the air, the green ring where he lands, and the green burst on each victim.
 * For Xu Chu's tiger guard: the ground smash (punch), the fire ring running round him, the tiger maw over him while a shot is
 * held, the fire roar (spit and forward roar), and the flaming trail of the spat ball. For Cao Cao's slash: the blue sword arc
 * (punch, and a faint one per wave), the seven stars over his head, the blade wave in flight, the sparks where a wave hits, and
 * the heal ring at his feet.
 */
export type FxAnim =
  | 'thrust'
  | 'lunge'
  | 'burst'
  | 'slash'
  | 'charge'
  | 'ball'
  | 'impact'
  | 'summon'
  | 'smoke'
  | 'exhaust'
  | 'dragon'
  | 'wave'
  | 'ghost'
  | 'chains'
  | 'alarm'
  | 'shatter'
  | 'crows'
  | 'ring'
  | 'smash'
  | 'fireRing'
  | 'maw'
  | 'roar'
  | 'trail'
  | 'constellation'
  | 'bladeWave'
  | 'sparks'
  | 'heal';

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
  /** The effect a punch (J without the ball) plays in front of him. */
  punch: FxAnim;
  /** Width in px of the punch effect. Defaults to MatchScene's spear thrust width. */
  punchWidth?: number;
  anims: Partial<Record<FxAnim, SpriteAnimDef>>;
}

export interface SpriteConfig {
  key: string;
  url: string;
  meta: SpriteMeta;
  /** Logical px for the whole frame height (the art is shorter than the frame, see meta.anchorY). */
  displayHeight: number;
  /** Shadow width multiplier vs the block figure (wider under Guan Yu's bike). */
  shadowScale: number;
  /** Every animation the character uses. `land` is only defined where a leap's landing pose plays (Simayi). */
  anims: Partial<Record<SpriteAnim, SpriteAnimDef>>;
  /** Optional effect sheet for this character's thrust, lunge and impact burst. */
  fx?: FxSheet;
}

/**
 * Ma Chao's cavalry rider sheet (summon). Not a player config: MatchScene draws one sprite per live rider.
 * Row 0 is the gallop loop, row 1 the lance charge that plays once after a knock-down and then returns to the gallop.
 */
export type RiderAnim = 'gallop' | 'charge';

export interface RiderSheet {
  key: string;
  url: string;
  meta: SpriteMeta;
  /** Logical px for the whole frame height. */
  displayHeight: number;
  anims: Record<RiderAnim, SpriteAnimDef>;
}

const GUANYU_META: SpriteMeta = { frameWidth: 335, frameHeight: 281, cols: 4, rows: 6, anchorX: 184, anchorY: 239 };
const ZHANGFEI_META: SpriteMeta = { frameWidth: 284, frameHeight: 206, cols: 4, rows: 5, anchorX: 142, anchorY: 199 };
const ZHAOYUN_META: SpriteMeta = { frameWidth: 211, frameHeight: 204, cols: 4, rows: 5, anchorX: 94, anchorY: 191 };
const ZHUGELIANG_META: SpriteMeta = { frameWidth: 211, frameHeight: 197, cols: 4, rows: 5, anchorX: 98, anchorY: 188 };
const MACHAO_META: SpriteMeta = { frameWidth: 211, frameHeight: 195, cols: 4, rows: 5, anchorX: 91, anchorY: 191 };
const MACHAO_CAVALRY_META: SpriteMeta = { frameWidth: 280, frameHeight: 206, cols: 4, rows: 2, anchorX: 145, anchorY: 156 };
const ZHANGLIAO_META: SpriteMeta = { frameWidth: 421, frameHeight: 272, cols: 4, rows: 5, anchorX: 272, anchorY: 265 };
const SIMAYI_META: SpriteMeta = { frameWidth: 263, frameHeight: 244, cols: 4, rows: 6, anchorX: 132, anchorY: 240 };
const XUCHU_META: SpriteMeta = { frameWidth: 282, frameHeight: 290, cols: 4, rows: 6, anchorX: 116, anchorY: 214 };
const CAOCAO_META: SpriteMeta = { frameWidth: 320, frameHeight: 273, cols: 4, rows: 6, anchorX: 150, anchorY: 249 };

/** Frame index of a sheet cell (row-major) for a sheet with this meta. */
const cellAt = (meta: SpriteMeta) => (row: number, col: number): number => row * meta.cols + col;
const at = cellAt(GUANYU_META);
const zat = cellAt(ZHANGFEI_META);
const yat = cellAt(ZHAOYUN_META);
const gat = cellAt(ZHUGELIANG_META);
const mat = cellAt(MACHAO_META);
const cat = cellAt(MACHAO_CAVALRY_META);
const lat = cellAt(ZHANGLIAO_META);
const sat = cellAt(SIMAYI_META);
const xat = cellAt(XUCHU_META);
const ccat = cellAt(CAOCAO_META);
/** The Zhao Yun and Zhuge Liang effect sheets are 4 columns of 181 px frames. */
const fxat = (row: number, col: number): number => row * 4 + col;

export const RIDER_SHEET: RiderSheet = {
  key: 'sprite-machao-cavalry',
  url: 'sprites/machao-cavalry.png',
  meta: MACHAO_CAVALRY_META,
  displayHeight: 70,
  anims: {
    gallop: { frames: [cat(0, 0), cat(0, 1), cat(0, 2), cat(0, 3)], fps: 12, repeat: -1 },
    charge: { frames: [cat(1, 0), cat(1, 1), cat(1, 2), cat(1, 3)], fps: 12, repeat: 0 },
  },
};

export const SPRITE_CONFIGS: Partial<Record<string, SpriteConfig>> = {
  guanyu: {
    key: 'sprite-guanyu',
    url: 'sprites/guanyu.png',
    meta: GUANYU_META,
    displayHeight: 77,
    shadowScale: 1.6,
    anims: {
      idle: { frames: [at(0, 0), at(0, 1), at(0, 2), at(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [at(1, 0), at(1, 1), at(1, 2), at(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [at(2, 0), at(2, 1), at(2, 2), at(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [at(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [at(3, 0)], fps: 1, repeat: -1 },
      special: { frames: [at(3, 0), at(3, 1), at(3, 2)], fps: 12, repeat: 0 },
      lunge: { frames: [at(4, 0), at(4, 1), at(4, 2)], fps: 10, repeat: -1 },
      dismount: { frames: [at(4, 3)], fps: 1, repeat: -1 },
      shot: { frames: [at(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [at(5, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [at(5, 0)], fps: 1, repeat: -1 },
      down: { frames: [at(5, 1), at(5, 2)], fps: 6, repeat: 0 },
      recover: { frames: [at(5, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-guanyu',
      url: 'sprites/guanyu-fx.png',
      frameWidth: 180,
      frameHeight: 180,
      punch: 'slash',
      punchWidth: 90,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        ring: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 10, repeat: 0 },
        exhaust: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: -1 },
        dragon: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 12, repeat: -1 },
        trail: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 14, repeat: 0 },
        impact: { frames: [fxat(5, 0), fxat(5, 1), fxat(5, 2), fxat(5, 3)], fps: 14, repeat: 0 },
      },
    },
  },
  zhangfei: {
    key: 'sprite-zhangfei',
    url: 'sprites/zhangfei.png',
    meta: ZHANGFEI_META,
    displayHeight: 58,
    shadowScale: 1.2,
    anims: {
      idle: { frames: [zat(0, 0), zat(0, 1), zat(0, 2), zat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [zat(1, 0), zat(1, 1), zat(1, 2), zat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [zat(2, 0), zat(2, 1), zat(2, 2), zat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [zat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [zat(3, 2), zat(3, 3)], fps: 8, repeat: -1 },
      special: { frames: [zat(3, 0), zat(3, 1), zat(3, 2), zat(3, 3)], fps: 10, repeat: 0 },
      rampage: { frames: [zat(3, 2), zat(3, 3)], fps: 8, repeat: -1 },
      lunge: { frames: [zat(3, 2), zat(3, 3)], fps: 8, repeat: -1 },
      shot: { frames: [zat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [zat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [zat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [zat(4, 1), zat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [zat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-zhangfei',
      url: 'sprites/zhangfei-fx.png',
      frameWidth: 181,
      frameHeight: 136,
      punch: 'slash',
      punchWidth: 90,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        charge: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 16, repeat: 0 },
        wave: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 10, repeat: 0 },
        impact: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 14, repeat: 0 },
      },
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
      cast: { frames: [yat(3, 0)], fps: 1, repeat: -1 },
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
      punch: 'thrust',
    },
  },
  zhugeliang: {
    key: 'sprite-zhugeliang',
    url: 'sprites/zhugeliang.png',
    meta: ZHUGELIANG_META,
    displayHeight: 56,
    shadowScale: 1.0,
    anims: {
      idle: { frames: [gat(0, 0), gat(0, 1), gat(0, 2), gat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [gat(1, 0), gat(1, 1), gat(1, 2), gat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [gat(2, 0), gat(2, 1), gat(2, 2), gat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [gat(2, 0)], fps: 1, repeat: -1 },
      special: { frames: [gat(3, 0), gat(3, 1), gat(3, 2), gat(3, 3)], fps: 8, repeat: 0 },
      cast: { frames: [gat(3, 0), gat(3, 1)], fps: 4, repeat: -1 },
      rampage: { frames: [gat(3, 2), gat(3, 3)], fps: 8, repeat: -1 },
      lunge: { frames: [gat(3, 2), gat(3, 3)], fps: 8, repeat: -1 },
      shot: { frames: [gat(3, 3)], fps: 1, repeat: -1 },
      dive: { frames: [gat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [gat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [gat(4, 1), gat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [gat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-zhugeliang',
      url: 'sprites/zhugeliang-fx.png',
      frameWidth: 181,
      frameHeight: 136,
      punch: 'slash',
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        charge: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 8, repeat: 0 },
        ball: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: -1 },
        impact: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 12, repeat: 0 },
      },
    },
  },
  machao: {
    key: 'sprite-machao',
    url: 'sprites/machao.png',
    meta: MACHAO_META,
    displayHeight: 58,
    shadowScale: 1.1,
    anims: {
      idle: { frames: [mat(0, 0), mat(0, 1), mat(0, 2), mat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [mat(1, 0), mat(1, 1), mat(1, 2), mat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [mat(2, 0), mat(2, 1), mat(2, 2), mat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [mat(2, 0)], fps: 1, repeat: -1 },
      special: { frames: [mat(3, 0), mat(3, 1), mat(3, 2)], fps: 6, repeat: 0 },
      cast: { frames: [mat(3, 1), mat(3, 2)], fps: 6, repeat: -1 },
      rampage: { frames: [mat(3, 1), mat(3, 2)], fps: 6, repeat: -1 },
      lunge: { frames: [mat(3, 1), mat(3, 2)], fps: 6, repeat: -1 },
      shot: { frames: [mat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [mat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [mat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [mat(4, 1), mat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [mat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-machao',
      url: 'sprites/machao-fx.png',
      frameWidth: 181,
      frameHeight: 136,
      punch: 'slash',
      punchWidth: 80,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        summon: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 10, repeat: 0 },
        burst: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: 0 },
        smoke: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 12, repeat: 0 },
      },
    },
  },
  zhangliao: {
    key: 'sprite-zhangliao',
    url: 'sprites/zhangliao.png',
    meta: ZHANGLIAO_META,
    displayHeight: 60,
    shadowScale: 1.1,
    anims: {
      idle: { frames: [lat(0, 0), lat(0, 1), lat(0, 2), lat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [lat(1, 0), lat(1, 1), lat(1, 2), lat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [lat(2, 0), lat(2, 1), lat(2, 2), lat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [lat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [lat(3, 2)], fps: 1, repeat: -1 },
      special: { frames: [lat(3, 0), lat(3, 1), lat(3, 2), lat(3, 3)], fps: 8, repeat: 0 },
      rampage: { frames: [lat(3, 2), lat(3, 3)], fps: 8, repeat: -1 },
      lunge: { frames: [lat(3, 2), lat(3, 3)], fps: 8, repeat: -1 },
      shot: { frames: [lat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [lat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [lat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [lat(4, 1), lat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [lat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-zhangliao',
      url: 'sprites/zhangliao-fx.png',
      frameWidth: 180,
      frameHeight: 180,
      punch: 'slash',
      punchWidth: 90,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        ghost: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 12, repeat: 0 },
        chains: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 10, repeat: -1 },
        alarm: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 10, repeat: -1 },
        shatter: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 14, repeat: 0 },
      },
    },
  },
  simayi: {
    key: 'sprite-simayi',
    url: 'sprites/simayi.png',
    meta: SIMAYI_META,
    displayHeight: 56,
    shadowScale: 1.0,
    anims: {
      idle: { frames: [sat(0, 0), sat(0, 1), sat(0, 2), sat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [sat(1, 0), sat(1, 1), sat(1, 2), sat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [sat(2, 0), sat(2, 1), sat(2, 2), sat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [sat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [sat(3, 0)], fps: 1, repeat: -1 },
      special: { frames: [sat(3, 0), sat(3, 1)], fps: 12, repeat: 0 },
      lunge: { frames: [sat(3, 2), sat(3, 3), sat(4, 0)], fps: 10, repeat: -1 },
      land: { frames: [sat(4, 1), sat(4, 2)], fps: 6, repeat: 0 },
      shot: { frames: [sat(2, 3)], fps: 1, repeat: -1 },
      dive: { frames: [sat(5, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [sat(5, 0)], fps: 1, repeat: -1 },
      down: { frames: [sat(5, 1), sat(5, 2)], fps: 6, repeat: 0 },
      recover: { frames: [sat(5, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-simayi',
      url: 'sprites/simayi-fx.png',
      frameWidth: 180,
      frameHeight: 180,
      punch: 'slash',
      punchWidth: 90,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        smoke: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 12, repeat: 0 },
        crows: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: -1 },
        ring: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 10, repeat: 0 },
        burst: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 14, repeat: 0 },
      },
    },
  },
  xuchu: {
    key: 'sprite-xuchu',
    url: 'sprites/xuchu.png',
    meta: XUCHU_META,
    displayHeight: 84,
    shadowScale: 1.2,
    anims: {
      idle: { frames: [xat(0, 0), xat(0, 1), xat(0, 2), xat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [xat(1, 0), xat(1, 1), xat(1, 2), xat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [xat(2, 0), xat(2, 1), xat(2, 2), xat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [xat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [xat(4, 2)], fps: 1, repeat: -1 },
      special: { frames: [xat(4, 0), xat(4, 1), xat(4, 2)], fps: 8, repeat: 0 },
      rampage: { frames: [xat(4, 1), xat(4, 2)], fps: 8, repeat: -1 },
      lunge: { frames: [xat(4, 1), xat(4, 2)], fps: 8, repeat: -1 },
      shot: { frames: [xat(2, 2)], fps: 1, repeat: -1 },
      dive: { frames: [xat(3, 1), xat(3, 2), xat(3, 3)], fps: 8, repeat: 0 },
      hitstun: { frames: [xat(5, 0)], fps: 1, repeat: -1 },
      down: { frames: [xat(5, 1), xat(5, 2)], fps: 6, repeat: 0 },
      recover: { frames: [xat(5, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-xuchu',
      url: 'sprites/xuchu-fx.png',
      frameWidth: 180,
      frameHeight: 180,
      punch: 'smash',
      punchWidth: 90,
      anims: {
        smash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        fireRing: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 10, repeat: -1 },
        maw: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 6, repeat: 0 },
        roar: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 10, repeat: 0 },
        trail: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 14, repeat: -1 },
      },
    },
  },
  caocao: {
    key: 'sprite-caocao',
    url: 'sprites/caocao.png',
    meta: CAOCAO_META,
    displayHeight: 58,
    shadowScale: 1.1,
    anims: {
      idle: { frames: [ccat(0, 0), ccat(0, 1), ccat(0, 2), ccat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [ccat(1, 0), ccat(1, 1), ccat(1, 2), ccat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [ccat(2, 0), ccat(2, 1), ccat(2, 2), ccat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [ccat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [ccat(3, 1)], fps: 1, repeat: -1 },
      special: { frames: [ccat(3, 0), ccat(3, 1), ccat(3, 2), ccat(3, 3)], fps: 6, repeat: 0 },
      slashSwing: { frames: [ccat(4, 0), ccat(4, 1), ccat(4, 2), ccat(4, 3)], fps: 14, repeat: 0 },
      rampage: { frames: [ccat(4, 1), ccat(4, 2)], fps: 8, repeat: -1 },
      lunge: { frames: [ccat(4, 1), ccat(4, 2)], fps: 8, repeat: -1 },
      shot: { frames: [ccat(2, 1)], fps: 1, repeat: -1 },
      dive: { frames: [ccat(5, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [ccat(5, 0)], fps: 1, repeat: -1 },
      down: { frames: [ccat(5, 1), ccat(5, 2)], fps: 6, repeat: 0 },
      recover: { frames: [ccat(5, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-caocao',
      url: 'sprites/caocao-fx.png',
      frameWidth: 180,
      frameHeight: 180,
      punch: 'slash',
      punchWidth: 90,
      anims: {
        slash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        constellation: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 8, repeat: 0 },
        bladeWave: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 12, repeat: -1 },
        sparks: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 14, repeat: 0 },
        heal: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 10, repeat: 0 },
      },
    },
  },
};

/** Stadium art (plain images): tiling backdrop, grass, foreground barricades, and the goal's dragon post (53×160, foot at footX/footY). */
export const STADIUM_KEYS = {
  bg: 'stadium-bg',
  grass: 'stadium-grass',
  fg: 'stadium-fg',
  goalPost: 'goal-post',
} as const;

export const GOAL_POST_META = { width: 53, height: 160, footX: 16, footY: 159 } as const;

/** Cheering soldiers: rows 0-2 face the camera, rows 3-5 are seen from behind. Each row is a 4-frame loop. */
export const SOLDIER_SHEET = {
  key: 'soldiers',
  url: 'sprites/soldiers.png',
  meta: { frameWidth: 121, frameHeight: 120, cols: 4, rows: 6, anchorX: 58, anchorY: 119 } as SpriteMeta,
};

/** The match ball: 8 rotation frames in one row. */
export const BALL_SHEET = { key: 'ball-sheet', url: 'sprites/ball.png', frameWidth: 48, frameHeight: 48 };

export function spriteAnimKey(cfg: SpriteConfig, anim: SpriteAnim): string {
  return `${cfg.key}:${anim}`;
}

export function fxAnimKey(fx: FxSheet, anim: FxAnim): string {
  return `${fx.key}:${anim}`;
}

export function riderAnimKey(anim: RiderAnim): string {
  return `rider-${anim}`;
}

/** Queues every configured sheet and effect sheet. A failed load leaves the texture missing, and the match falls back to block figures. */
export function preloadSprites(load: Phaser.Loader.LoaderPlugin): void {
  for (const cfg of Object.values(SPRITE_CONFIGS)) {
    if (!cfg) continue;
    load.spritesheet(cfg.key, cfg.url, { frameWidth: cfg.meta.frameWidth, frameHeight: cfg.meta.frameHeight });
    if (cfg.fx) load.spritesheet(cfg.fx.key, cfg.fx.url, { frameWidth: cfg.fx.frameWidth, frameHeight: cfg.fx.frameHeight });
  }
  load.spritesheet(RIDER_SHEET.key, RIDER_SHEET.url, { frameWidth: RIDER_SHEET.meta.frameWidth, frameHeight: RIDER_SHEET.meta.frameHeight });
  load.image(STADIUM_KEYS.bg, 'sprites/stadium-bg.png');
  load.image(STADIUM_KEYS.grass, 'sprites/stadium-grass.png');
  load.image(STADIUM_KEYS.fg, 'sprites/stadium-fg.png');
  load.image(STADIUM_KEYS.goalPost, 'sprites/goal-post.png');
  load.spritesheet(SOLDIER_SHEET.key, SOLDIER_SHEET.url, { frameWidth: SOLDIER_SHEET.meta.frameWidth, frameHeight: SOLDIER_SHEET.meta.frameHeight });
  load.spritesheet(BALL_SHEET.key, BALL_SHEET.url, { frameWidth: BALL_SHEET.frameWidth, frameHeight: BALL_SHEET.frameHeight });
}

/** Registers the animations of every loaded sheet. Animations are global to the game, so existing keys are kept. */
export function createSpriteAnims(anims: Phaser.Animations.AnimationManager, textures: Phaser.Textures.TextureManager): void {
  for (const cfg of Object.values(SPRITE_CONFIGS)) {
    if (!cfg || !textures.exists(cfg.key)) continue;
    for (const name of Object.keys(cfg.anims) as SpriteAnim[]) {
      const key = spriteAnimKey(cfg, name);
      if (anims.exists(key)) continue;
      const def = cfg.anims[name];
      if (!def) continue;
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
      if (!def) continue;
      anims.create({
        key,
        frames: anims.generateFrameNumbers(fx.key, { frames: def.frames }),
        frameRate: def.fps,
        repeat: def.repeat,
      });
    }
  }
  if (textures.exists(RIDER_SHEET.key)) {
    for (const name of Object.keys(RIDER_SHEET.anims) as RiderAnim[]) {
      const key = riderAnimKey(name);
      if (anims.exists(key)) continue;
      const def = RIDER_SHEET.anims[name];
      anims.create({
        key,
        frames: anims.generateFrameNumbers(RIDER_SHEET.key, { frames: def.frames }),
        frameRate: def.fps,
        repeat: def.repeat,
      });
    }
  }
}
