// Full game flow test: Title -> team select -> match -> penalty shootout -> result -> Title.
// Usage: node e2e/flow.mjs <url>   (runs with ?half=2&ai=0: the AI-off match is a 0-0 draw, so it goes to PK)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/flow.mjs <url>');
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

// Hold a key briefly so Phaser sees a clean keydown (JustDown) on the next frame.
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
// Shootout snapshot for the kick loop.
const pkSnapshot = (page) =>
  page.evaluate(() => {
    const st = window.__sg.state();
    const pk = st.match.pk;
    return {
      phase: st.match.phase,
      stage: pk ? pk.stage : null,
      orderOpen: pk ? pk.order[0] === null : false,
      shooterIdx: pk ? pk.shooterIdx : -1,
      meterTicks: pk ? pk.meterTicks : -1,
      kicksTaken: pk ? pk.kicks[0].length + pk.kicks[1].length : 0,
      human: window.__sg.humanIdx,
      score: pk ? pk.score : null,
      winner: pk ? pk.winner : -1,
    };
  });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(flowUrl.toString(), { waitUntil: 'load', timeout: 20000 });

  // 1. Title
  const titleOk = await waitScene(page, 'TitleScene', 15000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot('flow-1-title.png') });
  report('1 title', titleOk);
  if (!titleOk) throw new Error('title scene did not appear');

  // 2. Team select, own country
  await tap(page, 'j');
  const ownOk = (await waitScene(page, 'TeamSelectScene')) && (await waitMenu(page, { stage: 'own' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('flow-2-country.png') });
  report('2 own country stage', ownOk);
  if (!ownOk) throw new Error('team select (own) did not appear');

  // 3. Own country = shu (D then J), then opponent stage
  await tap(page, 'd');
  const onShu = await waitMenu(page, { cursor: 1 });
  await tap(page, 'j');
  const oppOk = await waitMenu(page, { stage: 'opp', own: 'shu' });
  await page.waitForTimeout(200);
  // Own country (shu, index 1) must be skipped: D from wei goes to wu, A goes back to wei.
  await tap(page, 'd');
  const skipRight = await waitMenu(page, { stage: 'opp', cursor: 2 });
  await tap(page, 'a');
  const skipLeft = await waitMenu(page, { stage: 'opp', cursor: 0 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot('flow-3-opponent.png') });
  report(
    '3 opponent stage (own greyed, cursor skips own)',
    onShu && oppOk && skipRight && skipLeft,
  );

  // 4. Pick wei as opponent, then general stage (default cursor on FW)
  await tap(page, 'j');
  const generalOk = await waitMenu(page, { stage: 'general', cursor: 4 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('flow-4-general.png') });
  report('4 general stage (FW default)', generalOk);
  if (!generalOk) throw new Error('general stage did not appear');

  // 5. Confirm general -> match starts
  await tap(page, 'j');
  const matchOk =
    (await waitScene(page, 'MatchScene')) &&
    (await page
      .waitForFunction(
        () => Boolean(window.__sg) && window.__sg.state().match.phase === 'play',
        null,
        { timeout: 15000 },
      )
      .then(
        () => true,
        () => false,
      ));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot('flow-5-match.png') });
  report('5 match in play', matchOk);
  if (!matchOk) throw new Error('match did not reach play');

  // 6. Match ends level (0-0 with AI off) -> penalty shootout order screen
  const pkOk = await page
    .waitForFunction(
      () => Boolean(window.__sg) && window.__sg.state().match.phase === 'pk',
      null,
      { timeout: 40000, polling: 250 },
    )
    .then(
      () => true,
      () => false,
    );
  if (!pkOk) {
    const snap = await pkSnapshot(page);
    report('6 match ends level -> pk', false, `phase ${snap.phase}, score ${snap.score}`);
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
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('flow-6-pk-order.png') });
  report('6 pk order screen', orderOpen);
  if (!orderOpen) throw new Error('shootout order screen did not open');

  // 6b. Human picks team 0's order: J five times (cursor moves to the next unpicked player after each pick).
  for (let i = 0; i < 5; i++) {
    await tap(page, 'j');
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
  report('6b pk order submitted', submitted);
  if (!submitted) throw new Error('shootout order was not submitted');

  // 7-8. Play every kick. The human shoots when it is their turn: hold J ~600 ms, then release.
  const human = (await pkSnapshot(page)).human;
  let aimShot = false;
  let resultShot = false;
  let pressedAtKick = -1;
  let reachedFulltime = false;
  const kickDeadline = Date.now() + 120000;
  while (Date.now() < kickDeadline) {
    const s = await pkSnapshot(page);
    if (s.phase === 'fulltime') {
      reachedFulltime = true;
      break;
    }
    if (s.stage === 'aim' && !aimShot) {
      await page.screenshot({ path: shot('flow-7-pk-aim.png') });
      aimShot = true;
    }
    if (s.stage === 'aim' && s.shooterIdx === human && s.meterTicks < 0 && pressedAtKick !== s.kicksTaken) {
      pressedAtKick = s.kicksTaken;
      await page.keyboard.down('j');
      await page.waitForTimeout(600);
      await page.keyboard.up('j');
      continue;
    }
    if (s.stage === 'result' && !resultShot) {
      await page.screenshot({ path: shot('flow-8-pk-result.png') });
      resultShot = true;
    }
    await page.waitForTimeout(100);
  }
  const finalPk = await pkSnapshot(page);
  report('7 pk aim screen', aimShot, `first aim stage; human shots taken: ${pressedAtKick >= 0 ? 'yes' : 'no'}`);
  report('8 pk result screen', resultShot);
  report(
    '7-8 shootout ended',
    reachedFulltime && finalPk.winner !== -1,
    `score ${finalPk.score ? finalPk.score.join('-') : '?'}, winner ${finalPk.winner}, kicks ${finalPk.kicksTaken}`,
  );
  if (!reachedFulltime) throw new Error('shootout did not reach fulltime within 120 s');

  // 9. Result scene shows the PK score
  const resultOk = await waitScene(page, 'ResultScene', 8000);
  await page.waitForTimeout(500);
  const resultPk = await page.evaluate(() => window.__sgResult?.pk ?? null);
  await page.screenshot({ path: shot('flow-9-result.png') });
  report('9 result scene with PK score', resultOk && Array.isArray(resultPk), `PK ${resultPk ? resultPk.join(' - ') : 'none'}`);
  if (!resultOk) throw new Error('result scene did not appear');

  // 10. Back to title
  await tap(page, 'j');
  const backOk = await waitScene(page, 'TitleScene', 8000);
  report('10 back to title', backOk);
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
