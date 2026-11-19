// Regenerates the stadium, ball and goal-post art from art-src/ into public/sprites/.
// Usage: node tools/make-stadium-assets.mjs
// Inputs: art-src/stadium-layers.png, art-src/ball-goal.png, art-src/soldiers-sheet.png
// Outputs: stadium-bg.png, stadium-grass.png, stadium-fg.png (opaque, 1024 px wide),
//          soldiers.png/json (via tools/make-sprite.mjs), ball.png/json (8x1 strip of 48 px frames),
//          goal-post.png/json (left pillar), goal-bar.png (crossbar between the pillars),
//          test-results/stadium-assets-preview.png (contact sheet on mid grey).
// Pixel work runs in a headless Chromium canvas (Playwright from mountain-race-dev), like tools/make-sprite.mjs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artDir = resolve(repoRoot, 'art-src');
const spriteDir = resolve(repoRoot, 'public/sprites');
const previewPath = resolve(repoRoot, 'test-results/stadium-assets-preview.png');

// Field layers: a seam is cross-faded when the wrap seam (rightmost vs leftmost column) differs by more than this
// (mean per channel). The fade length is in source pixels (78 px of the 1672 px source is about 48 px at 1024 wide).
const SEAM_THRESHOLD = 8;
const FADE_SRC = 78;
const LAYER_WIDTH = 1024;

// Runs in the page. Every pixel helper lives inside so the function can be serialised.
function work(job) {
  const canvasOf = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const load = async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return img;
  };
  // Reads a region; anything outside the image is white (so it counts as background).
  const readRegion = (img, sx, sy, sw, sh) => {
    const c = canvasOf(sw, sh);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, sw, sh);
    x.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return x.getImageData(0, 0, sw, sh).data;
  };
  const toCanvas = (w, h, rgba) => {
    const c = canvasOf(w, h);
    c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    return c;
  };
  const scaleTo = (src, w, h) => {
    const c = canvasOf(w, h);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    return c;
  };
  // Background removal: near-white, low saturation, reachable from the crop border (or outside keepFn).
  // White areas enclosed by outlines (ball panels, highlights) stay opaque. Edge pixels next to removed area
  // get partial alpha by whiteness and are un-premultiplied against white (1 px feather, no white halo).
  const cutout = (d, w, h, ox, oy, keepFn) => {
    const N = w * h;
    const minc = new Uint8Array(N);
    const maxc = new Uint8Array(N);
    const bg = new Uint8Array(N);
    const keep = new Uint8Array(N);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const q = p * 4;
        const mn = Math.min(d[q], d[q + 1], d[q + 2]);
        const mx = Math.max(d[q], d[q + 1], d[q + 2]);
        minc[p] = mn;
        maxc[p] = mx;
        bg[p] = mn >= 232 && mx - mn <= 18 ? 1 : 0;
        keep[p] = !keepFn || keepFn(ox + x, oy + y) ? 1 : 0;
      }
    }
    const outside = new Uint8Array(N);
    const stack = [];
    const seed = (p) => {
      if (!outside[p] && (bg[p] || !keep[p])) {
        outside[p] = 1;
        stack.push(p);
      }
    };
    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    while (stack.length > 0) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (y > 0) seed(p - w);
      if (y < h - 1) seed(p + w);
    }
    const removed = new Uint8Array(N);
    for (let p = 0; p < N; p++) removed[p] = outside[p] || !keep[p] ? 1 : 0;
    const nearRemoved = (p) => {
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && removed[ny * w + nx]) return true;
        }
      }
      return false;
    };
    const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const rgba = new Uint8ClampedArray(N * 4);
    for (let p = 0; p < N; p++) {
      if (removed[p]) continue;
      let r = d[p * 4];
      let g = d[p * 4 + 1];
      let b = d[p * 4 + 2];
      let a = 255;
      if (minc[p] > 90 && nearRemoved(p)) {
        a = Math.min(1, Math.max(0, 1 - (minc[p] - 90) / 150));
        if (a < 0.02) continue;
        r = clamp((r - 255 * (1 - a)) / a);
        g = clamp((g - 255 * (1 - a)) / a);
        b = clamp((b - 255 * (1 - a)) / a);
        a = Math.round(a * 255);
      }
      rgba[p * 4] = r;
      rgba[p * 4 + 1] = g;
      rgba[p * 4 + 2] = b;
      rgba[p * 4 + 3] = a;
    }
    return rgba;
  };
  const inRects = (rects, x, y) => rects.some((r) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]);
  const isArtPx = (d, p) => {
    const q = p * 4;
    const mn = Math.min(d[q], d[q + 1], d[q + 2]);
    const mx = Math.max(d[q], d[q + 1], d[q + 2]);
    return !(mn >= 232 && mx - mn <= 18);
  };

  const ops = {
    // Three horizontal strips separated by white bands. Crops each strip (3 px inside the bands), checks the
    // horizontal seam, cross-fades it when needed, and scales to LAYER_WIDTH.
    async layers(args) {
      const img = await load(args.src);
      const W = img.width;
      const H = img.height;
      const full = readRegion(img, 0, 0, W, H);
      const whiteRuns = [];
      let ws = -1;
      for (let y = 0; y <= H; y++) {
        let white = 0;
        if (y < H) for (let x = 0; x < W; x++) if (!isArtPx(full, y * W + x)) white++;
        const isWhite = y < H && white / W > 0.97;
        if (isWhite && ws < 0) ws = y;
        if (!isWhite && ws >= 0) {
          if (y - ws >= 10) whiteRuns.push([ws, y - 1]);
          ws = -1;
        }
      }
      const bands = [];
      let start = 0;
      for (const [a, b] of whiteRuns) {
        bands.push([start, a - 1]);
        start = b + 1;
      }
      bands.push([start, H - 1]);
      if (bands.length !== args.names.length) {
        throw new Error(`expected ${args.names.length} strips, found ${bands.length}: ${JSON.stringify(bands)}`);
      }
      const outs = [];
      for (let i = 0; i < bands.length; i++) {
        const [b0, b1] = bands[i];
        const y0 = i === 0 ? 0 : b0 + 3;
        const y1 = i === bands.length - 1 ? H - 1 : b1 - 3;
        const h = y1 - y0 + 1;
        const A = readRegion(img, 0, y0, W, h);
        let lit = 0;
        let wrap = 0;
        for (let y = 0; y < h; y++) {
          for (let c = 0; c < 3; c++) {
            for (let k = 0; k < 4; k++) lit += Math.abs(A[(y * W + k) * 4 + c] - A[(y * W + W - 4 + k) * 4 + c]);
            wrap += Math.abs(A[(y * W + W - 1) * 4 + c] - A[(y * W) * 4 + c]);
          }
        }
        const litMean = lit / (h * 12);
        const wrapMean = wrap / (h * 3);
        const fade = wrapMean > args.seamThreshold;
        let src;
        if (fade) {
          const N = args.fadeSrc;
          const L = W - N;
          const o = new Uint8ClampedArray(L * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < L; x++) {
              const t = x < N ? x / N : 1;
              for (let c = 0; c < 3; c++) {
                const head = A[(y * W + x) * 4 + c];
                const v = x < N ? (1 - t) * A[(y * W + L + x) * 4 + c] + t * head : head;
                o[(y * L + x) * 4 + c] = v;
              }
              o[(y * L + x) * 4 + 3] = 255;
            }
          }
          src = toCanvas(L, h, o);
        } else {
          src = toCanvas(W, h, A);
        }
        const tw = args.width;
        const th = Math.round((h * tw) / src.width);
        const out = scaleTo(src, tw, th);
        outs.push({
          name: args.names[i],
          dataUrl: out.toDataURL('image/png'),
          band: [y0, y1],
          seamLiteral: +(litMean).toFixed(2),
          seamWrap: +(wrapMean).toFixed(2),
          crossfade: fade,
          size: [tw, th],
        });
      }
      return outs;
    },

    // Ball row: 8 balls on white. Each ball is found by its own bounding box (column runs of non-background),
    // centred in one shared square frame, cut out and scaled to frameSize px.
    async ball(args) {
      const img = await load(args.src);
      const W = img.width;
      const H = img.height;
      const full = readRegion(img, 0, 0, W, H);
      let yTop = -1;
      let yBot = -1;
      for (let y = 0; y < args.yMax; y++) {
        let n = 0;
        for (let x = 0; x < W; x++) if (isArtPx(full, y * W + x)) n++;
        if (n > 3) {
          if (yTop < 0) yTop = y;
          yBot = y;
        }
      }
      const colArt = new Array(W).fill(false);
      for (let x = 0; x < W; x++) {
        for (let y = yTop; y <= yBot; y++) {
          if (isArtPx(full, y * W + x)) {
            colArt[x] = true;
            break;
          }
        }
      }
      const runs = [];
      let rs = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && colArt[x];
        if (on && rs < 0) rs = x;
        if (!on && rs >= 0) {
          runs.push([rs, x - 1]);
          rs = -1;
        }
      }
      if (runs.length !== args.count) throw new Error(`expected ${args.count} balls, found ${runs.length}`);
      const boxes = runs.map(([x0, x1]) => {
        let by0 = -1;
        let by1 = -1;
        for (let y = yTop; y <= yBot; y++) {
          for (let x = x0; x <= x1; x++) {
            if (isArtPx(full, y * W + x)) {
              if (by0 < 0) by0 = y;
              by1 = y;
              break;
            }
          }
        }
        return { x0, x1, y0: by0, y1: by1, cx: (x0 + x1) / 2, cy: (by0 + by1) / 2, w: x1 - x0 + 1, h: by1 - by0 + 1 };
      });
      const S = Math.max(...boxes.map((b) => Math.max(b.w, b.h))) + args.pad;
      const strip = canvasOf(args.frame * args.count, args.frame);
      const sx = strip.getContext('2d');
      sx.imageSmoothingQuality = 'high';
      boxes.forEach((b, i) => {
        const ox = Math.round(b.cx - S / 2);
        const oy = Math.round(b.cy - S / 2);
        const d = readRegion(img, ox, oy, S, S);
        const rgba = cutout(d, S, S, ox, oy, null);
        const frame = scaleTo(toCanvas(S, S, rgba), args.frame, args.frame);
        sx.drawImage(frame, i * args.frame, 0);
      });
      return {
        dataUrl: strip.toDataURL('image/png'),
        boxes: boxes.map((b) => [b.x0, b.y0, b.w, b.h]),
        square: S,
      };
    },

    // Crops a rectangle of the source, keeps only the areas of `includes` (if given, minus `excludes`), removes
    // the background, then scales to a fixed height or width. Returns the foot (bottom-centre of the last row).
    async cut(args) {
      const img = await load(args.src);
      const [x0, y0, w, h] = args.rect;
      const d = readRegion(img, x0, y0, w, h);
      const keepFn = args.includes
        ? (x, y) => inRects(args.includes, x, y) && !inRects(args.excludes || [], x, y)
        : null;
      const cc = toCanvas(w, h, cutout(d, w, h, x0, y0, keepFn));
      let tw;
      let th;
      if (args.height) {
        th = args.height;
        tw = Math.round((w * th) / h);
      } else {
        tw = args.width;
        th = Math.round((h * tw) / w);
      }
      const out = scaleTo(cc, tw, th);
      const od = out.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, tw, th).data;
      let footX = -1;
      let footY = -1;
      for (let y = th - 1; y >= 0 && footY < 0; y--) {
        let minx = -1;
        let maxx = -1;
        for (let x = 0; x < tw; x++) {
          if (od[(y * tw + x) * 4 + 3] >= 128) {
            if (minx < 0) minx = x;
            maxx = x;
          }
        }
        if (minx >= 0) {
          footY = y;
          footX = Math.round((minx + maxx) / 2);
        }
      }
      return { dataUrl: out.toDataURL('image/png'), width: tw, height: th, footX, footY };
    },

    // Contact sheet: draws the given images at their positions on a grey background.
    async compose(args) {
      const c = canvasOf(args.width, args.height);
      const x = c.getContext('2d');
      x.fillStyle = args.bg;
      x.fillRect(0, 0, args.width, args.height);
      for (const it of args.items) {
        const img = await load(it.dataUrl);
        x.imageSmoothingQuality = 'high';
        x.drawImage(img, it.x, it.y, it.w || img.width, it.h || img.height);
      }
      return c.toDataURL('image/png');
    },
  };
  return ops[job.op](job);
}

const dataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`;
const savePng = (path, url) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64'));
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let layers;
let ball;
let post;
let bar;
try {
  const page = await browser.newPage();
  layers = await page.evaluate(work, {
    op: 'layers',
    src: dataUrl(resolve(artDir, 'stadium-layers.png')),
    names: ['stadium-bg', 'stadium-grass', 'stadium-fg'],
    seamThreshold: SEAM_THRESHOLD,
    fadeSrc: FADE_SRC,
    width: LAYER_WIDTH,
  });
  ball = await page.evaluate(work, {
    op: 'ball',
    src: dataUrl(resolve(artDir, 'ball-goal.png')),
    yMax: 240,
    count: 8,
    pad: 8,
    frame: 48,
  });
  // Left pillar: dragon head with snout (above y 392 it may extend right over the crossbar), pillar and base.
  // The back post and rope net are excluded, the crossbar is cut at the pillar edge (x 446).
  const postIncludes = [
    [286, 252, 246, 140],
    [286, 392, 160, 488],
    [286, 880, 167, 110],
  ];
  post = await page.evaluate(work, {
    op: 'cut',
    src: dataUrl(resolve(artDir, 'ball-goal.png')),
    rect: [286, 252, 246, 738],
    includes: postIncludes,
    excludes: [[286, 470, 46, 410]],
    height: 160,
  });
  // Crossbar between the pillars (red beam with cloud ornament).
  bar = await page.evaluate(work, {
    op: 'cut',
    src: dataUrl(resolve(artDir, 'ball-goal.png')),
    rect: [500, 372, 610, 100],
    width: 300,
  });
} finally {
  await browser.close();
}

const layerFiles = {};
for (const l of layers) {
  savePng(resolve(spriteDir, `${l.name}.png`), l.dataUrl);
  layerFiles[l.name] = l;
  console.log(`${l.name}: band ${l.band.join('-')}, ${l.size[0]}x${l.size[1]}, seam literal ${l.seamLiteral} wrap ${l.seamWrap}, crossfade ${l.crossfade}`);
}
savePng(resolve(spriteDir, 'ball.png'), ball.dataUrl);
writeFileSync(resolve(spriteDir, 'ball.json'), `${JSON.stringify({ frameWidth: 48, frameHeight: 48, cols: 8, rows: 1 }, null, 2)}\n`);
console.log(`ball boxes (x,y,w,h): ${JSON.stringify(ball.boxes)}, square ${ball.square}`);
savePng(resolve(spriteDir, 'goal-post.png'), post.dataUrl);
writeFileSync(
  resolve(spriteDir, 'goal-post.json'),
  `${JSON.stringify({ width: post.width, height: post.height, footX: post.footX, footY: post.footY }, null, 2)}\n`,
);
savePng(resolve(spriteDir, 'goal-bar.png'), bar.dataUrl);

// Soldiers: 4 x 6 grid, scaled so each frame is about 120 px tall (native frame 256 x 253).
execFileSync(
  process.execPath,
  [resolve(repoRoot, 'tools/make-sprite.mjs'), resolve(artDir, 'soldiers-sheet.png'), resolve(spriteDir, 'soldiers.png'), '--rows', '6', '--scale', '0.4743'],
  { stdio: 'inherit', cwd: repoRoot },
);

// Contact sheet.
const PV_SCALE = 0.6;
const bgS = layerFiles['stadium-bg'];
const grS = layerFiles['stadium-grass'];
const fgS = layerFiles['stadium-fg'];
const bgH = Math.round(bgS.size[1] * PV_SCALE);
const grH = Math.round(grS.size[1] * PV_SCALE);
const fgH = Math.round(fgS.size[1] * PV_SCALE);
const LW = Math.round(LAYER_WIDTH * PV_SCALE);
const tileW = Math.round(LAYER_WIDTH * 0.3);
const tileH = Math.round(grS.size[1] * 0.3);
const sheetY = {
  bg: 10,
  grass: 10 + bgH + 10,
  fg: 10 + bgH + 10 + grH + 10,
};
const tileY = sheetY.fg + fgH + 20;
const spriteY = tileY + tileH + 30;
const soldiersUrl = dataUrl(resolve(spriteDir, 'soldiers.png'));
const postUrl = post.dataUrl;
const barUrl = bar.dataUrl;
const sheetH = spriteY + 720 + 20;
const items = [
  { dataUrl: bgS.dataUrl, x: 10, y: sheetY.bg, w: LW, h: bgH },
  { dataUrl: grS.dataUrl, x: 10, y: sheetY.grass, w: LW, h: grH },
  { dataUrl: fgS.dataUrl, x: 10, y: sheetY.fg, w: LW, h: fgH },
  { dataUrl: grS.dataUrl, x: 10, y: tileY, w: tileW, h: tileH },
  { dataUrl: grS.dataUrl, x: 10 + tileW, y: tileY, w: tileW, h: tileH },
  { dataUrl: grS.dataUrl, x: 10 + 2 * tileW, y: tileY, w: tileW, h: tileH },
  { dataUrl: soldiersUrl, x: 10, y: spriteY },
  { dataUrl: ball.dataUrl, x: 520, y: spriteY },
  { dataUrl: postUrl, x: 520, y: spriteY + 70, w: post.width * 1.5, h: post.height * 1.5 },
  { dataUrl: barUrl, x: 620, y: spriteY + 70 },
];
const browser2 = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser2.newPage();
  const sheet = await page.evaluate(work, { op: 'compose', width: 1000, height: sheetH, bg: '#808080', items });
  savePng(previewPath, sheet);
} finally {
  await browser2.close();
}
console.log(`post ${post.width}x${post.height}, foot (${post.footX}, ${post.footY}); bar ${bar.width}x${bar.height}`);
console.log(`wrote ${previewPath}`);
