// Da Qiao check: wu DF (idx 6, away roster slot 1) as the human on a phone landscape view (844×390, dpr 2, touch).
// Checks the sprite loads (no 404), the idle and run loops, the fan slash on J without the ball (attack pose and fan fx), and the
// portal cast on L with no ball: the cast pose (special) and the magic circle forming (fx:form). Screenshots go to the scratchpad daqiao folder.
// Usage: node e2e/sprite-daqiao.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sprite-daqiao.mjs <url>');
  process.exit(2);
}

const FIELD_MID_Y = 130;
const FIELD_MID_X = 300;
const outDir = '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/daqiao';
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
  url.searchParams.set('away', 'wu');
  url.searchParams.set('human', '6');
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

/** Human snapshot: sprite animation, sim action, visible effects and the last hint. */
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
      vx: p.vx,
      fxNames,
      lastHint: sg.lastHint(),
    };
  });

/** Test-only: the human stands mid-field, facing +x, with full stamina and no cooldown, and the ball lies far away. */
const readyHuman = (page) =>
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
      s.ball.ownerIdx = -1;
      s.ball.lastTouchIdx = -1;
      s.ball.special = null;
      s.ball.x = 60;
      s.ball.y = 70;
      s.ball.z = 0;
      s.ball.vx = 0;
      s.ball.vy = 0;
      s.ball.vz = 0;
    },
    { x: FIELD_MID_X, y: FIELD_MID_Y },
  );

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
  // Every frame, latches which effects were visible (short-lived ones included).
  await page.evaluate(() => {
    window.__fxSeen = [];
    const loop = () => {
      for (const c of window.__sg.scene.children.list) {
        if (typeof c.name !== 'string' || !c.name.startsWith('fx:') || !c.visible) continue;
        if (!window.__fxSeen.includes(c.name)) window.__fxSeen.push(c.name);
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
  await readyHuman(page);
  await page.waitForTimeout(800);

  // Idle, then walk right.
  const idle = await human(page);
  report('daqiao uses a sprite', idle.charId === 'daqiao' && idle.hasSprite, `charId ${idle.charId}`);
  report('idle animation', idle.anim === 'sprite-daqiao:idle' || idle.anim === 'sprite-daqiao:run', `anim ${idle.anim}`);
  await page.screenshot({ path: shot('dq-1-idle.png') });

  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  const walk = await human(page);
  report('run animation while moving', walk.anim === 'sprite-daqiao:run', `anim ${walk.anim}, vx ${walk.vx.toFixed(1)}`);
  await page.screenshot({ path: shot('dq-2-walk.png') });
  await page.keyboard.up('d');
  await page.waitForTimeout(400);

  // Fan slash: J without the ball is a punch, which plays the attack pose and the fan slash streak.
  await page.keyboard.down('j');
  await page.waitForFunction(() => window.__sg.scene.children.list.some((c) => c.name === 'fx:slash' && c.visible), null, {
    timeout: 1500,
  }).catch(() => {});
  const slash = await human(page);
  report('J without the ball plays the attack sprite', slash.anim === 'sprite-daqiao:attack', `anim ${slash.anim}, action ${slash.action}`);
  report('J starts the fan slash effect', slash.fxNames.includes('fx:slash'), `effects ${slash.fxNames.join(',') || 'none'}`);
  await page.screenshot({ path: shot('dq-3-attack-fan.png') });
  await page.keyboard.up('j');
  await page.waitForTimeout(800);

  // Portal: L without the ball casts 時空之門 at once. The cast pose plays and the magic circle forms on the ground.
  await readyHuman(page);
  await page.waitForTimeout(200);
  await page.keyboard.down('l');
  await page.waitForFunction(() => window.__sg.state().portals.length > 0, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(120);
  const cast = await human(page);
  report('portal cast uses the special (cast) pose', cast.anim === 'sprite-daqiao:special', `anim ${cast.anim}, action ${cast.action}`);
  const castFx = await page.evaluate(() => window.__fxSeen);
  report('portal cast forms the magic circle (fx:form)', castFx.includes('fx:form'), `effects ${castFx.join(',') || 'none'}`);
  report('L without the ball casts the portal (no 需持球 hint)', cast.lastHint !== '需持球', `hint ${cast.lastHint}`);
  await page.screenshot({ path: shot('dq-4-cast.png') });
  await page.keyboard.up('l');

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
