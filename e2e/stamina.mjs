// Stamina bar check. Shu is home and the human is Guan Yu (idx 1), so the shu players (idx 0-4) are his team: each has a
// stamina bar named 'stambar:<idx>' over the name, and the wei players (idx 5-9) have none. Their staminas are set through
// window.__sg: 100% (馬超), 45% (趙雲) and 15% (諸葛亮) show green, yellow and red on screen; 張飛 and the human 關羽 get 70% and 90%.
// Screenshot: test-results/stamina-bars.png. Usage: node e2e/stamina.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/stamina.mjs <url>');
  process.exit(2);
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results');
mkdirSync(outDir, { recursive: true });
const shot = (name) => resolve(outDir, name);

const errors = [];
let failed = false;

function report(name, ok, detail = '') {
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
}

function matchUrl() {
  const url = new URL(base);
  url.searchParams.set('quick', '1');
  url.searchParams.set('ai', '0');
  url.searchParams.set('home', 'shu');
  url.searchParams.set('away', 'wei');
  url.searchParams.set('human', '1');
  return url.toString();
}

// Read-only: which stamina bars exist, and the fill texture of each own-team bar.
const readBars = () =>
  window.__sg.state().players.map((p) => {
    const bar = window.__sg.findByName(`stambar:${p.idx}`);
    return {
      idx: p.idx,
      team: p.team,
      hasBar: bar !== null,
      visible: bar ? bar.visible : false,
      fill: bar ? bar.list.find((o) => o.visible && o.texture.key.startsWith('stamina-fill')).texture.key : null,
      stamina: p.stamina / p.maxStamina,
    };
  });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto(matchUrl(), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });

  const before = await page.evaluate(readBars);
  const humanTeam = before[1].team;
  const own = before.filter((b) => b.team === humanTeam);
  const opponents = before.filter((b) => b.team !== humanTeam);
  report(
    'each own-team player has a stamina bar',
    own.length === 5 && own.every((b) => b.hasBar && b.visible),
    `own bars ${own.map((b) => `${b.idx}:${b.hasBar ? 'yes' : 'no'}`).join(' ')}`,
  );
  report(
    'opponents have no stamina bar',
    opponents.length === 5 && opponents.every((b) => !b.hasBar),
    `opponent bars ${opponents.map((b) => `${b.idx}:${b.hasBar ? 'yes' : 'no'}`).join(' ')}`,
  );

  // Own-team staminas: 100%, 45% and 15% for three visible players, 70% and 90% for the other two.
  const levels = { 0: 0.7, 1: 0.9, 2: 0.15, 3: 1, 4: 0.45 };
  await page.evaluate((levels) => {
    const s = window.__sg.state();
    for (const [idx, f] of Object.entries(levels)) {
      const p = s.players[Number(idx)];
      p.stamina = p.maxStamina * f;
    }
  }, levels);
  await page.waitForTimeout(250);
  const after = await page.evaluate(readBars);
  const want = (ratio) => (ratio > 0.6 ? 'stamina-fill-green' : ratio >= 0.3 ? 'stamina-fill-yellow' : 'stamina-fill-red');
  const colours = own.map((b) => {
    const now = after[b.idx];
    return { idx: b.idx, ratio: now.stamina, fill: now.fill, ok: now.fill === want(now.stamina) };
  });
  report(
    'fill colour follows stamina (green above 60%, yellow 30-60%, red below 30%)',
    colours.every((c) => c.ok),
    colours.map((c) => `${c.idx}: ${(c.ratio * 100).toFixed(0)}% ${c.fill}`).join(', '),
  );
  await page.screenshot({ path: shot('stamina-bars.png') });
  console.log(`screenshot: ${shot('stamina-bars.png')}`);
  await page.context().close();
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.log(`errors (${errors.length}):`);
  for (const line of errors) console.log(`  ${line}`);
  failed = true;
} else {
  console.log('console errors: none');
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
