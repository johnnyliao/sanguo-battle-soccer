// Sample (CC0 file) sounds: which sample a sim event plays, by character. Samples are public/sfx/<slot>.wav.
// Returns undefined for events that keep the existing sounds (synth or ZzFX), and [] for events that stay silent.
import type { SimEvent, SoundCue } from './sounds';

/** Cue name prefix for a sample: 'sfx:<slot>' plays public/sfx/<slot>.wav. */
export const SAMPLE_PREFIX = 'sfx:';

/**
 * Slot for a punch hit. Undefined until a punch file exists: punches keep the current generic sound.
 * Set it to a slot name (and produce public/sfx/<slot>.wav) to switch.
 */
const HIT_PUNCH_SLOT: string | undefined = 'hit_punch';
/**
 * Slot for a tackle, special or rider hit. Undefined until a file exists: these keep the current sounds.
 * Set it to a slot name (and produce public/sfx/<slot>.wav) to switch.
 */
const HIT_HEAVY_SLOT: string | undefined = 'hit_heavy';
/** Slot for an ice field pulse with victims. */
const ICE_PULSE_SLOT = 'zhenji_pulse';

/** Attack slot by character. Characters not listed here keep the generic sound. */
const ATTACK_SLOT = new Map<string, string>([
  ['zhangfei', 'swing_heavy'],
  ['guanyu', 'swing_heavy'],
  ['xuchu', 'swing_heavy'],
  ['zhangliao', 'swing_heavy'],
  ['sunce', 'swing_heavy'],
  ['zhaoyun', 'swing_blade'],
  ['machao', 'swing_blade'],
  ['caocao', 'swing_blade'],
  ['sunquan', 'swing_blade'],
  ['zhouyu', 'swing_blade'],
  ['zhugeliang', 'swing_fan'],
  ['simayi', 'swing_fan'],
  ['zhenji', 'swing_fan'],
  ['xiaoqiao', 'swing_fan'],
  ['daqiao', 'swing_fan'],
]);

interface DedicatedSample {
  /** Undefined keeps the existing sound for this event. */
  slot: string | undefined;
  volume?: number;
}

/** Events with their own sample, whichever character they come from. */
const DEDICATED = new Map<string, DedicatedSample>([
  ['roar', { slot: 'zhangfei_roar' }],
  ['rideStart', { slot: 'guanyu_ride' }],
  ['rideHit', { slot: HIT_HEAVY_SLOT }],
  ['beamCharge', { slot: 'zhugeliang_charge' }],
  ['beamStrike', { slot: 'zhugeliang_hit' }],
  ['summonStart', { slot: 'machao_cavalry' }],
  ['riderHit', { slot: HIT_HEAVY_SLOT }],
  ['lungeStart', { slot: 'zhaoyun_lunge' }],
  ['tigerStart', { slot: 'xuchu_guard' }],
  ['tigerSwallow', { slot: 'xuchu_swallow' }],
  ['tigerSpit', { slot: 'xuchu_spit' }],
  ['tigerRoar', { slot: 'xuchu_guard' }],
  ['slashWave', { slot: 'caocao_wave', volume: 0.6 }],
  ['iceStart', { slot: 'zhenji_ice' }],
  ['leapStart', { slot: 'simayi_leap' }],
  ['leapLand', { slot: 'simayi_land' }],
  ['fear', { slot: 'zhangliao_fear' }],
  ['sailStart', { slot: 'sunce_sail' }],
  ['sailCrash', { slot: 'sunce_crash' }],
  ['gustBlow', { slot: 'xiaoqiao_gust' }],
  ['portalStart', { slot: 'daqiao_portal' }],
  ['portalSummon', { slot: 'daqiao_summon' }],
  ['arrowshipStart', { slot: 'sunquan_ship' }],
  ['arrowshipBlock', { slot: 'sunquan_block' }],
  ['arrowshipVolley', { slot: 'sunquan_volley' }],
  ['eastwindStart', { slot: 'zhouyu_wind' }],
]);

/**
 * Events that the old character synth handled and that now stay silent for the 15 characters
 * (their sound is the dedicated sample above, or none).
 */
const SILENT = new Set<string>([
  'roarBall', 'rampageStart', 'rampageEnd', 'specialEnd', 'slashStart', 'slashSwing', 'slashWaveEnd',
  'slashHeal', 'slashEnd', 'lungeHeal', 'lungeEnd', 'beamCancel', 'leapFly', 'iceEnd', 'tigerEnd',
  'rideEnd', 'riderSpawn', 'riderEnd', 'sailBoard', 'sailDrop', 'sailEnd', 'gustMark', 'gustEnd',
  'portalArrive', 'portalEnd', 'eastwindEnd', 'arrowshipEnd',
]);

function slotCue(slot: string | undefined, volume = 1): SoundCue[] | undefined {
  return slot === undefined ? undefined : [{ name: `${SAMPLE_PREFIX}${slot}`, volume }];
}

/**
 * Every sample slot the mapping can name (preloaded at match start). Adding a slot to the tables above
 * adds it here automatically.
 */
export const SAMPLE_SLOTS: readonly string[] = [
  'kick_pass', 'kick_shot', 'down', 'goal', HIT_PUNCH_SLOT, HIT_HEAVY_SLOT, ICE_PULSE_SLOT,
  ...ATTACK_SLOT.values(),
  ...Array.from(DEDICATED.values(), (d) => d.slot),
].filter((s, i, all): s is string => s !== undefined && all.indexOf(s) === i);

/**
 * Sample cues for one sim event, or undefined to fall back to the existing sounds. charId is the event's
 * character (see AudioPlayer). An empty array means silent.
 */
export function sampleCues(e: SimEvent, charId: string | undefined): SoundCue[] | undefined {
  const known = charId !== undefined && ATTACK_SLOT.has(charId);
  switch (e.type) {
    case 'kick':
      return slotCue(e.kind === 'shot' || e.kind === 'clear' ? 'kick_shot' : 'kick_pass');
    case 'pkKick':
      return slotCue('kick_shot');
    case 'goal':
      return slotCue('goal');
    case 'pkResult':
      return e.outcome === 'goal' ? slotCue('goal') : undefined;
    case 'down':
      return slotCue('down');
    case 'attack':
      return charId === undefined ? undefined : slotCue(ATTACK_SLOT.get(charId));
    case 'hit':
      return e.kind === 'tackle' || e.kind === 'special' ? slotCue(HIT_HEAVY_SLOT) : slotCue(HIT_PUNCH_SLOT);
    case 'special':
      return known ? [] : undefined;
    case 'icePulse':
      // Without a known caster (the field has ended) the pulse stays silent.
      if (!known) return undefined;
      return Array.isArray(e.victimIdxs) && e.victimIdxs.length > 0 ? slotCue(ICE_PULSE_SLOT) : [];
    default: {
      const dedicated = DEDICATED.get(e.type);
      if (dedicated) return slotCue(dedicated.slot, dedicated.volume);
      if (SILENT.has(e.type)) return known ? [] : undefined;
      return undefined;
    }
  }
}
