// Hidden sound audition page (`?sfx=1`): one button per Shu attack, shout and special stage, plus the generic
// ZzFX sounds. Plain DOM overlay; not linked from the game. Taps resume the AudioContext (user gesture).
import { SHU_CHARS, SYNTH_RECIPES, type ShuId } from './characterSounds';
import { defaultZzfxPlay } from './AudioPlayer';
import { SOUNDS } from './sounds';
import { playRecipe } from './synth';

const NAMES: Record<ShuId, string> = {
  zhangfei: '張飛',
  guanyu: '關羽',
  zhugeliang: '諸葛亮',
  machao: '馬超',
  zhaoyun: '趙雲',
};

/** Special stages, using the same cues the game plays for each special event. */
const STAGES: Record<ShuId, { label: string; cues: string[] }[]> = {
  zhangfei: [
    { label: '怒吼', cues: ['zhangfei.shout', 'zhangfei.roar'] },
    { label: '震球', cues: ['zhangfei.roarBall'] },
  ],
  guanyu: [
    { label: '起步', cues: ['guanyu.rideStart'] },
    { label: '撞擊', cues: ['guanyu.rideHit'] },
    { label: '熄火', cues: ['guanyu.rideEnd'] },
  ],
  zhugeliang: [
    { label: '集氣', cues: ['zhugeliang.shout', 'zhugeliang.beamCharge'] },
    { label: '光彈', cues: ['zhugeliang.beamStrike'] },
    { label: '中斷', cues: ['zhugeliang.beamCancel'] },
  ],
  machao: [
    { label: '出陣', cues: ['machao.shout', 'machao.cast'] },
    { label: '撞擊', cues: ['machao.riderHit'] },
  ],
  zhaoyun: [
    { label: '突進', cues: ['zhaoyun.lungeStart'] },
    { label: '撞擊', cues: ['zhaoyun.hit'] },
    { label: '回氣', cues: ['zhaoyun.lungeHeal'] },
  ],
};

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

  for (const id of SHU_CHARS) {
    const sec = section(NAMES[id]);
    const row = document.createElement('div');
    row.appendChild(button('普攻', () => playCues([`${id}.attack`])));
    row.appendChild(button('呼喊', () => playCues([`${id}.shout`])));
    for (const stage of STAGES[id]) {
      row.appendChild(button(stage.label, () => playCues(stage.cues)));
    }
    sec.appendChild(row);
    root.appendChild(sec);
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
