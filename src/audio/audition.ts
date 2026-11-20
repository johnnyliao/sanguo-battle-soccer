// Hidden sound audition page (`?sfx=1`): one button per attack and special stage of the Shu and Wei
// characters, plus the generic ZzFX sounds. Plain DOM overlay; not linked from the game. Taps resume the
// AudioContext (user gesture).
import { SHU_CHARS, SYNTH_RECIPES, WEI_CHARS, type SoundCharId } from './characterSounds';
import { defaultZzfxPlay } from './AudioPlayer';
import { SOUNDS } from './sounds';
import { playRecipe } from './synth';

const NAMES: Record<SoundCharId, string> = {
  zhangfei: '張飛',
  guanyu: '關羽',
  zhugeliang: '諸葛亮',
  machao: '馬超',
  zhaoyun: '趙雲',
  xuchu: '許褚',
  caocao: '曹操',
  zhenji: '甄姬',
  simayi: '司馬懿',
  zhangliao: '張遼',
};

/** Special stages, using the same cues the game plays for each special event. */
interface Stage {
  label: string;
  cues: string[];
  /** A sequence to play instead of the cues (Cao Cao's 25 swings). */
  run?: () => void;
}

const STAGES: Record<SoundCharId, Stage[]> = {
  zhangfei: [
    { label: '怒吼', cues: ['zhangfei.roar'] },
    { label: '震球', cues: ['zhangfei.roarBall'] },
  ],
  guanyu: [
    { label: '起步', cues: ['guanyu.rideStart'] },
    { label: '撞擊', cues: ['guanyu.rideHit'] },
    { label: '熄火', cues: ['guanyu.rideEnd'] },
  ],
  zhugeliang: [
    { label: '集氣', cues: ['zhugeliang.beamCharge'] },
    { label: '光彈', cues: ['zhugeliang.beamStrike'] },
    { label: '中斷', cues: ['zhugeliang.beamCancel'] },
  ],
  machao: [
    { label: '出陣', cues: ['machao.cast'] },
    { label: '撞擊', cues: ['machao.riderHit'] },
  ],
  zhaoyun: [
    { label: '突進', cues: ['zhaoyun.lungeStart'] },
    { label: '撞擊', cues: ['zhaoyun.hit'] },
    { label: '回氣', cues: ['zhaoyun.lungeHeal'] },
  ],
  xuchu: [
    { label: '虎守', cues: ['xuchu.tigerStart'] },
    { label: '吞球', cues: ['xuchu.tigerSwallow'] },
    { label: '吐球', cues: ['xuchu.tigerSpit'] },
    { label: '震退', cues: ['xuchu.tigerRoar'] },
  ],
  caocao: [
    { label: '七星', cues: ['caocao.slashStart'] },
    { label: '揮刀×25', cues: [], run: playSlashSequence },
    { label: '回氣', cues: ['caocao.slashHeal'] },
  ],
  zhenji: [
    { label: '冰雨(4 秒)', cues: ['zhenji.iceStart'] },
    { label: '冰裂', cues: ['zhenji.icePulse'] },
    { label: '碎冰', cues: ['zhenji.iceEnd'] },
  ],
  simayi: [
    { label: '後跳', cues: ['simayi.leapStart'] },
    { label: '飛行', cues: ['simayi.leapFly'] },
    { label: '落地', cues: ['simayi.leapLand', 'simayi.hush'] },
  ],
  zhangliao: [
    { label: '遼來了', cues: ['zhangliao.fear'] },
  ],
};

/** Cao Cao's 霸刀連斬 swing interval (SLASH_INTERVAL, 12 ticks at 60 Hz). */
const SWING_GAP_MS = 200;

/** Plays the 25 swings of 霸刀連斬 at 0.2 s spacing: a swing and a blade wave each, two cuts and two heals. */
function playSlashSequence(): void {
  for (let i = 0; i < 25; i++) {
    setTimeout(() => {
      const cues = ['caocao.slashSwing', 'caocao.slashWave'];
      if (i === 4 || i === 12) cues.push('caocao.slashWaveEnd');
      if (i === 6 || i === 13) cues.push('caocao.slashHeal');
      playCues(cues);
    }, i * SWING_GAP_MS);
  }
}

/** Same default as AudioPlayer.volume. */
const VOLUME = 0.5;

function button(label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'min-height:44px;min-width:72px;margin:4px;padding:6px 12px;font-size:16px;color:#fff;' +
    'background:#2d3b2d;border:1px solid #6a8a5a;border-radius:6px;touch-action:manipulation;';
  b.addEventListener('click', onTap);
  return b;
}

function section(title: string): HTMLDivElement {
  const div = document.createElement('div');
  div.style.cssText = 'margin:12px 0;';
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.cssText = 'margin:0 0 4px;font-size:18px;color:#ffd76a;';
  div.appendChild(h);
  return div;
}

/** A country heading above its character sections. */
function groupTitle(title: string): HTMLHeadingElement {
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.cssText = 'margin:20px 0 0;font-size:22px;color:#fff;border-bottom:1px solid #6a8a5a;padding-bottom:4px;';
  return h;
}

function playCues(names: string[]): void {
  for (const name of names) {
    const recipe = SYNTH_RECIPES[name];
    if (recipe) playRecipe(recipe, VOLUME);
  }
}

/** Mounts the audition overlay on `parent` (default: document body). */
export function mountAudition(parent: HTMLElement = document.body): HTMLElement {
  const root = document.createElement('div');
  root.id = 'sfx-audition';
  root.style.cssText =
    'position:fixed;inset:0;z-index:1000;overflow-y:auto;padding:16px;box-sizing:border-box;' +
    'background:#111;color:#eee;font-family:sans-serif;';
  const title = document.createElement('h1');
  title.textContent = '試聽';
  title.style.cssText = 'margin:0 0 8px;font-size:22px;';
  root.appendChild(title);

  const groups: { title: string; ids: readonly SoundCharId[] }[] = [
    { title: '蜀國', ids: SHU_CHARS },
    { title: '魏國', ids: WEI_CHARS },
  ];
  for (const group of groups) {
    root.appendChild(groupTitle(group.title));
    for (const id of group.ids) {
      const sec = section(NAMES[id]);
      const row = document.createElement('div');
      row.appendChild(button('普攻', () => playCues([`${id}.attack`])));
      for (const stage of STAGES[id]) {
        row.appendChild(button(stage.label, () => (stage.run ? stage.run() : playCues(stage.cues))));
      }
      sec.appendChild(row);
      root.appendChild(sec);
    }
  }

  const generic = section('通用音效（ZzFX）');
  const genericRow = document.createElement('div');
  for (const name of Object.keys(SOUNDS)) {
    genericRow.appendChild(
      button(name, () => {
        const params = [...SOUNDS[name]];
        params[0] = SOUNDS[name][0] * VOLUME;
        defaultZzfxPlay(params);
      }),
    );
  }
  generic.appendChild(genericRow);
  root.appendChild(generic);

  parent.appendChild(root);
  return root;
}
