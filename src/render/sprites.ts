import type Phaser from 'phaser';
import { getTeam, type Country } from '../data';

/**
 * Animated character sprites. A character with an entry in SPRITE_CONFIGS is drawn from its sheet instead of the
 * block figure. The sheet is produced by tools/make-sprite.mjs (public/sprites/<id>.png + .json); the meta below
 * copies that JSON, so re-run the tool and update the numbers here if the sheet changes.
 */

/** `rampage` loops while invincible with the ball; `shot` is the special ball's launch pose; `lunge` is the dash pose (Guan Yu's ride loop); `dismount` is Guan Yu's pose as his ride ends; `cast` is the beam channel; `land` is a leap's landing crouch (Simayi only); `slashSwing` is Cao Cao's blade swing, played once per swing and held on its last frame until the next. */
export type SpriteAnim = 'idle' | 'run' | 'attack' | 'charge' | 'special' | 'cast' | 'rampage' | 'shot' | 'hitstun' | 'down' | 'dive' | 'recover' | 'lunge' | 'dismount' | 'land' | 'slashSwing' | 'sail';

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
 * the heal ring at his feet. For Zhen Ji's icefield: the icy whip arc (punch), the falling ice rain over the field, the ground ice
 * spikes (and their melt when the field ends), the snowflake burst at her cast, and the shatter on each victim and at the field's end.
 * For Sun Ce's sail: the water ring at his start (splash), the wake behind the boat while it sails, the water burst with splinters where
 * the hull hits a victim (splinter), and the dizzy stars over the victim when he lands (dizzy).
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
  | 'heal'
  | 'whip'
  | 'rain'
  | 'spikes'
  | 'melt'
  | 'snow'
  | 'splash'
  | 'wake'
  | 'splinter'
  | 'dizzy';

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
  /** Optional display scale multiplier per animation, on top of displayHeight and anchored at the feet (Sun Ce's boat frames are drawn small in the uniform sheet). */
  animScale?: Partial<Record<SpriteAnim, number>>;
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

const GUANYU_META: SpriteMeta = { frameWidth: 202, frameHeight: 169, cols: 4, rows: 6, anchorX: 111, anchorY: 144 };
const ZHANGFEI_META: SpriteMeta = { frameWidth: 176, frameHeight: 128, cols: 4, rows: 5, anchorX: 88, anchorY: 123 };
const ZHAOYUN_META: SpriteMeta = { frameWidth: 132, frameHeight: 128, cols: 4, rows: 5, anchorX: 59, anchorY: 119 };
const ZHUGELIANG_META: SpriteMeta = { frameWidth: 132, frameHeight: 123, cols: 4, rows: 5, anchorX: 61, anchorY: 118 };
const MACHAO_META: SpriteMeta = { frameWidth: 138, frameHeight: 128, cols: 4, rows: 5, anchorX: 59, anchorY: 125 };
const MACHAO_CAVALRY_META: SpriteMeta = { frameWidth: 280, frameHeight: 206, cols: 4, rows: 2, anchorX: 145, anchorY: 156 };
const ZHANGLIAO_META: SpriteMeta = { frameWidth: 204, frameHeight: 132, cols: 4, rows: 5, anchorX: 132, anchorY: 129 };
const SIMAYI_META: SpriteMeta = { frameWidth: 133, frameHeight: 123, cols: 4, rows: 6, anchorX: 67, anchorY: 121 };
const XUCHU_META: SpriteMeta = { frameWidth: 180, frameHeight: 185, cols: 4, rows: 6, anchorX: 74, anchorY: 136 };
const CAOCAO_META: SpriteMeta = { frameWidth: 149, frameHeight: 127, cols: 4, rows: 6, anchorX: 70, anchorY: 116 };
const ZHENJI_META: SpriteMeta = { frameWidth: 160, frameHeight: 123, cols: 4, rows: 5, anchorX: 87, anchorY: 121 };
const SUNCE_META: SpriteMeta = { frameWidth: 142, frameHeight: 128, cols: 4, rows: 5, anchorX: 73, anchorY: 124 };

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
const zjat = cellAt(ZHENJI_META);
const suat = cellAt(SUNCE_META);
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
      frameWidth: 120,
      frameHeight: 120,
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
      frameWidth: 120,
      frameHeight: 120,
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
      frameWidth: 120,
      frameHeight: 120,
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
      frameWidth: 120,
      frameHeight: 120,
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
      slashSwing: { frames: [ccat(4, 0), ccat(4, 1), ccat(4, 2), ccat(4, 3)], fps: 22, repeat: 0 },
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
      frameWidth: 120,
      frameHeight: 120,
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
  sunce: {
    key: 'sprite-sunce',
    url: 'sprites/sunce.png',
    meta: SUNCE_META,
    displayHeight: 58,
    shadowScale: 1.1,
    // The boat frames (row 3) share the sheet's uniform box with the boat, so Sun Ce is about half his on-foot height there.
    animScale: { special: 1.9, cast: 1.9, rampage: 1.9, lunge: 1.9, sail: 1.9, dismount: 1.9 },
    anims: {
      idle: { frames: [suat(0, 0), suat(0, 1), suat(0, 2), suat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [suat(1, 0), suat(1, 1), suat(1, 2), suat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [suat(2, 0), suat(2, 1), suat(2, 2), suat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [suat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [suat(3, 1)], fps: 1, repeat: -1 },
      special: { frames: [suat(3, 0)], fps: 1, repeat: -1 },
      sail: { frames: [suat(3, 1), suat(3, 2)], fps: 6, repeat: -1 },
      dismount: { frames: [suat(3, 3)], fps: 1, repeat: -1 },
      rampage: { frames: [suat(3, 1)], fps: 1, repeat: -1 },
      lunge: { frames: [suat(3, 1)], fps: 1, repeat: -1 },
      shot: { frames: [suat(2, 2)], fps: 1, repeat: -1 },
      dive: { frames: [suat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [suat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [suat(4, 1), suat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [suat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-sunce',
      url: 'sprites/sunce-fx.png',
      frameWidth: 188,
      frameHeight: 120,
      punch: 'smash',
      punchWidth: 90,
      anims: {
        smash: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        splash: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 12, repeat: 0 },
        wake: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2), fxat(2, 3)], fps: 10, repeat: -1 },
        splinter: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 14, repeat: 0 },
        dizzy: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 10, repeat: 0 },
      },
    },
  },
  zhenji: {
    key: 'sprite-zhenji',
    url: 'sprites/zhenji.png',
    meta: ZHENJI_META,
    displayHeight: 56,
    shadowScale: 1.0,
    anims: {
      idle: { frames: [zjat(0, 0), zjat(0, 1), zjat(0, 2), zjat(0, 3)], fps: 6, repeat: -1 },
      run: { frames: [zjat(1, 0), zjat(1, 1), zjat(1, 2), zjat(1, 3)], fps: 10, repeat: -1 },
      attack: { frames: [zjat(2, 0), zjat(2, 1), zjat(2, 2), zjat(2, 3)], fps: 14, repeat: 0 },
      charge: { frames: [zjat(2, 0)], fps: 1, repeat: -1 },
      cast: { frames: [zjat(3, 2)], fps: 1, repeat: -1 },
      special: { frames: [zjat(3, 0), zjat(3, 1), zjat(3, 2)], fps: 8, repeat: 0 },
      rampage: { frames: [zjat(3, 1)], fps: 1, repeat: -1 },
      lunge: { frames: [zjat(3, 1)], fps: 1, repeat: -1 },
      shot: { frames: [zjat(2, 2)], fps: 1, repeat: -1 },
      dive: { frames: [zjat(4, 1)], fps: 1, repeat: -1 },
      hitstun: { frames: [zjat(4, 0)], fps: 1, repeat: -1 },
      down: { frames: [zjat(4, 1), zjat(4, 2)], fps: 6, repeat: 0 },
      recover: { frames: [zjat(4, 3)], fps: 1, repeat: -1 },
    },
    fx: {
      key: 'fx-zhenji',
      url: 'sprites/zhenji-fx.png',
      frameWidth: 120,
      frameHeight: 120,
      punch: 'whip',
      punchWidth: 90,
      anims: {
        whip: { frames: [fxat(0, 0), fxat(0, 1), fxat(0, 2), fxat(0, 3)], fps: 20, repeat: 0 },
        rain: { frames: [fxat(1, 0), fxat(1, 1), fxat(1, 2), fxat(1, 3)], fps: 12, repeat: -1 },
        spikes: { frames: [fxat(2, 0), fxat(2, 1), fxat(2, 2)], fps: 10, repeat: 0 },
        melt: { frames: [fxat(2, 3)], fps: 1, repeat: -1 },
        snow: { frames: [fxat(3, 0), fxat(3, 1), fxat(3, 2), fxat(3, 3)], fps: 12, repeat: 0 },
        shatter: { frames: [fxat(4, 0), fxat(4, 1), fxat(4, 2), fxat(4, 3)], fps: 14, repeat: 0 },
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

/** One file of a match's sheets: a spritesheet when `frame` is given, otherwise a plain image. */
export interface SheetFile {
  key: string;
  url: string;
  frame?: { width: number; height: number };
}

/**
 * The sheets a match between two countries draws: the sprite and effect sheets of its ten characters (block figures for any
 * without one), Ma Chao's cavalry only when Ma Chao plays, then the stadium, soldiers and ball.
 */
export function matchSheets(home: Country, away: Country): SheetFile[] {
  const files: SheetFile[] = [];
  const ids = [...getTeam(home), ...getTeam(away)].map((d) => d.id);
  for (const id of ids) {
    const cfg = SPRITE_CONFIGS[id];
    if (!cfg) continue;
    files.push({ key: cfg.key, url: cfg.url, frame: { width: cfg.meta.frameWidth, height: cfg.meta.frameHeight } });
    if (cfg.fx) files.push({ key: cfg.fx.key, url: cfg.fx.url, frame: { width: cfg.fx.frameWidth, height: cfg.fx.frameHeight } });
  }
  if (ids.includes('machao')) {
    files.push({ key: RIDER_SHEET.key, url: RIDER_SHEET.url, frame: { width: RIDER_SHEET.meta.frameWidth, height: RIDER_SHEET.meta.frameHeight } });
  }
  files.push(
    { key: STADIUM_KEYS.bg, url: 'sprites/stadium-bg.png' },
    { key: STADIUM_KEYS.grass, url: 'sprites/stadium-grass.png' },
    { key: STADIUM_KEYS.fg, url: 'sprites/stadium-fg.png' },
    { key: STADIUM_KEYS.goalPost, url: 'sprites/goal-post.png' },
    { key: SOLDIER_SHEET.key, url: SOLDIER_SHEET.url, frame: { width: SOLDIER_SHEET.meta.frameWidth, height: SOLDIER_SHEET.meta.frameHeight } },
    { key: BALL_SHEET.key, url: BALL_SHEET.url, frame: { width: BALL_SHEET.frameWidth, height: BALL_SHEET.frameHeight } },
  );
  return files;
}

/** Queues these files on a loader. Phaser itself skips a key that is already in the texture manager. */
export function queueSheets(load: Phaser.Loader.LoaderPlugin, files: SheetFile[]): void {
  for (const f of files) {
    if (f.frame) load.spritesheet(f.key, f.url, { frameWidth: f.frame.width, frameHeight: f.frame.height });
    else load.image(f.key, f.url);
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
