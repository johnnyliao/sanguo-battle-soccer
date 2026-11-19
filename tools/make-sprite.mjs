// Turns a character sheet (grid of frames on white, with or without black ground lines) into a transparent sprite sheet.
// Usage: node tools/make-sprite.mjs <input sheet.png> <output sprite.png> [--scale <factor>] [--keep-white]
// Writes <output>.png (uniform frames, packed, transparent), <output>.json (frameWidth, frameHeight,
// cols, rows, anchorX, anchorY) and test-results/<name>-preview.png for a visual check.
// --scale downscales the packed sheet (frame size and anchor in the json are scaled to match).
// Without ground lines, the ground of each row is the median foot row of its frames.
// Image processing runs in a headless Chromium canvas (Playwright from mountain-race-dev).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const COLS = 4;
const ROWS = 5;
const PAD = 3;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const scaleAt = argv.indexOf('--scale');
const SCALE = scaleAt >= 0 ? Number(argv[scaleAt + 1]) : 1;
if (scaleAt >= 0) argv.splice(scaleAt, 2);
// --keep-white keeps enclosed white areas opaque (white capes / armour) instead of removing large pockets.
const keepAt = argv.indexOf('--keep-white');
const KEEP_WHITE = keepAt >= 0;
if (keepAt >= 0) argv.splice(keepAt, 1);
const [inArg, outArg] = argv;
if (!inArg || !outArg || !(SCALE > 0 && SCALE <= 1)) {
  console.error('usage: node tools/make-sprite.mjs <input sheet.png> <output sprite.png> [--scale <0-1>]');
  process.exit(2);
}
const inPath = resolve(process.cwd(), inArg);
const outPath = resolve(process.cwd(), outArg);
const metaPath = outPath.replace(/\.png$/, '.json');
const previewPath = resolve(repoRoot, 'test-results', `${basename(outPath, '.png')}-preview.png`);

// Runs in the page. Everything the pixel work needs is inside this function.
function processSheet({ dataUrl, cols, rows, pad, scale, keepWhite }) {
  return (async () => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const W = img.width;
    const H = img.height;
    const cnv = document.createElement('canvas');
    cnv.width = W;
    cnv.height = H;
    const cx = cnv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, W, H).data;
    const N = W * H;

    const minc = new Uint8Array(N);
    const maxc = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      const r = src[p * 4];
      const g = src[p * 4 + 1];
      const b = src[p * 4 + 2];
      minc[p] = Math.min(r, g, b);
      maxc[p] = Math.max(r, g, b);
    }
    // Background: near-white and low saturation (spec: min >= 232, max - min <= 18).
    const isBg = (p) => minc[p] >= 232 && maxc[p] - minc[p] <= 18;
    const isDark = (p) => minc[p] < 70;
    const warnings = [];

    // 1) Row bands: runs of rows that contain art (more than 2 non-background pixels).
    const rowArt = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (!isBg(y * W + x)) rowArt[y]++;
    }
    const bands = [];
    let start = -1;
    for (let y = 0; y <= H; y++) {
      const art = y < H && rowArt[y] > 2;
      if (art && start < 0) start = y;
      if (!art && start >= 0) {
        if (y - start >= 40) bands.push([start, y - 1]);
        start = -1;
      }
    }
    if (bands.length !== rows) {
      throw new Error(`expected ${rows} row bands, found ${bands.length}: ${JSON.stringify(bands)}`);
    }

    // 2) Ground lines: dark horizontal runs of at least 120 px. Per band, the bottom-most such row is the
    //    line; up to 3 contiguous rows above it belong to the same line. Each cell has its own segment.
    const LINE_MIN = 120;
    const darkRuns = (y, minLen) => {
      const runs = [];
      let s = -1;
      for (let x = 0; x <= W; x++) {
        const d = x < W && isDark(y * W + x);
        if (d && s < 0) s = x;
        if (!d && s >= 0) {
          if (x - s >= minLen) runs.push([s, x - 1]);
          s = -1;
        }
      }
      return runs;
    };
    const lineOf = ([y0, y1]) => {
      let yb = -1;
      for (let y = y1; y >= y0; y--) {
        if (darkRuns(y, LINE_MIN).length > 0) {
          yb = y;
          break;
        }
      }
      if (yb < 0) return null;
      let yt = yb;
      while (yt - 1 >= y0 && yb - yt < 3 && darkRuns(yt - 1, LINE_MIN).length > 0) yt--;
      const segs = [];
      for (let y = yt; y <= yb; y++) {
        for (const [s, e] of darkRuns(y, 30)) segs.push({ y, s, e });
      }
      return { yt, yb, segs };
    };
    // Ground-line mode only when every row band has its line. Otherwise (no lines, as on hand-drawn sheets) the
    // ground of each row is the median foot row of its frames; nothing is removed as a line in that mode.
    const detected = bands.map(lineOf);
    const lineMode = detected.every((l) => l !== null);
    let lines = lineMode ? detected : null;

    // 3) Column gutters: valleys of the summed art profile near the expected cut positions.
    const colArt = new Array(W).fill(0);
    for (const [y0, y1] of bands) {
      for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < W; x++) if (!isBg(y * W + x)) colArt[x]++;
      }
    }
    const cuts = [0];
    for (let k = 1; k < cols; k++) {
      const expect = Math.round((W * k) / cols);
      // Without ground lines the sheet is a regular grid; spear tips reaching into the gutters would move the valley.
      if (!lineMode) {
        cuts.push(expect);
        continue;
      }
      let best = expect;
      let bestV = Infinity;
      for (let x = expect - 40; x <= expect + 40; x++) {
        let v = 0;
        for (let d = -3; d <= 3; d++) v += colArt[Math.min(W - 1, Math.max(0, x + d))];
        if (v < bestV || (v === bestV && Math.abs(x - expect) < Math.abs(best - expect))) {
          bestV = v;
          best = x;
        }
      }
      cuts.push(best);
    }
    cuts.push(W);
    const cellW = [];
    for (let c = 0; c < cols; c++) cellW.push(cuts[c + 1] - cuts[c]);
    const FW = Math.max(...cellW);
    const frameX0 = [];
    for (let c = 0; c < cols; c++) frameX0.push(cuts[c] - Math.floor((FW - cellW[c]) / 2));

    // 3b) No ground lines: per row band, the ground is the median foot row of its cells. A foot row is the lowest
    //     row inside the cell with at least FOOT_MIN art pixels, so a thin spear tip sticking down does not count.
    if (!lineMode) {
      const FOOT_MIN = 10;
      lines = bands.map(([y0, y1], r) => {
        const feet = [];
        for (let c = 0; c < cols; c++) {
          let foot = -1;
          for (let y = y1; y >= y0 && foot < 0; y--) {
            let n = 0;
            for (let x = cuts[c]; x < cuts[c + 1]; x++) if (!isBg(y * W + x)) n++;
            if (n >= FOOT_MIN) foot = y;
          }
          if (foot < 0) throw new Error(`no feet found in row ${r} col ${c}`);
          feet.push(foot);
        }
        feet.sort((a, b) => a - b);
        const y = feet[Math.floor(feet.length / 2)];
        return { yt: y, yb: y, segs: [] };
      });
    }

    // 4) Vertical: same frame height for every row; ground line at the same frame y.
    const above = [];
    const below = [];
    for (let r = 0; r < rows; r++) {
      const [y0, y1] = bands[r];
      const { yt, yb } = lines[r];
      let artTop = -1;
      for (let y = y0; y < yt; y++) {
        if (rowArt[y] > 2) {
          artTop = y;
          break;
        }
      }
      let artBot = yb;
      for (let y = y1; y > yb; y--) {
        if (rowArt[y] > 2) {
          artBot = y;
          break;
        }
      }
      if (artTop < 0) throw new Error(`no art above the ground line in row ${r}`);
      above.push(yt - artTop);
      below.push(artBot - yb);
    }
    const G = Math.max(...above) + pad;
    const B = Math.max(0, ...below) + pad;
    const FH = G + B;
    const frameY0 = lines.map((l) => l.yt - G);

    // 5) Mark what is removed: ground-line pixels (plus their grey anti-aliasing), then background
    //    connected to the sheet border. The flood fill may pass through removed line pixels, otherwise the
    //    white between the wheels and the line would look enclosed.
    const lineMask = new Uint8Array(N);
    const isGrey = (p) => maxc[p] - minc[p] <= 40;
    for (const l of lines) {
      for (const seg of l.segs) {
        for (let x = seg.s; x <= seg.e; x++) {
          const p = seg.y * W + x;
          if (minc[p] < 225 && isGrey(p)) lineMask[p] = 1;
        }
      }
      // Light grey anti-aliasing just above and below the line (dark pixels there may be tyres, keep them).
      for (const y of [l.yt - 1, l.yb + 1]) {
        for (const seg of l.segs) {
          for (let x = seg.s; x <= seg.e; x++) {
            const p = y * W + x;
            if (minc[p] >= 90 && minc[p] < 225 && isGrey(p)) lineMask[p] = 1;
          }
        }
      }
    }
    const outside = new Uint8Array(N);
    const stack = [];
    const seed = (p) => {
      if (!outside[p] && (isBg(p) || lineMask[p])) {
        outside[p] = 1;
        stack.push(p);
      }
    };
    for (let x = 0; x < W; x++) {
      seed(x);
      seed((H - 1) * W + x);
    }
    for (let y = 0; y < H; y++) {
      seed(y * W);
      seed(y * W + W - 1);
    }
    while (stack.length > 0) {
      const p = stack.pop();
      const x = p % W;
      const y = (p - x) / W;
      if (x > 0) seed(p - 1);
      if (x < W - 1) seed(p + 1);
      if (y > 0) seed(p - W);
      if (y < H - 1) seed(p + W);
    }
    // 6) Enclosed background pockets (white not reachable from the border). Large flat pockets are background
    //    (e.g. the gap between a weapon and a sleeve); small ones stay opaque because they can be eyes or highlights.
    const POCKET_MIN = keepWhite ? Infinity : 250;
    const pocketSeen = new Uint8Array(N);
    const pockets = [];
    for (let p0 = 0; p0 < N; p0++) {
      if (pocketSeen[p0] || outside[p0] || lineMask[p0] || !isBg(p0)) continue;
      const comp = [p0];
      pocketSeen[p0] = 1;
      for (let i = 0; i < comp.length; i++) {
        const p = comp[i];
        const x = p % W;
        const y = (p - x) / W;
        const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of nb) {
          if (q >= 0 && !pocketSeen[q] && !outside[q] && !lineMask[q] && isBg(q)) {
            pocketSeen[q] = 1;
            comp.push(q);
          }
        }
      }
      if (comp.length >= POCKET_MIN) {
        for (const q of comp) outside[q] = 1;
      } else if (comp.length >= 20) {
        const xs = comp.map((p) => p % W);
        const ys = comp.map((p) => Math.floor(p / W));
        pockets.push(`${comp.length}px at x${Math.min(...xs)}-${Math.max(...xs)} y${Math.min(...ys)}-${Math.max(...ys)}`);
      }
    }
    const removed = new Uint8Array(N);
    for (let p = 0; p < N; p++) removed[p] = outside[p] || lineMask[p] ? 1 : 0;

    // 7) Alpha: opaque everywhere except removed pixels. Edge pixels next to removed area that are light
    //    get partial alpha by whiteness, and their color is un-premultiplied against white (no white halo).
    const nearRemoved = (p) => {
      const x = p % W;
      const y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (removed[ny * W + nx]) return true;
        }
      }
      return false;
    };
    const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const outRGBA = (p) => {
      if (removed[p]) return [0, 0, 0, 0];
      const r = src[p * 4];
      const g = src[p * 4 + 1];
      const b = src[p * 4 + 2];
      if (minc[p] > 90 && nearRemoved(p)) {
        const a = Math.min(1, Math.max(0, 1 - (minc[p] - 90) / 150));
        if (a < 0.02) return [0, 0, 0, 0];
        return [
          clamp255((r - 255 * (1 - a)) / a),
          clamp255((g - 255 * (1 - a)) / a),
          clamp255((b - 255 * (1 - a)) / a),
          Math.round(a * 255),
        ];
      }
      return [r, g, b, 255];
    };

    // 8) Pack the frames tightly into the output sheet. A frame only takes art from its own cell (x range
    //    between the gutters) and its own row band, so neighbours never leak in.
    const outW = FW * cols;
    const outH = FH * rows;
    const ob = new Uint8ClampedArray(outW * outH * 4);
    const clipWarnings = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let clipped = 0;
        for (let dy = 0; dy < FH; dy++) {
          for (let dx = 0; dx < FW; dx++) {
            const sx = frameX0[c] + dx;
            const sy = frameY0[r] + dy;
            const oi = ((r * FH + dy) * outW + (c * FW + dx)) * 4;
            if (sx < cuts[c] || sx >= cuts[c + 1] || sy < bands[r][0] || sy > bands[r][1]) continue;
            const [R, Gc, Bc, A] = outRGBA(sy * W + sx);
            ob[oi] = R;
            ob[oi + 1] = Gc;
            ob[oi + 2] = Bc;
            ob[oi + 3] = A;
            if (A > 0 && (sx === cuts[c] || sx === cuts[c + 1] - 1)) clipped++;
          }
        }
        if (clipped > 0) clipWarnings.push(`row ${r} col ${c}: ${clipped} px on the cell boundary (art may be clipped)`);
      }
    }
    warnings.push(...clipWarnings);

    // 9) Anchor X: center between the two wheels, from dark pixels in the strip just above the ground line.
    const candidates = [];
    for (let r = 0; r < rows; r++) {
      const { yt } = lines[r];
      for (let c = 0; c < cols; c++) {
        if (!lineMode) {
          // Feet: columns of the strip just above the ground that hold a solid run of art (boots, not the spear).
          const solid = [];
          for (let x = cuts[c]; x < cuts[c + 1]; x++) {
            let n = 0;
            for (let y = Math.max(0, yt - 6); y <= yt; y++) if (!isBg(y * W + x) && !removed[y * W + x]) n++;
            if (n >= 3) solid.push(x);
          }
          if (solid.length > 0) {
            candidates.push({ r, c, x: (solid[0] + solid[solid.length - 1]) / 2 - frameX0[c] });
          }
          continue;
        }
        const xs = [];
        for (let y = Math.max(0, yt - 7); y <= yt - 2; y++) {
          for (let x = cuts[c]; x < cuts[c + 1]; x++) {
            const p = y * W + x;
            if (!removed[p] && isDark(p)) xs.push(x);
          }
        }
        if (xs.length === 0) continue;
        xs.sort((a, b) => a - b);
        const clusters = [];
        let cs = xs[0];
        let ce = xs[0];
        for (let i = 1; i < xs.length; i++) {
          if (xs[i] - ce > 5) {
            clusters.push([cs, ce]);
            cs = xs[i];
          }
          ce = xs[i];
        }
        clusters.push([cs, ce]);
        if (clusters.length < 2) continue;
        const left = clusters[0];
        const right = clusters[clusters.length - 1];
        const mid = ((left[0] + left[1]) / 2 + (right[0] + right[1]) / 2) / 2;
        candidates.push({ r, c, x: mid - frameX0[c] });
      }
    }
    if (candidates.length === 0) throw new Error('no wheel clusters found for the anchor');
    const sortedX = candidates.map((k) => k.x).sort((a, b) => a - b);
    const anchorX = Math.round(sortedX[Math.floor(sortedX.length / 2)]);
    const anchorY = G;

    // 10) Output sheet and preview (frames over a green field and a checkerboard, anchor marked in red).
    const toUrl = (w, h, data) => {
      const o = document.createElement('canvas');
      o.width = w;
      o.height = h;
      const octx = o.getContext('2d');
      octx.putImageData(new ImageData(data, w, h), 0, 0);
      return o;
    };
    const fullCanvas = toUrl(outW, outH, ob);
    // Optional downscale: every frame is resized on its own cell, so the frame size stays an integer.
    const outFW = Math.round(FW * scale);
    const outFH = Math.round(FH * scale);
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = outFW * cols;
    sheetCanvas.height = outFH * rows;
    const sctx = sheetCanvas.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        sctx.drawImage(fullCanvas, c * FW, r * FH, FW, FH, c * outFW, r * outFH, outFW, outFH);
      }
    }
    const pw = outW * 2 + 16;
    const pv = document.createElement('canvas');
    pv.width = pw;
    pv.height = outH;
    const pctx = pv.getContext('2d');
    pctx.fillStyle = '#3f8f3a';
    pctx.fillRect(0, 0, outW, outH);
    for (let y = 0; y < outH; y += 12) {
      for (let x = 0; x < outW; x += 12) {
        pctx.fillStyle = ((x + y) / 12) % 2 === 0 ? '#c8c8c8' : '#ffffff';
        pctx.fillRect(outW + 16 + x, y, 12, 12);
      }
    }
    pctx.drawImage(fullCanvas, 0, 0);
    pctx.drawImage(fullCanvas, outW + 16, 0);
    pctx.strokeStyle = '#ff2020';
    pctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const ox of [0, outW + 16]) {
          const ax = ox + c * FW + anchorX;
          const ay = r * FH + anchorY;
          pctx.beginPath();
          pctx.moveTo(ax - 5, ay + 0.5);
          pctx.lineTo(ax + 5, ay + 0.5);
          pctx.moveTo(ax + 0.5, ay - 5);
          pctx.lineTo(ax + 0.5, ay + 5);
          pctx.stroke();
        }
      }
    }

    return {
      sheetUrl: sheetCanvas.toDataURL('image/png'),
      previewUrl: pv.toDataURL('image/png'),
      meta: { frameWidth: outFW, frameHeight: outFH, cols, rows, anchorX: Math.round(anchorX * scale), anchorY: Math.round(anchorY * scale) },
      debug: {
        size: [W, H],
        bands,
        lineRows: lines.map((l) => [l.yt, l.yb]),
        lineSegments: lines.map((l) => l.segs.length),
        cuts,
        frameX0,
        frameY0,
        above,
        below,
        pockets,
        anchorCandidates: candidates.map((k) => `r${k.r}c${k.c}=${k.x.toFixed(1)}`),
      },
      warnings,
    };
  })();
}

const dataUrl = `data:image/png;base64,${readFileSync(inPath).toString('base64')}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(processSheet, { dataUrl, cols: COLS, rows: ROWS, pad: PAD, scale: SCALE, keepWhite: KEEP_WHITE });
} finally {
  await browser.close();
}

const pngBytes = (url) => Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
mkdirSync(dirname(outPath), { recursive: true });
mkdirSync(dirname(previewPath), { recursive: true });
writeFileSync(outPath, pngBytes(result.sheetUrl));
writeFileSync(metaPath, `${JSON.stringify(result.meta, null, 2)}\n`);
writeFileSync(previewPath, pngBytes(result.previewUrl));

const m = result.meta;
console.log(`source ${result.debug.size.join('x')}; bands ${JSON.stringify(result.debug.bands)}`);
console.log(`ground lines (yTop,yBottom): ${JSON.stringify(result.debug.lineRows)}; segments per row: ${result.debug.lineSegments.join(',')}`);
console.log(`column cuts: ${result.debug.cuts.join(', ')}`);
console.log(`above ground per row: ${result.debug.above.join(',')}; below: ${result.debug.below.join(',')}`);
console.log(`frame ${m.frameWidth}x${m.frameHeight}, grid ${m.cols}x${m.rows}, anchor (${m.anchorX}, ${m.anchorY})`);
console.log(`enclosed pockets kept opaque (20-249 px): ${result.debug.pockets.length}`);
console.log(`anchor candidates: ${result.debug.anchorCandidates.join(' ')}`);
for (const w of result.warnings) console.log(`warning: ${w}`);
console.log(`wrote ${outPath} (${(pngBytes(result.sheetUrl).length / 1024).toFixed(1)} KB)`);
console.log(`wrote ${metaPath}`);
console.log(`wrote ${previewPath}`);
