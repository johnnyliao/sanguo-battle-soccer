// Zhuge Liang check: shu MF (idx 2) as the human on a phone landscape view (844×390, dpr 2, touch).
// Checks the sprite loads (no 404), the beam on L with the ball in his own half (no position rule): the channel (cast
// pose and bagua circle, ball kept), then the strike knocks a standing opponent down with the impact at him. Then the
// fan slash on J without the ball. Screenshots go to the scratchpad zg folder.
// Usage: node e2e/sprite-zhugeliang.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sprite-zhugeliang.mjs <url>');
  process.exit(2);
}

const FIELD_MID_Y = 130;
const OWN_HALF_X = 300;
const outDir = '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/zg';
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
  url.searchParams.set('human', '2');
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
  // Every frame, records which effects are visible.
  await page.evaluate(() => {
    window.__fxSeen = [];
    const loop = () => {
      for (const c of window.__sg.scene.children.list) {
        if (typeof c.name !== 'string' || !c.name.startsWith('fx:') || !c.visible) continue;
        if (!window.__fxSeen.includes(c.name)) window.__fxSeen.push(c.name);
      }
      // Latch a rival knockdown: the 1 s knockdown can be over before a slow screenshot returns.
      const st = window.__sg.state();
      const me = st.players[window.__sg.humanIdx];
      if (st.players.some((p) => p.team !== me.team && p.action === 'down')) window.__downSeen = true;
      requestAnimationFrame(loop);
    };
    loop();
  });

  await giveBall(page, OWN_HALF_X, FIELD_MID_Y);
  await page.waitForTimeout(800);
  const idle = await human(page);
  report('zhugeliang uses a sprite', idle.charId === 'zhugeliang' && idle.hasSprite, `charId ${idle.charId}`);
  report('idle animation', idle.anim === 'sprite-zhugeliang:idle' || idle.anim === 'sprite-zhugeliang:run', `anim ${idle.anim}`);
  await page.screenshot({ path: shot('zg-1-idle.png') });

  // Beam in his own half: no position rule. L with the ball starts the channel (cast pose, bagua circle, ball kept).
  await page.keyboard.down('l');
  await page.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'cast', null, {
    timeout: 2000,
  }).catch(() => {});
  await page.waitForTimeout(120);
  const cast = await human(page);
  report('beam channel uses the cast pose', cast.anim === 'sprite-zhugeliang:cast', `anim ${cast.anim}, action ${cast.action}`);
  report('beam channel shows the bagua circle', cast.fxNames.includes('fx:charge'), `effects ${cast.fxNames.join(',') || 'none'}`);
  report('beam channel keeps the ball', cast.ownsBall, `ownsBall ${cast.ownsBall}`);
  report('L in own half starts the beam (no position hint)', cast.action === 'cast' && cast.lastHint !== '需在前半場', `action ${cast.action}, hint ${cast.lastHint}`);
  await page.screenshot({ path: shot('zg-2-own-half-cast.png') });
  await page.keyboard.up('l');

  // The channel ends in a strike on a random standing opponent: he goes down, and the impact plays at him.
  // The channel is 30 sim ticks, and sim time runs slower than wall time in a loaded browser (about 1.1 s to 2.2 s here),
  // so wait for the channel to end (strike, or no target) rather than for a fixed time, then check for a rival down.
  await page
    .waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action !== 'cast', null, { timeout: 8000 })
    .catch(() => {});
  const struck = await page.evaluate(() => window.__downSeen === true);
  await page.waitForTimeout(60);
  const seenStrike = await page.evaluate(() => window.__fxSeen);
  report('beam strike knocks an opponent down', struck, `struck ${struck}`);
  report('beam strike plays the impact effect', seenStrike.includes('fx:impact'), `effects ${seenStrike.join(',')}`);
  await page.screenshot({ path: shot('zg-3-strike.png') });
  await page.waitForTimeout(500);

  // Fan slash: J without the ball is a punch, which starts the fan slash streak.
  await dropBallFar(page);
  await page.waitForTimeout(300);
  await page.keyboard.down('j');
  await page.waitForFunction(() => window.__sg.scene.children.list.some((c) => c.name === 'fx:slash' && c.visible), null, {
    timeout: 1500,
  }).catch(() => {});
  const slash = await human(page);
  report('J without the ball plays the attack sprite', slash.anim === 'sprite-zhugeliang:attack', `anim ${slash.anim}, action ${slash.action}`);
  report('J starts the fan slash effect', slash.fxNames.includes('fx:slash'), `effects ${slash.fxNames.join(',') || 'none'}`);
  await page.screenshot({ path: shot('zg-4-slash.png') });
  await page.keyboard.up('j');
  await page.waitForTimeout(800);

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
