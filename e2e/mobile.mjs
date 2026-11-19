// Mobile touch flow (Playwright, phone emulation): portrait overlay -> title -> team select -> match
// (virtual joystick + J, minimap, off-screen arrow) -> penalty shootout (tap order, touch J) -> result -> title.
// Usage: node e2e/mobile.mjs <url>   (runs with ?half=12&ai=0: the first half is long enough for the joystick and arrow checks)
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
flowUrl.searchParams.set('half', '12');
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

// Current logical view ({ W, H, Z }) reported by the scene (render/view.ts). Changes with the viewport.
const viewOf = (page) => page.evaluate(() => window.__sgView);

// Logical view point -> page pixel. The canvas fills the viewport, so the scale is CSS px per logical unit.
async function toPage(page, x, y) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  const view = await viewOf(page);
  const s = box.width / view.W;
  return { x: box.x + x * s, y: box.y + y * s };
}
const tapLogical = async (page, x, y) => {
  const p = await toPage(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
};

// On-screen points, anchored like the scenes: buttons / stick from the bottom or right edge, menus centred.
const anchors = (v) => ({
  center: { x: v.W / 2, y: v.H / 2 },
  panelShu: { x: v.W / 2, y: v.H / 2 },
  panelWu: { x: v.W / 2 + 190, y: v.H / 2 },
  confirm: { x: v.W - 120, y: v.H - 25 },
  btnJ: { x: v.W - 48, y: v.H - 92 },
  stickRest: { x: 70, y: v.H - 90 },
});
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

  // 1b. Full screen: the canvas covers the viewport (no letterbox) and is rendered at >= 1.5x its CSS size.
  const fullBox = await page.locator('canvas').first().boundingBox();
  const canvasPx = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c.width, h: c.height };
  });
  const covers = Math.abs(fullBox.width - 844) <= 1 && Math.abs(fullBox.height - 390) <= 1;
  report('1b canvas covers the viewport', covers, `css ${fullBox.width}x${fullBox.height}`);
  report(
    '1b canvas backing width >= 1.5x CSS width',
    canvasPx.w >= 1.5 * fullBox.width,
    `backing ${canvasPx.w}x${canvasPx.h}, css ${fullBox.width}`,
  );

  // 2. Title tap -> team select (own country stage)
  const v0 = await viewOf(page);
  await tapLogical(page, v0.W / 2, v0.H / 2);
  const ownOk = (await waitScene(page, 'TeamSelectScene')) && (await waitMenu(page, { stage: 'own' }));
  report('2 title tap -> team select', ownOk);
  if (!ownOk) throw new Error('team select did not appear after title tap');

  // 3. Own country: tap shu (moves cursor), tap again (confirm) -> opponent stage
  let A = anchors(await viewOf(page));
  await tapLogical(page, A.panelShu.x, A.panelShu.y);
  const shuCursor = await waitMenu(page, { stage: 'own', cursor: 1 });
  await tapLogical(page, A.panelShu.x, A.panelShu.y);
  const oppOk = await waitMenu(page, { stage: 'opp', own: 'shu' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot('mobile-2-select.png') });
  report('3 own country: tap panel twice confirms', shuCursor && oppOk);

  // 4. Opponent: tap wu (cursor), then 確定 -> general stage
  await tapLogical(page, A.panelWu.x, A.panelWu.y);
  const wuCursor = await waitMenu(page, { stage: 'opp', cursor: 2 });
  await tapLogical(page, A.confirm.x, A.confirm.y);
  const generalOk = await waitMenu(page, { stage: 'general', cursor: 4 });
  report('4 opponent: tap panel + 確定 -> general', wuCursor && generalOk);
  if (!generalOk) throw new Error('general stage did not appear');

  // 5. General: 確定 (default FW) -> match starts
  await tapLogical(page, A.confirm.x, A.confirm.y);
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

  // 6. Touch controls and HUD visible during the match; minimap drawn every frame.
  A = anchors(await viewOf(page));
  await page.waitForTimeout(150);
  await page.screenshot({ path: shot('view-mobile-match.png') });
  const minimapFrames = await page.evaluate(() => window.__sg.minimap());
  report('6 minimap drawn', minimapFrames > 0, `frames ${minimapFrames}`);

  // 7. Joystick: touch down at the stick rest, move right, hold ~1 s.
  const x0 = await humanX(page);
  await touchStart(A.stickRest.x, A.stickRest.y);
  for (let i = 1; i <= 5; i++) {
    await touchMove(A.stickRest.x + i * 8, A.stickRest.y);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(800);
  const x1 = await humanX(page);
  await touchEnd();
  report('7 joystick moves human right', x1 > x0 + 2, `x ${x0.toFixed(1)} -> ${x1.toFixed(1)}`);

  // 7b. Off-screen arrow: the human carries the ball to the right; a short J press releases it (the ball stays put,
  // so the camera stays on it), then the stick pushed left walks the human out of the camera view.
  await touchStart(A.stickRest.x, A.stickRest.y);
  await touchMove(A.stickRest.x + 40, A.stickRest.y);
  await page.waitForTimeout(1200);
  await touchEnd();
  await touchStart(A.btnJ.x, A.btnJ.y);
  await page.waitForTimeout(150);
  await touchEnd();
  const xStart = await humanX(page);
  await touchStart(A.stickRest.x, A.stickRest.y);
  await touchMove(A.stickRest.x - 40, A.stickRest.y);
  let arrowOk = false;
  const arrowDeadline = Date.now() + 10000;
  while (Date.now() < arrowDeadline) {
    if (await page.evaluate(() => window.__sg.arrowVisible())) {
      arrowOk = true;
      break;
    }
    await page.waitForTimeout(200);
  }
  if (arrowOk) await page.screenshot({ path: shot('view-arrow.png') });
  await touchEnd();
  const arrowState = await page.evaluate(() => {
    const sg = window.__sg;
    const st = sg.state();
    return { human: Math.round(st.players[sg.humanIdx].x), ball: Math.round(st.ball.x), scrollX: Math.round(sg.scene.cameras.main.scrollX), phase: st.match.phase };
  });
  report(
    '7b off-screen arrow shown when human leaves view',
    arrowOk,
    `from ${xStart.toFixed(0)} to ${arrowState.human}, ball ${arrowState.ball}, camera ${arrowState.scrollX}, ${arrowState.phase}`,
  );

  // 8. J button tap -> no errors (checked at the end)
  await tapLogical(page, A.btnJ.x, A.btnJ.y);
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
  // The order overlay scales by H / 360 on short touch views (render/MatchScene.ts orderLayout).
  const orderK = Math.min(1, (await viewOf(page)).H / 360);
  for (let i = 0; i < 5; i++) {
    await tapLogical(page, A.center.x, (ORDER_ROW_Y0 + i * ORDER_ROW_H) * orderK);
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
      hintOk = await page.evaluate(() => window.__sg.scene.pkHintText.text.includes('搖桿'));
      await page.screenshot({ path: shot('mobile-4b-pk-human.png') });
    }
    if (s.stage === 'aim' && s.shooterIdx === human && s.meterTicks < 0 && pressedAtKick !== s.kicksTaken) {
      pressedAtKick = s.kicksTaken;
      await touchStart(A.btnJ.x, A.btnJ.y);
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
  await tapLogical(page, A.center.x, A.center.y);
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
