// Special check. Guan Yu (shu DF, human=1) presses L with the ball and rampages at once (aura + fire sprite).
// Zhang Fei (shu GK, human=0) presses L without the ball next to two opponents: the roar fires at once (shockwave, stun, HUD cooldown).
// Quick taps: touch 大招 / 攻擊 with CDP touchStart + touchEnd back to back (no wait), so press and release fall between
// two samples. Without the ball 大招 shows the 需持球 hint.
// Test-only state edits (ball owner, positions, stamina) go through window.__sg. Usage: node e2e/special.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/special.mjs <url>');
  process.exit(2);
}

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

function matchUrl(human) {
  const url = new URL(base);
  url.searchParams.set('quick', '1');
  url.searchParams.set('ai', '0');
  url.searchParams.set('home', 'shu');
  url.searchParams.set('away', 'wei');
  url.searchParams.set('human', String(human));
  return url.toString();
}

function attachListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.url().includes('/sprites/') && res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });
}

async function openMatch(browser, human) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachListeners(page);
  await page.goto(matchUrl(human), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  return page;
}

/** Human state snapshot for assertions (read-only). */
const human = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    const s = sg.state();
    const p = s.players[sg.humanIdx];
    const view = sg.scene.playerViews[sg.humanIdx];
    return {
      anim: view.sprite?.anims.currentAnim?.key ?? null,
      hasSprite: view.sprite !== null,
      action: p.action,
      rampageTicks: p.rampageTicks,
      specialCooldown: p.specialCooldown,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      ownsBall: s.ball.ownerIdx === p.idx,
    };
  });

/** Test-only: gives the human the ball in front of them at (x, y), facing +x, with full stamina and no cooldown. */
const giveBall = (page, x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const s = window.__sg.state();
      const h = s.players[window.__sg.humanIdx];
      h.x = x;
      h.y = y;
      h.facingX = 1;
      h.facingY = 0;
      h.stamina = h.maxStamina;
      h.specialCooldown = 0;
      s.ball.x = h.x + h.facingX * (h.radius + 4);
      s.ball.y = h.y;
      s.ball.z = 0;
      s.ball.vx = 0;
      s.ball.vy = 0;
      s.ball.vz = 0;
      s.ball.special = null;
      s.ball.ownerIdx = h.idx;
      s.ball.lastTouchIdx = h.idx;
    },
    { x, y },
  );

/** Phone-sized touch context on a match (Guan Yu, human=1). Returns the page and its CDP session. */
async function openTouchMatch(browser, human) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  attachListeners(page);
  const cdp = await context.newCDPSession(page);
  await page.goto(matchUrl(human), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  return { context, page, cdp };
}

/** Page point of a touch button, given its offset from the bottom-right corner of the logical view (same as TouchControls). */
async function buttonPoint(page, offX, offY) {
  const box = await page.locator('canvas').first().boundingBox();
  const view = await page.evaluate(() => window.__sgView);
  const s = box.width / view.W;
  return { x: box.x + (view.W - offX) * s, y: box.y + (view.H - offY) * s };
}

/** Press and release with no wait in between: both land between two 60 Hz samples unless latched. */
async function quickTap(cdp, p) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  // Rampage: Guan Yu holds the ball and taps L (no charge).
  const guan = await openMatch(browser, 1);
  await giveBall(guan, 400, 130);
  await guan.waitForTimeout(400);
  await guan.keyboard.down('l');
  await guan.waitForTimeout(120);
  await guan.keyboard.up('l');
  await guan.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].rampageTicks > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  const r0 = await human(guan);
  report('rampage starts at once on L with the ball', r0.rampageTicks > 0 && r0.ownsBall, `rampageTicks ${r0.rampageTicks}, ownsBall ${r0.ownsBall}`);
  report('rampage starts the 12 s special cooldown', r0.specialCooldown > 0 && r0.specialCooldown <= 720, `specialCooldown ${r0.specialCooldown}`);
  await guan.waitForFunction(() => window.__sg.scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key === 'sprite-guanyu:rampage', null, {
    timeout: 3000,
  }).catch(() => {});
  const r1 = await human(guan);
  report('rampage plays the fire loop sprite', r1.anim === 'sprite-guanyu:rampage', `anim ${r1.anim}`);
  await guan.screenshot({ path: shot('special-rampage.png') });
  await guan.close();

  // Roar: Zhang Fei taps L without the ball, with two opponents inside the roar circle (out of punch reach).
  const zhang = await openMatch(browser, 0);
  await zhang.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.facingX = 1;
    h.facingY = 0;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    s.players[5].x = 390;
    s.players[5].y = 130;
    s.players[6].x = 330;
    s.players[6].y = 200;
    s.ball.x = 330;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
  });
  const opponentBefore = await zhang.evaluate(() => window.__sg.state().players[5].stamina);
  await zhang.waitForTimeout(300);
  await zhang.keyboard.down('l');
  await zhang.waitForTimeout(120);
  await zhang.keyboard.up('l');
  await zhang.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].specialCooldown > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  // Read the victim in the same tick as the cooldown check: the stun lasts 1 s, the screenshot takes longer.
  const { roared, victim } = await zhang.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    const v = s.players[5];
    return {
      roared: { specialCooldown: h.specialCooldown, ownsBall: s.ball.ownerIdx === h.idx },
      victim: { action: v.action, stamina: v.stamina },
    };
  });
  await zhang.screenshot({ path: shot('special-roar.png') });
  report('roar fires at once on L without the ball and starts the cooldown', roared.specialCooldown > 0 && roared.specialCooldown <= 720, `specialCooldown ${roared.specialCooldown}`);
  report(
    'roar stuns the opponent in the circle',
    victim.action === 'hitstun' || victim.action === 'down',
    `victim action ${victim.action}, stamina ${opponentBefore.toFixed(1)} -> ${victim.stamina.toFixed(1)}`,
  );
  await zhang.close();

  // Quick taps on the touch buttons (Guan Yu, phone context).
  const touch = await openTouchMatch(browser, 1);
  const tp = touch.page;
  const ballHome = (x, y) => giveBall(tp, x, y);
  const resetRampage = () =>
    tp.evaluate(() => {
      const h = window.__sg.state().players[window.__sg.humanIdx];
      h.rampageTicks = 0;
      h.specialCooldown = 0;
    });

  // a. 大招 quick tap with the ball starts the rampage.
  await ballHome(400, 130);
  await tp.waitForTimeout(300);
  await quickTap(touch.cdp, await buttonPoint(tp, 128, 92));
  await tp.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].rampageTicks > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  const qSpecial = await human(tp);
  report('quick tap on 大招 with the ball starts the rampage', qSpecial.rampageTicks > 0, `rampageTicks ${qSpecial.rampageTicks}`);

  // b. 大招 quick tap without the ball shows the 需持球 hint; the dimmed button caption is shown too.
  await resetRampage();
  await tp.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.stamina = h.maxStamina;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 100;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await tp.waitForTimeout(200);
  const dimCaption = await tp.evaluate(() => window.__sg.scene.touch.blockHint.visible);
  await quickTap(touch.cdp, await buttonPoint(tp, 128, 92));
  await tp.waitForFunction(() => window.__sg.lastHint() === '需持球', null, { timeout: 2000 }).catch(() => {});
  const hint = await tp.evaluate(() => ({
    text: window.__sg.lastHint(),
    visible: window.__sg.scene.hintText.visible,
    rampageTicks: window.__sg.state().players[window.__sg.humanIdx].rampageTicks,
  }));
  await tp.screenshot({ path: shot('hint.png') });
  report(
    'quick tap on 大招 without the ball shows the 需持球 hint',
    hint.text === '需持球' && hint.visible && hint.rampageTicks === 0,
    `hint "${hint.text}", visible ${hint.visible}, rampageTicks ${hint.rampageTicks}`,
  );
  report('dimmed 大招 shows the 需持球 caption without the ball', dimCaption, `caption visible ${dimCaption}`);

  // c. 攻擊 quick tap with the ball releases it (a shot or a clear, either way the ball leaves the human).
  await resetRampage();
  await ballHome(400, 130);
  await tp.waitForTimeout(300);
  await quickTap(touch.cdp, await buttonPoint(tp, 48, 92));
  await tp.waitForFunction(() => window.__sg.state().ball.ownerIdx !== window.__sg.humanIdx, null, { timeout: 3000 }).catch(() => {});
  const released = await tp.evaluate(() => {
    const s = window.__sg.state();
    return { owner: s.ball.ownerIdx, human: window.__sg.humanIdx, vx: s.ball.vx };
  });
  report('quick tap on 攻擊 with the ball releases it', released.owner !== released.human, `owner ${released.owner}, ball vx ${released.vx.toFixed(1)}`);
  await touch.context.close();
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
