// Hidden candidate-sound page (`?sfx=pack`): for each sound slot, three candidate files (A/B/C) from the
// CC0 pack, listed by group. Reads public/sfx/cand/manifest.json (built offline). Plain DOM overlay; not
// linked from the game. Taps resume the AudioContext (user gesture) and play through Web Audio.

export interface PackCandidate {
  key: string;
  file: string;
  source: string;
  dur: number;
}

export interface PackSlot {
  slot: string;
  label: string;
  group: string;
  candidates: PackCandidate[];
}

/** Validates the manifest shape and returns its slots in file order. Throws on malformed input. */
export function parsePackManifest(data: unknown): PackSlot[] {
  if (!Array.isArray(data)) throw new Error('manifest is not an array');
  return data.map((raw, i): PackSlot => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`slot ${i} is not an object`);
    const r = raw as Record<string, unknown>;
    if (typeof r.slot !== 'string' || typeof r.label !== 'string' || typeof r.group !== 'string') {
      throw new Error(`slot ${i} is missing slot/label/group`);
    }
    if (!Array.isArray(r.candidates)) throw new Error(`slot ${r.slot} has no candidates`);
    const candidates = r.candidates.map((c: unknown): PackCandidate => {
      const k = c as Record<string, unknown>;
      if (typeof k?.key !== 'string' || typeof k.file !== 'string' || typeof k.source !== 'string' || typeof k.dur !== 'number') {
        throw new Error(`slot ${r.slot} has a malformed candidate`);
      }
      return { key: k.key, file: k.file, source: k.source, dur: k.dur };
    });
    return { slot: r.slot, label: r.label, group: r.group, candidates };
  });
}

/** Groups slots by their group name, groups in order of first appearance, slots kept in file order. */
export function groupPackSlots(slots: PackSlot[]): { group: string; slots: PackSlot[] }[] {
  const groups: { group: string; slots: PackSlot[] }[] = [];
  for (const s of slots) {
    let g = groups.find((x) => x.group === s.group);
    if (!g) {
      g = { group: s.group, slots: [] };
      groups.push(g);
    }
    g.slots.push(s);
  }
  return groups;
}

const CAND_DIR = 'sfx/cand/';
const VOLUME = 0.8;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
let current: AudioBufferSourceNode | null = null;
let playToken = 0;

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function stopCurrent(): void {
  if (!current) return;
  current.onended = null;
  try {
    current.stop();
  } catch {
    // Already stopped.
  }
  current = null;
}

/** Fetches and decodes a candidate once; a failed load is dropped from the cache so a later tap retries. */
function loadBuffer(file: string): Promise<AudioBuffer> {
  let p = buffers.get(file);
  if (!p) {
    p = fetch(CAND_DIR + file)
      .then((res) => {
        if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => getContext().decodeAudioData(bytes));
    buffers.set(file, p);
    p.catch(() => buffers.delete(file));
  }
  return p;
}

async function playCandidate(file: string, status: HTMLElement): Promise<void> {
  const token = ++playToken;
  stopCurrent();
  status.textContent = '';
  const c = getContext();
  if (c.state === 'suspended') await c.resume();
  try {
    const buf = await loadBuffer(file);
    // A newer tap while loading takes over.
    if (token !== playToken) return;
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    gain.connect(c.destination);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.onended = () => {
      if (current === src) current = null;
    };
    src.start();
    current = src;
  } catch (err) {
    status.textContent = `載入失敗：${file}（${err instanceof Error ? err.message : String(err)}）`;
  }
}

function button(label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'flex:1 1 0;min-height:44px;min-width:0;margin:0;padding:6px 8px;font-size:22px;font-weight:bold;color:#fff;' +
    'background:#2d3b2d;border:1px solid #6a8a5a;border-radius:6px;touch-action:manipulation;';
  b.addEventListener('click', onTap);
  return b;
}

/** A country heading above its character sections. */
function groupTitle(title: string): HTMLHeadingElement {
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.cssText = 'margin:20px 0 0;font-size:22px;color:#fff;border-bottom:1px solid #6a8a5a;padding-bottom:4px;';
  return h;
}

function slotRow(slot: PackSlot, status: HTMLElement): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'margin:12px 0;padding-bottom:10px;border-bottom:1px solid #2a2a2a;';

  const head = document.createElement('div');
  head.style.cssText = 'font-size:18px;color:#ffd76a;';
  head.textContent = slot.label;
  const id = document.createElement('span');
  id.textContent = `  ${slot.slot}`;
  id.style.cssText = 'font-size:13px;color:#888;';
  head.appendChild(id);
  row.appendChild(head);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;margin:6px 0;';
  for (const c of slot.candidates) {
    buttons.appendChild(button(c.key, () => void playCandidate(c.file, status)));
  }
  row.appendChild(buttons);

  for (const c of slot.candidates) {
    const info = document.createElement('div');
    info.textContent = `${c.key}: ${c.source}  ${c.dur.toFixed(2)} s`;
    info.style.cssText = 'font-size:12px;color:#888;word-break:break-all;margin-top:2px;';
    row.appendChild(info);
  }
  return row;
}

/** Mounts the candidate audition overlay on `parent` (default: document body). */
export function mountPackAudition(parent: HTMLElement = document.body): HTMLElement {
  const root = document.createElement('div');
  root.id = 'sfx-pack';
  root.style.cssText =
    'position:fixed;inset:0;z-index:1000;overflow-y:auto;padding:16px;box-sizing:border-box;' +
    'background:#111;color:#eee;font-family:sans-serif;touch-action:pan-y;';

  const title = document.createElement('h1');
  title.textContent = '候選音效試聽';
  title.style.cssText = 'margin:0 0 8px;font-size:22px;';
  root.appendChild(title);

  const note = document.createElement('p');
  note.textContent =
    '每格聽 A/B/C，告訴我每格要哪個（例如 kick_pass B）。全部都不好也可以說「重找」。';
  note.style.cssText = 'margin:0 0 8px;font-size:15px;line-height:1.5;color:#ccc;';
  root.appendChild(note);

  const status = document.createElement('div');
  status.style.cssText = 'min-height:20px;font-size:14px;color:#ff8a8a;';
  root.appendChild(status);

  parent.appendChild(root);

  fetch('sfx/cand/manifest.json')
    .then((res) => {
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      return res.json() as Promise<unknown>;
    })
    .then((data) => {
      for (const group of groupPackSlots(parsePackManifest(data))) {
        root.appendChild(groupTitle(group.group));
        for (const slot of group.slots) root.appendChild(slotRow(slot, status));
      }
    })
    .catch((err: unknown) => {
      status.textContent = `無法載入候選清單：${err instanceof Error ? err.message : String(err)}`;
    });

  return root;
}
