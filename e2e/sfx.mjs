// Sample SFX check. A match loads the CC0 sample files (public/sfx/<slot>.wav) in the background at start;
// every request must return 200, and the page must log no console errors.
// Usage: node e2e/sfx.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/sfx.mjs <url>');
  process.exit(2);
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results');
mkdirSync(outDir, { recursive: true });

const errors = [];
const sfxResponses = [];
let failed = false;

function matchUrl() {
  const url = new URL(base);
  url.searchParams.set('quick', '1');
  url.searchParams.set('ai', '0');
  url.searchParams.set('home', 'shu');
  url.searchParams.set('away', 'wei');
  url.searchParams.set('human', '0');
  return url.toString();
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (/\/sfx\/[^/]+\.wav$/.test(new URL(res.url()).pathname)) sfxResponses.push({ url: res.url(), status: res.status() });
  });
  await page.goto(matchUrl(), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(outDir, 'sfx-match.png'), scale: 'css' });
  await page.close();
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
  await browser.close();
}

const bad = sfxResponses.filter((r) => r.status !== 200);
const names = new Set(sfxResponses.map((r) => r.url.split('/').pop()));
if (names.size === 0) {
  console.log('sfx requests: none (FAIL)');
  failed = true;
} else {
  console.log(`sfx requests: ${names.size} distinct files, ${sfxResponses.length} responses`);
}
if (bad.length > 0) {
  console.log(`non-200 sfx responses (${bad.length}):`);
  for (const r of bad) console.log(`  ${r.status}: ${r.url}`);
  failed = true;
}
if (errors.length > 0) {
  console.log(`errors (${errors.length}):`);
  for (const line of errors) console.log(`  ${line}`);
  failed = true;
} else {
  console.log('console errors: none');
}

console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(failed ? 1 : 0);
