// ZzFX parameter arrays. Index 0 is the ZzFX volume; AudioPlayer scales it by
// the player volume and the per-sound volume returned from soundsForEvent.
export const SOUNDS: Record<string, number[]> = {
  kickPass: [0.4, 0.05, 160, 0, 0.02, 0.08, 0, 1.5, -30],
  kickStrong: [0.6, 0.05, 110, 0, 0.04, 0.2, 0, 1.8, -40, 0, 0, 0, 0, 0.2],
  whoosh: [0.12, 0.1, 500, 0.05, 0.1, 0.2, 4, 1, 300],
  punch: [0.5, 0.1, 180, 0, 0.02, 0.1, 2, 2, -60, 0, 0, 0, 0, 0.3],
  heavyHit: [0.6, 0.1, 120, 0, 0.05, 0.2, 2, 1.5, -40, 0, 0, 0, 0, 0.5],
  down: [0.5, 0, 80, 0, 0.1, 0.3, 0, 1, -10],
  jump: [0.3, 0, 300, 0, 0.02, 0.08, 0, 1, 0, 0, 200, 0.05],
  chargeFull: [0.35, 0, 600, 0.01, 0.05, 0.3, 0, 1, 0, 0, 400, 0.08],
  special: [0.6, 0.05, 260, 0.02, 0.3, 0.8, 2, 1, 300, 0, 0, 0, 0, 0.4, 20, 0.2],
  goal: [0.5, 0, 440, 0.02, 0.4, 0.8, 1, 1.2, 0, 0, 300, 0.15, 0, 0, 0, 0, 0.1],
  whistle: [0.35, 0, 2400, 0.05, 0.6, 0.2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 30],
  bounce: [0.2, 0, 1400, 0, 0.01, 0.03, 0, 1],
};

export interface SimEvent {
  type: string;
  [k: string]: unknown;
}

export interface SoundCue {
  name: string;
  volume: number;
}

// Maps one simulation event to the sounds it should trigger.
export function soundsForEvent(e: SimEvent): SoundCue[] {
  switch (e.type) {
    case 'kick':
      return [e.kind === 'shot' || e.kind === 'clear'
        ? { name: 'kickStrong', volume: 1 }
        : { name: 'kickPass', volume: 1 }];
    case 'attack':
      return [{ name: 'whoosh', volume: 1 }];
    case 'hit':
      return [e.kind === 'tackle' || e.kind === 'flykick' || e.kind === 'special'
        ? { name: 'heavyHit', volume: 1 }
        : { name: 'punch', volume: 1 }];
    case 'down':
      return [{ name: 'down', volume: 1 }];
    case 'jump':
      return [{ name: 'jump', volume: 1 }];
    case 'chargeFull':
      return [{ name: 'chargeFull', volume: 1 }];
    case 'special':
      return [{ name: 'special', volume: 1 }];
    case 'goal':
      return [{ name: 'goal', volume: 1 }];
    case 'whistle':
      return [{ name: 'whistle', volume: 1 }];
    case 'bounce': {
      const strength = typeof e.strength === 'number' ? e.strength : 0;
      if (!(strength > 80)) return [];
      return [{ name: 'bounce', volume: Math.min(1, strength / 100) }];
    }
    default:
      return [];
  }
}
