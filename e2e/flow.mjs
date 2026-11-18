// Full game flow test: Title -> team select -> match -> result -> Title.
// Usage: node e2e/flow.mjs <url>   (runs with ?half=3 so the match is short)
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
flowUrl.searchParams.set('half', '3');

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

  // 6. Wait for the match to end (ResultScene), or for a PK tie
  const endPhase = await page
    .waitForFunction(
      () =>
        window.__sgScene === 'ResultScene' ||
        (Boolean(window.__sg) && window.__sg.state().match.phase === 'pk'),
      null,
      { timeout: 40000, polling: 250 },
    )
    .then(() => 'ended', () => 'timeout');
  if (endPhase !== 'ended') {
    report('6 match end', false, 'no ResultScene or pk within 40 s');
    throw new Error('match did not end');
  }
  const phase = await page.evaluate(() => window.__sg.state().match.phase);
  const score = await page.evaluate(() => window.__sg.state().match.score);
  if (phase === 'pk') {
    report('6 match end', true, `phase pk, score ${score[0]}-${score[1]}: PK tie accepted, result and back-to-title steps skipped`);
  } else {
    const resultOk = await waitScene(page, 'ResultScene', 8000);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot('flow-6-result.png') });
    report('6 result scene', resultOk, `score ${score[0]}-${score[1]}`);
    if (!resultOk) throw new Error('result scene did not appear');

    // 7. Back to title
    await tap(page, 'j');
    const backOk = await waitScene(page, 'TitleScene', 8000);
    report('7 back to title', backOk);
  }
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
