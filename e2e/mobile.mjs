// Mobile touch flow (Playwright, phone emulation): portrait overlay -> title -> team select -> match
// (virtual joystick + J) -> penalty shootout (tap order, touch J) -> result -> title.
// Usage: node e2e/mobile.mjs <url>   (runs with ?half=2&ai=0)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/mobile.mjs <url>');
  process.exit(2);
}
const flowUrl = new URL(base);
flowUrl.searchParams.set('half', '2');
flowUrl.searchParams.set('ai', '0');

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

const waitScene = (page, name, timeout = 8000) =>
  page.waitForFunction((n) => window.__sgScene === n, name, { timeout }).then(
    () => true,
    () => false,
  );
// criteria: { stage?, cursor?, own? } — every given key must match window.__sgMenu().
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
const pkSnapshot = (page) =>
  page.evaluate(() => {
    const st = window.__sg.state();
    const pk = st.match.pk;
    return {
      phase: st.match.phase,
      stage: pk ? pk.stage : null,
      shooterIdx: pk ? pk.shooterIdx : -1,
      keeperIdx: pk ? pk.keeperIdx : -1,
      meterTicks: pk ? pk.meterTicks : -1,
      kicksTaken: pk ? pk.kicks[0].length + pk.kicks[1].length : 0,
      human: window.__sg.humanIdx,
      score: pk ? pk.score : null,
      winner: pk ? pk.winner : -1,
    };
  });
const humanX = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    return sg.state().players[sg.humanIdx].x;
  });

// Logical (640x360) point -> page pixel, via the canvas bounding box (FIT scaling and letterboxing included).
async function toPage(page, x, y) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  return { x: box.x + (x / 640) * box.width, y: box.y + (y / 360) * box.height };
}
const tapLogical = async (page, x, y) => {
  const p = await toPage(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
};

// Matches the on-screen buttons and panels in TouchControls / TeamSelectScene / MatchScene.
const BTN_J = { x: 585, y: 268 };
const BTN_CONFIRM = { x: 520, y: 335 };
const PANEL_SHU = { x: 320, y: 180 };
const PANEL_WU = { x: 510, y: 180 };
const TITLE_TAP = { x: 320, y: 180 };
const ORDER_ROW_Y0 = 98;
const ORDER_ROW_H = 36;

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
  const cdp = await context.newCDPSession(page);
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Held touch on a logical point, moved with CDP so the pointer stays down across steps.
  const touchStart = async (x, y) => {
    const p = await toPage(page, x, y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  };
  const touchMove = async (x, y) => {
    const p = await toPage(page, x, y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  };
  const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await page.goto(flowUrl.toString(), { waitUntil: 'load', timeout: 20000 });
  await waitScene(page, 'TitleScene', 15000);

  // 0. Portrait: the rotate hint covers the game; back in landscape it is hidden.
  const hintVisible = () =>
    page.locator('#rotate-hint').evaluate((el) => getComputedStyle(el).display !== 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const portraitShown = await hintVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const landscapeHidden = !(await hintVisible());
  report('0 portrait shows rotate hint, landscape hides it', portraitShown && landscapeHidden);

  // 1. Title
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('mobile-1-title.png') });
  report('1 title', (await page.evaluate(() => window.__sgScene)) === 'TitleScene');

  // 2. Title tap -> team select (own country stage)
  await tapLogical(page, TITLE_TAP.x, TITLE_TAP.y);
  const ownOk = (await waitScene(page, 'TeamSelectScene')) && (await waitMenu(page, { stage: 'own' }));
  report('2 title tap -> team select', ownOk);
  if (!ownOk) throw new Error('team select did not appear after title tap');

  // 3. Own country: tap shu (moves cursor), tap again (confirm) -> opponent stage
  await tapLogical(page, PANEL_SHU.x, PANEL_SHU.y);
  const shuCursor = await waitMenu(page, { stage: 'own', cursor: 1 });
  await tapLogical(page, PANEL_SHU.x, PANEL_SHU.y);
  const oppOk = await waitMenu(page, { stage: 'opp', own: 'shu' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot('mobile-2-select.png') });
  report('3 own country: tap panel twice confirms', shuCursor && oppOk);

  // 4. Opponent: tap wu (cursor), then 確定 -> general stage
  await tapLogical(page, PANEL_WU.x, PANEL_WU.y);
  const wuCursor = await waitMenu(page, { stage: 'opp', cursor: 2 });
  await tapLogical(page, BTN_CONFIRM.x, BTN_CONFIRM.y);
  const generalOk = await waitMenu(page, { stage: 'general', cursor: 4 });
  report('4 opponent: tap panel + 確定 -> general', wuCursor && generalOk);
  if (!generalOk) throw new Error('general stage did not appear');

  // 5. General: 確定 (default FW) -> match starts
  await tapLogical(page, BTN_CONFIRM.x, BTN_CONFIRM.y);
  const matchOk =
    (await waitScene(page, 'MatchScene')) &&
    (await page
      .waitForFunction(() => Boolean(window.__sg) && window.__sg.state().match.phase === 'play', null, { timeout: 15000 })
      .then(
        () => true,
        () => false,
      ));
  report('5 general 確定 -> match in play', matchOk);
  if (!matchOk) throw new Error('match did not reach play');

  // 6. Touch controls visible during the match
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot('mobile-3-match.png') });

  // 7. Joystick: touch down at (80, 270), move right to (120, 270), hold ~1 s.
  const x0 = await humanX(page);
  await touchStart(80, 270);
  for (let i = 1; i <= 5; i++) {
    await touchMove(80 + i * 8, 270);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(800);
  const x1 = await humanX(page);
  await touchEnd();
  report('7 joystick moves human right', x1 > x0 + 2, `x ${x0.toFixed(1)} -> ${x1.toFixed(1)}`);

  // 8. J button tap -> no errors (checked at the end)
  await tapLogical(page, BTN_J.x, BTN_J.y);
  await page.waitForTimeout(200);

  // 9. PK order overlay: tap the five rows (each tap picks that player, same as J)
  const pkOk = await page
    .waitForFunction(() => Boolean(window.__sg) && window.__sg.state().match.phase === 'pk', null, {
      timeout: 40000,
      polling: 250,
    })
    .then(
      () => true,
      () => false,
    );
  if (!pkOk) {
    const snap = await pkSnapshot(page);
    report('9 match ends level -> pk', false, `phase ${snap.phase}, score ${snap.score}`);
    throw new Error('match did not reach the penalty shootout');
  }
  const orderOpen = await page
    .waitForFunction(
      () => {
        const pk = window.__sg.state().match.pk;
        return Boolean(pk) && pk.stage === 'order' && pk.order[0] === null;
      },
      null,
      { timeout: 5000 },
    )
    .then(
      () => true,
      () => false,
    );
  await page.waitForTimeout(300);
  report('9 pk order overlay open', orderOpen);
  if (!orderOpen) throw new Error('shootout order screen did not open');
  for (let i = 0; i < 5; i++) {
    await tapLogical(page, 320, ORDER_ROW_Y0 + i * ORDER_ROW_H);
    await page.waitForTimeout(150);
  }
  const submitted = await page
    .waitForFunction(
      () => {
        const pk = window.__sg.state().match.pk;
        return Boolean(pk) && pk.stage !== 'order';
      },
      null,
      { timeout: 5000 },
    )
    .then(
      () => true,
      () => false,
    );
  report('9 pk order submitted by taps', submitted);
  if (!submitted) throw new Error('shootout order was not submitted');

  // 10. Shootout: when the human shoots, check the touch hint and hold the J button ~600 ms by touch.
  // Which kicks reach the human depends on the random shootout, so the hint check runs only if they do.
  const human = (await pkSnapshot(page)).human;
  let pkShot = false;
  let humanAim = false;
  let hintOk = false;
  let pressedAtKick = -1;
  let reachedFulltime = false;
  const kickDeadline = Date.now() + 120000;
  while (Date.now() < kickDeadline) {
    const s = await pkSnapshot(page);
    if (s.phase === 'fulltime') {
      reachedFulltime = true;
      break;
    }
    if (s.stage === 'aim' && !pkShot) {
      await page.screenshot({ path: shot('mobile-4-pk.png') });
      pkShot = true;
    }
    if (s.stage === 'aim' && s.shooterIdx === human && !humanAim) {
      humanAim = true;
      await page.waitForTimeout(150);
      hintOk = await page.evaluate(() => window.__sg.scene.hudSpecialText.text.includes('搖桿'));
      await page.screenshot({ path: shot('mobile-4b-pk-human.png') });
    }
    if (s.stage === 'aim' && s.shooterIdx === human && s.meterTicks < 0 && pressedAtKick !== s.kicksTaken) {
      pressedAtKick = s.kicksTaken;
      await touchStart(BTN_J.x, BTN_J.y);
      await page.waitForTimeout(600);
      await touchEnd();
      continue;
    }
    await page.waitForTimeout(100);
  }
  report('10 pk aim screen captured', pkShot);
  report(
    '10 pk touch hint for human shooter',
    !humanAim || hintOk,
    humanAim ? (hintOk ? 'shown' : 'missing') : 'human not a shooter in this random shootout, not exercised',
  );
  report('10 shootout ended', reachedFulltime, `human shot by touch: ${pressedAtKick >= 0 ? 'yes' : 'no'}`);
  if (!reachedFulltime) throw new Error('shootout did not reach fulltime within 120 s');

  // 11. Result -> tap -> title
  const resultOk = await waitScene(page, 'ResultScene', 8000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('mobile-5-result.png') });
  report('11 result scene', resultOk);
  if (!resultOk) throw new Error('result scene did not appear');
  await tapLogical(page, 320, 180);
  const backOk = await waitScene(page, 'TitleScene', 8000);
  report('11 result tap -> title', backOk);
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
