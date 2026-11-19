// Smoke test for the match scene. Usage: node e2e/smoke.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/smoke.mjs <url>');
  process.exit(2);
}
// Without a query, start the match directly (?quick skips the title and team select screens)
// with AI off (ai=0) so the other players do not push the human during the move check.
const url = base.includes('?') ? base : `${base}?quick=1&ai=0`;

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results');
mkdirSync(outDir, { recursive: true });

const errors = [];
let failed = false;

const humanX = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    return sg.state().players[sg.humanIdx].x;
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

  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, 'match-1.png') });
  await page.screenshot({ path: resolve(outDir, 'view-desktop-match.png') });

  const x0 = await humanX(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(1200);
  await page.keyboard.up('d');
  const x1 = await humanX(page);
  const moved = x1 > x0;
  console.log(`move right: x ${x0.toFixed(1)} -> ${x1.toFixed(1)}: ${moved ? 'PASS' : 'FAIL'}`);
  if (!moved) failed = true;

  await page.keyboard.down('j');
  await page.waitForTimeout(200);
  await page.keyboard.up('j');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(outDir, 'match-2.png') });
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
