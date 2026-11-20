// Skill preview check: team select (phone touch) -> 預覽 on each character -> the special fires -> back to team select.
// Covers 關羽 / 張飛 / 趙雲 / 諸葛亮 / 馬超 (shu roster) and 張遼 (wei roster). Screenshots go to the scratchpad preview dir;
// the fear shot (fear-zhangliao.png) is taken during Zhang Liao's fear, with the victims feared.
// Usage: node e2e/preview.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/preview.mjs <url>');
  process.exit(2);
}
const outDir = '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/preview';
mkdirSync(outDir, { recursive: true });
const shot = (name) => resolve(outDir, name);

// Expected sim event per preview: the special fires (special), then its effect.
const CASES = [
  { id: 'zhangfei', name: '張飛', slot: 0, effect: 'roar' },
  { id: 'guanyu', name: '關羽', slot: 1, effect: 'specialShot' },
  { id: 'zhugeliang', name: '諸葛亮', slot: 2, effect: 'beamStrike' },
  { id: 'machao', name: '馬超', slot: 3, effect: 'riderSpawn' },
  { id: 'zhaoyun', name: '趙雲', slot: 4, effect: 'lungeStart' },
  { id: 'zhangliao', name: '張遼', slot: 4, effect: 'fear', wei: true },
];

const errors = [];
const results = [];
let failed = false;

function report(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
}

const tap = async (page, key) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(80);
  await page.keyboard.up(key);
};
const waitScene = (page, name, timeout = 8000) =>
  page.waitForFunction((n) => window.__sgScene === n, name, { timeout }).then(
    () => true,
    () => false,
  );
const waitMenu = (page, criteria, timeout = 5000) =>
  page
    .waitForFunction(
      (c) => {
        const m = window.__sgMenu?.();
        if (!m) return false;
        return Object.entries(c).every(([k, v]) => m[k] === v);
      },
      criteria,
      { timeout },
    )
    .then(
      () => true,
      () => false,
    );

// Logical view point -> page pixel (the canvas fills the viewport).
async function toPage(page, x, y) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  const view = await page.evaluate(() => window.__sgView);
  const s = box.width / view.W;
  return { x: box.x + x * s, y: box.y + y * s };
}

/** Taps the 預覽 button of a general-stage row (touch). */
async function tapPreview(page, slot) {
  const rect = await page.evaluate((s) => window.__sgMenu().previewRect(s), slot);
  const p = await toPage(page, rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.touchscreen.tap(p.x, p.y);
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(base, { waitUntil: 'load', timeout: 20000 });
  const titleOk = await waitScene(page, 'TitleScene', 15000);
  if (!titleOk) throw new Error('title scene did not appear');

  // Title -> own country (shu) -> opponent (wei) -> general stage (shu roster).
  await tap(page, 'j');
  await waitScene(page, 'TeamSelectScene');
  await tap(page, 'd');
  await tap(page, 'j');
  await waitMenu(page, { stage: 'opp', own: 'shu' });
  await tap(page, 'j');
  const generalOk = await waitMenu(page, { stage: 'general', own: 'shu', opp: 'wei' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('team-select-general-shu.png') });
  report('0 team select general (shu vs wei) with 預覽 buttons', generalOk);
  if (!generalOk) throw new Error('general stage did not appear');

  let woke = false;
  for (const c of CASES) {
    if (c.wei && !woke) {
      // Back to the country stages: own -> wei, then opponent shu, then the wei roster.
      await tap(page, 'k');
      await waitMenu(page, { stage: 'opp' });
      await tap(page, 'k');
      await waitMenu(page, { stage: 'own' });
      await tap(page, 'a');
      await waitMenu(page, { stage: 'own', cursor: 0 });
      await tap(page, 'j');
      await waitMenu(page, { stage: 'opp', own: 'wei' });
      await tap(page, 'j');
      const weiGeneral = await waitMenu(page, { stage: 'general', own: 'wei', opp: 'shu' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot('team-select-general-wei.png') });
      report('0b team select general (wei vs shu)', weiGeneral);
      if (!weiGeneral) throw new Error('wei general stage did not appear');
      woke = true;
    }

    const name = `${c.name} (${c.id})`;
    await tapPreview(page, c.slot);
    const started = await waitScene(page, 'MatchScene');
    const playing = await page
      .waitForFunction(() => Boolean(window.__sg) && window.__sg.state().match.phase === 'play', null, { timeout: 10000 })
      .then(
        () => true,
        () => false,
      );
    if (!started || !playing) {
      report(`${name} preview starts`, false, `scene ${started}, play ${playing}`);
      throw new Error('preview did not start');
    }
    const banner = await page.evaluate(() => window.__sg.state().players[window.__sg.humanIdx].charId);
    report(`${name} preview human is the character`, banner === c.id, `charId ${banner}`);

    // Wait for the special and its effect event.
    const fired = await page
      .waitForFunction(
        (eff) => {
          const ev = window.__sg.preview().events;
          return ev.includes('special') && ev.includes(eff);
        },
        c.effect,
        { timeout: 6000 },
      )
      .then(
        () => true,
        () => false,
      );
    await page.waitForTimeout(250);
    await page.screenshot({ path: shot(`preview-${c.id}.png`) });
    const events = await page.evaluate(() => window.__sg.preview().events);
    report(`${name} special fires (${c.effect})`, fired, `events ${[...new Set(events)].join(',')}`);

    if (c.effect === 'fear') {
      // Mid-fear (3 s): the victims are feared, and their chains and '!' follow them.
      await page.waitForTimeout(1000);
      const feared = await page.evaluate(() => window.__sg.state().players.filter((p) => p.action === 'fear').length);
      await page.screenshot({ path: shot('fear-zhangliao.png') });
      report(`${name} victims are feared during the fear`, feared > 0, `feared ${feared}`);
    }

    // Back to team select on its own (about 4.5 s after the L press, or after a goal), on the same row.
    const back = await waitScene(page, 'TeamSelectScene', 12000);
    const menu = back ? await page.evaluate(() => window.__sgMenu()) : null;
    const restored = Boolean(menu) && menu.stage === 'general' && menu.own === (c.wei ? 'wei' : 'shu');
    report(`${name} returns to team select`, back && restored, menu ? `stage ${menu.stage}, cursor ${menu.cursor}` : 'no menu');
    if (!back) throw new Error(`${name}: did not return to team select`);
  }
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.log(`console errors (${errors.length}):`);
  for (const line of errors) console.log(`  ${line}`);
  failed = true;
} else {
  console.log('console errors: none');
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
