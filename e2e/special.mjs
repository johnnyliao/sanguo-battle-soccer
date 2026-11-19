// Special check. Guan Yu (shu DF, human=1) charges a full shot and releases it into a rampage (aura + fire sprite).
// Zhang Fei (shu GK, human=0) holds J without the ball next to an opponent until the roar fires (shockwave, stun, HUD cooldown).
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
      roarHoldTicks: p.roarHoldTicks,
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

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  // Rampage: Guan Yu charges with the ball, releases at full charge.
  const guan = await openMatch(browser, 1);
  await giveBall(guan, 400, 130);
  await guan.waitForTimeout(400);
  await guan.keyboard.down('j');
  await guan.waitForTimeout(1200);
  await guan.keyboard.up('j');
  await guan.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].rampageTicks > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  const r0 = await human(guan);
  report('rampage starts on full charge release', r0.rampageTicks > 0 && r0.ownsBall, `rampageTicks ${r0.rampageTicks}, ownsBall ${r0.ownsBall}`);
  report('rampage starts the special cooldown', r0.specialCooldown > 0, `specialCooldown ${r0.specialCooldown}`);
  await guan.waitForFunction(() => window.__sg.scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key === 'sprite-guanyu:rampage', null, {
    timeout: 3000,
  }).catch(() => {});
  const r1 = await human(guan);
  report('rampage plays the fire loop sprite', r1.anim === 'sprite-guanyu:rampage', `anim ${r1.anim}`);
  await guan.screenshot({ path: shot('special-rampage.png') });
  await guan.close();

  // Roar: Zhang Fei holds J without the ball, with two opponents inside the roar circle (out of punch reach).
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
  await zhang.keyboard.down('j');
  await zhang.waitForTimeout(600);
  const mid = await human(zhang);
  await zhang.screenshot({ path: shot('special-roar-hold.png') });
  await zhang.waitForTimeout(600);
  await zhang.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].specialCooldown > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  // Read the victim in the same tick as the cooldown check: the stun lasts 1 s, the screenshot takes longer.
  const { roared, victim } = await zhang.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    const v = s.players[5];
    return {
      roared: { specialCooldown: h.specialCooldown, roarHoldTicks: h.roarHoldTicks },
      victim: { action: v.action, stamina: v.stamina },
    };
  });
  await zhang.screenshot({ path: shot('special-roar.png') });
  await zhang.keyboard.up('j');
  report('roar builds while J is held without the ball', mid.roarHoldTicks > 0 && mid.roarHoldTicks < 60, `roarHoldTicks mid-hold ${mid.roarHoldTicks}`);
  report('roar fires after the hold and starts the cooldown', roared.specialCooldown > 0, `specialCooldown ${roared.specialCooldown}`);
  report(
    'roar stuns the opponent in the circle',
    victim.action === 'hitstun' || victim.action === 'down',
    `victim action ${victim.action}, stamina ${opponentBefore.toFixed(1)} -> ${victim.stamina.toFixed(1)}`,
  );
  await zhang.close();
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
