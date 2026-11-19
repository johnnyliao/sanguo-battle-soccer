// Sprite check: Guan Yu (shu DF, idx 1) as the human, rendered from the sprite sheet.
// Captures idle, run and attack poses on desktop plus a mobile shot, and checks the sprite loaded (no 404) and
// that the animation follows the sim action. Usage: node e2e/sprite.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sprite.mjs <url>');
  process.exit(2);
}
const url = new URL(base);
url.searchParams.set('quick', '1');
url.searchParams.set('ai', '0');
url.searchParams.set('home', 'shu');
url.searchParams.set('away', 'wei');
url.searchParams.set('human', '1');

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results');
mkdirSync(outDir, { recursive: true });
const shot = (name) => resolve(outDir, name);

const errors = [];
const results = [];
let failed = false;

function report(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
}

/** Sprite state for the human: the texture-backed sprite object and its current animation key. */
const humanSprite = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    const idx = sg.humanIdx;
    const view = sg.scene.playerViews[idx];
    const p = sg.state().players[idx];
    return {
      charId: p.charId,
      hasSprite: view.sprite !== null,
      anim: view.sprite?.anims.currentAnim?.key ?? null,
      action: p.action,
      vx: p.vx,
      flipX: view.sprite?.flipX ?? null,
      x: p.x,
    };
  });

const waitPlay = (page) =>
  page.waitForFunction(() => Boolean(window.__sg) && window.__sg.state().match.phase === 'play', null, {
    timeout: 20000,
  });

/** Test-only: moves the human just behind the ball so the camera (which follows the ball) shows the sprite. */
const placeHumanNearBall = (page) =>
  page.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = s.ball.x - 70;
    h.y = s.ball.y;
  });

function attachListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.url().includes('/sprites/') && res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  // Desktop: idle, run, attack.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachListeners(page);
  await page.goto(url.toString(), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await waitPlay(page);
  await placeHumanNearBall(page);
  await page.waitForTimeout(1000);

  const idle = await humanSprite(page);
  report('guanyu uses a sprite', idle.charId === 'guanyu' && idle.hasSprite, `charId ${idle.charId}`);
  report('idle animation', idle.anim === 'sprite-guanyu:idle' || idle.anim === 'sprite-guanyu:run', `anim ${idle.anim}`);
  await page.screenshot({ path: shot('sprite-1-idle.png') });

  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  const run = await humanSprite(page);
  report('run animation while moving', run.anim === 'sprite-guanyu:run', `anim ${run.anim}, vx ${run.vx.toFixed(1)}`);
  await page.screenshot({ path: shot('sprite-2-run.png') });
  await page.waitForTimeout(200);
  await page.keyboard.up('d');
  await page.waitForTimeout(500);

  await page.keyboard.down('j');
  await page.waitForTimeout(90);
  const attack = await humanSprite(page);
  report('attack animation on J', attack.anim === 'sprite-guanyu:attack', `anim ${attack.anim}, action ${attack.action}`);
  await page.screenshot({ path: shot('sprite-3-attack.png') });
  await page.keyboard.up('j');
  await page.waitForTimeout(600);
  await page.close();

  // Mobile: landscape phone size.
  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  attachListeners(mobile);
  await mobile.goto(url.toString(), { waitUntil: 'load', timeout: 20000 });
  await mobile.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await waitPlay(mobile);
  await placeHumanNearBall(mobile);
  await mobile.waitForTimeout(1000);
  const mob = await humanSprite(mobile);
  report('mobile sprite', mob.hasSprite && mob.charId === 'guanyu', `anim ${mob.anim}`);
  await mobile.screenshot({ path: shot('sprite-4-mobile.png') });
  await mobile.close();
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
  console.log('console errors: none, sprite requests ok');
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
