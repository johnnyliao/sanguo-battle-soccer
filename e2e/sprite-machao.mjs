// Ma Chao check: shu MF (idx 3) as the human on a phone landscape view (844×390, dpr 2, touch).
// Checks the sprite loads (no 404), the spear attack and the tiger slash on J without the ball, and the summon on L with
// the ball: the call banner, five cavalry riders galloping and knocking down the two opponents, and the riders gone with
// smoke after 3 s. Screenshots go to the scratchpad mc folder.
// Usage: node e2e/sprite-machao.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sprite-machao.mjs <url>');
  process.exit(2);
}

const FIELD_MID_Y = 130;
const SUMMON_X = 300;
const OPPONENT_X = 450;
const outDir = '/tmp/claude-1000/-home-safe3admin/481f0680-3ee3-4058-9195-12539132c87d/scratchpad/mc';
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
  url.searchParams.set('human', '3');
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

/** Human snapshot: sprite animation, sim action, position, ball state, score, visible effects and the last hint. */
const human = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    const s = sg.state();
    const idx = sg.humanIdx;
    const p = s.players[idx];
    const view = sg.scene.playerViews[idx];
    const fxNames = sg.scene.children.list
      .filter((c) => typeof c.name === 'string' && c.name.startsWith('fx:') && c.visible)
      .map((c) => c.name);
    return {
      charId: p.charId,
      hasSprite: view.sprite !== null,
      anim: view.sprite?.anims.currentAnim?.key ?? null,
      action: p.action,
      x: p.x,
      ownsBall: s.ball.ownerIdx === idx,
      special: s.ball.special?.kind ?? null,
      score: [...s.match.score],
      riders: s.riders.length,
      fxNames,
      lastHint: sg.lastHint(),
    };
  });

/** Test-only: gives the human the ball at (x, y), facing +x, with full stamina and no cooldown. */
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

/** Test-only: two wei opponents stand 150 px in front of the human, idle (ai is off). */
const placeOpponents = (page) =>
  page.evaluate(
    ({ x, y }) => {
      const s = window.__sg.state();
      const [a, b] = [s.players[5], s.players[6]];
      a.x = x;
      a.y = y - 12;
      b.x = x;
      b.y = y + 16;
      for (const v of [a, b]) {
        v.action = 'idle';
        v.facingX = -1;
        v.facingY = 0;
      }
    },
    { x: SUMMON_X + 150, y: FIELD_MID_Y },
  );

/** Test-only: the ball lies far from the human, unowned, so J is a punch. */
const dropBallFar = (page) =>
  page.evaluate(() => {
    const s = window.__sg.state();
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 60;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let context = null;
try {
  context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  attachListeners(page);
  await page.goto(matchUrl(), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  // Every frame, records the rider sprites seen, their animations, the effects seen, and the players knocked down.
  await page.evaluate(() => {
    window.__riderNamesSeen = [];
    window.__riderAnimsSeen = [];
    window.__riderMax = 0;
    window.__fxSeen = [];
    window.__downSeen = [];
    const loop = () => {
      const s = window.__sg.state();
      window.__riderMax = Math.max(window.__riderMax, s.riders.length);
      for (const c of window.__sg.scene.children.list) {
        if (typeof c.name !== 'string') continue;
        if (c.name.startsWith('rider:') && !window.__riderNamesSeen.includes(c.name)) window.__riderNamesSeen.push(c.name);
        if (c.name.startsWith('fx:') && c.visible && !window.__fxSeen.includes(c.name)) window.__fxSeen.push(c.name);
        if (c.name.startsWith('rider:')) {
          const key = c.list.find((x) => x.anims)?.anims.currentAnim?.key;
          if (key && !window.__riderAnimsSeen.includes(key)) window.__riderAnimsSeen.push(key);
        }
      }
      s.players.forEach((p) => {
        if (p.action === 'down' && !window.__downSeen.includes(p.idx)) window.__downSeen.push(p.idx);
      });
      requestAnimationFrame(loop);
    };
    loop();
  });

  await giveBall(page, SUMMON_X, FIELD_MID_Y);
  await page.waitForTimeout(800);
  const idle = await human(page);
  report('machao uses a sprite', idle.charId === 'machao' && idle.hasSprite, `charId ${idle.charId}`);
  report('idle animation', idle.anim === 'sprite-machao:idle' || idle.anim === 'sprite-machao:run', `anim ${idle.anim}`);
  await page.screenshot({ path: shot('mc-1-idle.png') });

  // Spear attack: J without the ball is a punch, which starts the tiger slash and the spear attack pose.
  await dropBallFar(page);
  await page.waitForTimeout(300);
  await page.keyboard.down('j');
  await page.waitForFunction(() => window.__sg.scene.children.list.some((c) => c.name === 'fx:slash' && c.visible), null, {
    timeout: 1500,
  }).catch(() => {});
  const slash = await human(page);
  report('J without the ball plays the attack sprite', slash.anim === 'sprite-machao:attack', `anim ${slash.anim}, action ${slash.action}`);
  report('J starts the tiger slash effect', slash.fxNames.includes('fx:slash'), `effects ${slash.fxNames.join(',') || 'none'}`);
  await page.screenshot({ path: shot('mc-2-slash.png') });
  await page.keyboard.up('j');
  await page.waitForTimeout(1200);

  // Summon: L with the ball. The call banner plays and five riders appear around him.
  await giveBall(page, SUMMON_X, FIELD_MID_Y);
  await placeOpponents(page);
  await page.waitForTimeout(300);
  const before = await human(page);
  report('summon needs the ball (ball held)', before.ownsBall, `ownsBall ${before.ownsBall}`);
  await page.keyboard.down('l');
  await page.waitForFunction(() => window.__sg.state().riders.length > 0, null, { timeout: 2000 }).catch(() => {});
  await page.screenshot({ path: shot('mc-3-summon.png') });
  const summoned = await human(page);
  report('summon starts five riders', summoned.riders === 5, `riders ${summoned.riders}`);
  report('summon banner effect plays', summoned.fxNames.includes('fx:summon') || (await page.evaluate(() => window.__fxSeen.includes('fx:summon'))), `effects ${summoned.fxNames.join(',') || 'none'}`);
  await page.keyboard.up('l');

  // About 1 s after the call: the riders are galloping and hitting the opponents.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot('mc-4-gallop.png') });

  // After 3.5 s the riders have expired: their sprites are removed and the smoke plays.
  await page.waitForFunction(() => window.__sg.state().riders.length === 0, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(100);
  await page.screenshot({ path: shot('mc-5-expired.png') });
  const expired = await page.evaluate(() => ({
    riderNodes: window.__sg.scene.children.list.filter((c) => typeof c.name === 'string' && c.name.startsWith('rider:')).length,
    riderMax: window.__riderMax,
    names: window.__riderNamesSeen.length,
    anims: window.__riderAnimsSeen,
    down: window.__downSeen,
    fx: window.__fxSeen,
    riderState: window.__sg.state().riders.length,
  }));
  report('five rider sprites existed', expired.riderMax === 5 && expired.names === 5, `max ${expired.riderMax}, sprites ${expired.names}`);
  const knocked = expired.down.filter((i) => i >= 5);
  report('an opponent went down', knocked.length > 0, `down idx ${knocked.join(',') || 'none'}`);
  report('rider charge animation played', expired.anims.includes('rider-charge'), `anims ${expired.anims.join(',')}`);
  report('riders removed after expiry', expired.riderNodes === 0 && expired.riderState === 0, `sprites ${expired.riderNodes}, sim riders ${expired.riderState}`);
  report('riders leave smoke', expired.fx.includes('fx:smoke'), `effects ${expired.fx.join(',')}`);

  await context.close();
  context = null;
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
  if (context) await context.close();
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
