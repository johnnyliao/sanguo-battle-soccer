// Zhao Yun check: shu FW (idx 4) as the human on a phone landscape view (844×390, dpr 2, touch).
// Checks the sprite loads (no 404), the thrust effect on J without the ball, and the lunge on L with the ball: the
// dragon effect during the dash, the sprite's lunge pose, the burst at the end, and that he moves about LUNGE_DISTANCE.
// Screenshots go to the scratchpad zy folder. Usage: node e2e/sprite-zhaoyun.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sprite-zhaoyun.mjs <url>');
  process.exit(2);
}

const LUNGE_DISTANCE = 200;
const LUNGE_TOLERANCE = 20;
const outDir = '/tmp/claude-1000/-home-safe3admin/481f0680-3ee3-4058-9195-12539132c87d/scratchpad/zy';
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
  url.searchParams.set('human', '4');
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

/** Human snapshot: sprite animation, sim action, position, ball ownership, and the names of live effect sprites. */
const human = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    const s = sg.state();
    const idx = sg.humanIdx;
    const p = s.players[idx];
    const view = sg.scene.playerViews[idx];
    const fx = sg.scene.children.list.filter((c) => typeof c.name === 'string' && c.name.startsWith('fx:'));
    return {
      charId: p.charId,
      hasSprite: view.sprite !== null,
      anim: view.sprite?.anims.currentAnim?.key ?? null,
      action: p.action,
      x: p.x,
      ownsBall: s.ball.ownerIdx === idx,
      fxNames: fx.map((c) => c.name),
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
  // Records every frame which effects are on screen, and the x of each burst (the start burst sits at the start x,
  // the lunge end burst at the end x; he slides a little after the lunge, so the end is found by position, not by sync).
  await page.evaluate(() => {
    window.__fxSeen = [];
    const loop = () => {
      const sg = window.__sg;
      for (const c of sg.scene.children.list) {
        if (typeof c.name !== 'string' || !c.name.startsWith('fx:')) continue;
        const tags = [c.name];
        if (c.name === 'fx:burst') tags.push(`burst@${Math.round(c.x)}`);
        for (const tag of tags) if (!window.__fxSeen.includes(tag)) window.__fxSeen.push(tag);
      }
      requestAnimationFrame(loop);
    };
    loop();
  });

  await giveBall(page, 250, 130);
  await page.waitForTimeout(800);
  const idle = await human(page);
  report('zhaoyun uses a sprite', idle.charId === 'zhaoyun' && idle.hasSprite, `charId ${idle.charId}`);
  report('idle animation', idle.anim === 'sprite-zhaoyun:idle' || idle.anim === 'sprite-zhaoyun:run', `anim ${idle.anim}`);
  await page.screenshot({ path: shot('zy-1-idle.png') });

  // Thrust: J without the ball is a punch, which starts the spear thrust streak.
  await dropBallFar(page);
  await page.waitForTimeout(300);
  await page.keyboard.down('j');
  await page.waitForFunction(() => window.__sg.scene.children.list.some((c) => c.name === 'fx:thrust'), null, {
    timeout: 1500,
  }).catch(() => {});
  const thrust = await human(page);
  report('J without the ball plays the attack sprite', thrust.anim === 'sprite-zhaoyun:attack', `anim ${thrust.anim}, action ${thrust.action}`);
  report('J starts the spear thrust effect', thrust.fxNames.includes('fx:thrust'), `effects ${thrust.fxNames.join(',') || 'none'}`);
  await page.screenshot({ path: shot('zy-2-thrust.png') });
  await page.keyboard.up('j');
  await page.waitForTimeout(800);

  // Lunge: L with the ball dashes about LUNGE_DISTANCE along facing (+x).
  await giveBall(page, 250, 130);
  await page.waitForTimeout(500);
  const before = await human(page);
  await page.keyboard.down('l');
  await page.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'lunge', null, {
    timeout: 2000,
  }).catch(() => {});
  await page.waitForTimeout(90);
  const during = await human(page);
  report('lunge uses the dash pose on L', during.anim === 'sprite-zhaoyun:lunge', `anim ${during.anim}, action ${during.action}`);
  report('lunge shows the dragon effect', during.fxNames.includes('fx:lunge'), `effects ${during.fxNames.join(',') || 'none'}`);
  await page.screenshot({ path: shot('zy-3-lunge.png') });
  await page.keyboard.up('l');

  await page.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action !== 'lunge', null, {
    timeout: 3000,
  }).catch(() => {});
  const after = await human(page);
  const seen = await page.evaluate(() => window.__fxSeen);
  const burstAtEnd = seen.some((t) => t.startsWith('burst@') && Number(t.slice(6)) >= before.x + LUNGE_DISTANCE - LUNGE_TOLERANCE);
  const moved = after.x - before.x;
  report(
    'lunge moves him about 200 px',
    Math.abs(moved - LUNGE_DISTANCE) <= LUNGE_TOLERANCE,
    `moved ${moved.toFixed(1)} px, action ${after.action}`,
  );
  report('lunge keeps the ball', after.ownsBall, `ownsBall ${after.ownsBall}`);
  report('burst effect at the lunge end', burstAtEnd, `bursts ${seen.filter((t) => t.startsWith('burst@')).join(' ') || 'none'}`);
  await page.screenshot({ path: shot('zy-4-burst.png') });
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
