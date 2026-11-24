// Skill preview check: team select (phone touch) -> 預覽 on each character -> the special fires -> back to team select.
// Covers 關羽 / 張飛 / 趙雲 / 諸葛亮 / 馬超 (shu roster) and 許褚 / 張遼 / 司馬懿 (wei roster). Screenshots go to the scratchpad preview dir;
// the fear shot (fear-zhangliao.png) is taken during Zhang Liao's fear, with the victims feared. Simayi's flight shot
// (leap-simayi-flight.png) is taken mid-air, and the landing shot (leap-simayi.png) at the landing, with the victims burst and silenced.
// Cao Cao's slash: 3 swings (slashSwing) land within ~40 ticks of the special, and the blade waves are drawn (slash-caocao.png).
// Xu Chu's guard: once it starts, a test-staged opponent shot comes in at his goal. The swallow shot (tiger-xuchu-swallow.png) is
// taken while the ball is held in his mouth, and the spit shot (tiger-xuchu-spit.png) while the fire trail follows the lob.
// Zhen Ji's icefield: the field is cast at her feet (iceStart); after the first pulse (icePulse) the staged opponents inside it are
// tinted, and the mid-field shot (test-results/ice-zhenji.png) shows the rain, the spikes and the tinted victims.
// Sun Ce's sail (wu roster): a teammate is staged 24 px ahead and an opponent 60 px ahead of him before the L press. The teammate
// boards (sailBoard), the sail loop and the wake show (sail-sunce.png), and the hull hits the opponent (sailCrash): the water burst
// and the launched victim (sail-sunce-crash.png), then the dizzy stars when he lands.
// Xiao Qiao's gust (wu roster): two opponents are staged 150 px and 190 px ahead of her. The mark circle on the ground is shot
// (gust-xiaoqiao-mark.png) while the gust is live, then the eruption: the tornado and the launched victims (gust-xiaoqiao-blow.png).
// Usage: node e2e/preview.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/preview.mjs <url>');
  process.exit(2);
}
const outDir = '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/preview';
mkdirSync(outDir, { recursive: true });
const shot = (name) => resolve(outDir, name);

// Expected sim event per preview: the special fires (special), then its effect.
const CASES = [
  { id: 'zhangfei', name: '張飛', slot: 0, effect: 'roar' },
  { id: 'guanyu', name: '關羽', slot: 1, effect: 'rideStart' },
  { id: 'zhugeliang', name: '諸葛亮', slot: 2, effect: 'beamStrike' },
  { id: 'machao', name: '馬超', slot: 3, effect: 'riderSpawn' },
  { id: 'zhaoyun', name: '趙雲', slot: 4, effect: 'lungeStart' },
  { id: 'xuchu', name: '許褚', slot: 0, effect: 'tigerSwallow', wei: true },
  { id: 'zhangliao', name: '張遼', slot: 4, effect: 'fear', wei: true },
  { id: 'simayi', name: '司馬懿', slot: 3, effect: 'leapLand', wei: true },
  { id: 'caocao', name: '曹操', slot: 1, effect: 'slashWave', wei: true },
  { id: 'zhenji', name: '甄姬', slot: 2, effect: 'iceStart', wei: true },
  { id: 'sunce', name: '孫策', slot: 4, effect: 'sailStart', wu: true },
  { id: 'xiaoqiao', name: '小喬', slot: 3, effect: 'gustMark', wu: true },
];

const errors = [];
const results = [];
let failed = false;

function report(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failed = true;
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
}

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

// Logical view point -> page pixel (the canvas fills the viewport).
async function toPage(page, x, y) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas not found');
  const view = await page.evaluate(() => window.__sgView);
  const s = box.width / view.W;
  return { x: box.x + x * s, y: box.y + y * s };
}

/** Taps the 預覽 button of a general-stage row (touch). */
async function tapPreview(page, slot) {
  const rect = await page.evaluate((s) => window.__sgMenu().previewRect(s), slot);
  const p = await toPage(page, rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.touchscreen.tap(p.x, p.y);
}

// Test-only: an opponent's shot at Xu Chu's own goal, along the sim's attack direction (sim field.ts attackDir: team 0 attacks +x
// unless swapped; his own goal is the other end). The ball starts 60 px in front of him toward that goal.
const stageTigerShot = () => {
  const s = window.__sg.state();
  const tiger = s.players[window.__sg.humanIdx];
  const attack = (tiger.team === 0 ? 1 : -1) * (s.match.swapped ? -1 : 1);
  const dir = -attack;
  const shooter = s.players.find((p) => p.team !== tiger.team);
  const b = s.ball;
  b.ownerIdx = -1;
  b.lastTouchIdx = shooter.idx;
  b.special = null;
  b.x = tiger.x + dir * 60;
  b.y = tiger.y;
  b.z = 0;
  b.vx = dir * 10;
  b.vy = 0;
  b.vz = 0;
  return { shooter: shooter.idx, tigerX: tiger.x };
};

// Test-only: a teammate 24 px ahead of Sun Ce (he boards the sail) and an opponent 60 px ahead (the hull's reach is about 46 px).
const stageSail = () => {
  const s = window.__sg.state();
  const sailor = s.players[window.__sg.humanIdx];
  const dir = sailor.facingX < 0 ? -1 : 1;
  const mate = s.players.find((p) => p.team === sailor.team && p.idx !== sailor.idx && p.role !== 'GK');
  const foe = s.players.find((p) => p.team !== sailor.team);
  for (const [p, d] of [[mate, 24], [foe, 60]]) {
    p.x = sailor.x + dir * d;
    p.y = sailor.y;
    p.vx = 0;
    p.vy = 0;
  }
  return { mate: mate.idx, foe: foe.idx };
};

// Test-only: two opponents for Xiao Qiao's gust, 150 px and 190 px ahead of her (the nearer one is the gust point, both are inside its reach).
const stageGust = () => {
  const s = window.__sg.state();
  const caster = s.players[window.__sg.humanIdx];
  const dir = caster.facingX < 0 ? -1 : 1;
  const foes = s.players.filter((p) => p.team !== caster.team && p.role !== 'GK');
  for (const [p, d] of [[foes[0], 150], [foes[1], 190]]) {
    p.x = caster.x + dir * d;
    p.y = caster.y;
    p.vx = 0;
    p.vy = 0;
  }
  return { near: foes[0].idx, far: foes[1].idx };
};

// Test-only: an opponent 170 px ahead of Guan Yu along his facing, in his lane (the bike hits him).
const stageRideVictim = () => {
  const s = window.__sg.state();
  const rider = s.players[window.__sg.humanIdx];
  const v = s.players.find((p) => p.team !== rider.team);
  v.x = rider.x + rider.facingX * 170;
  v.y = rider.y + rider.facingY * 170;
  v.vx = 0;
  v.vy = 0;
  return { victim: v.idx };
};

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
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(base, { waitUntil: 'load', timeout: 20000 });
  const titleOk = await waitScene(page, 'TitleScene', 15000);
  if (!titleOk) throw new Error('title scene did not appear');

  // Title -> own country (shu) -> opponent (wei) -> general stage (shu roster).
  await tap(page, 'j');
  await waitScene(page, 'TeamSelectScene');
  await tap(page, 'd');
  await tap(page, 'j');
  await waitMenu(page, { stage: 'opp', own: 'shu' });
  await tap(page, 'j');
  const generalOk = await waitMenu(page, { stage: 'general', own: 'shu', opp: 'wei' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('team-select-general-shu.png') });
  report('0 team select general (shu vs wei) with 預覽 buttons', generalOk);
  if (!generalOk) throw new Error('general stage did not appear');

  let woke = false;
  let wuUp = false;
  for (const c of CASES) {
    if (c.wei && !woke) {
      // Back to the country stages: own -> wei, then opponent shu, then the wei roster.
      await tap(page, 'k');
      await waitMenu(page, { stage: 'opp' });
      await tap(page, 'k');
      await waitMenu(page, { stage: 'own' });
      await tap(page, 'a');
      await waitMenu(page, { stage: 'own', cursor: 0 });
      await tap(page, 'j');
      await waitMenu(page, { stage: 'opp', own: 'wei' });
      await tap(page, 'j');
      const weiGeneral = await waitMenu(page, { stage: 'general', own: 'wei', opp: 'shu' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot('team-select-general-wei.png') });
      report('0b team select general (wei vs shu)', weiGeneral);
      if (!weiGeneral) throw new Error('wei general stage did not appear');
      woke = true;
    }

    if (c.wu && !wuUp) {
      // Back to the country stages (own cursor to wu, the third country), then the wu roster.
      await tap(page, 'k');
      await waitMenu(page, { stage: 'opp' });
      await tap(page, 'k');
      await waitMenu(page, { stage: 'own' });
      await tap(page, 'a');
      await waitMenu(page, { stage: 'own', cursor: 0 });
      await tap(page, 'd');
      await tap(page, 'd');
      await waitMenu(page, { stage: 'own', cursor: 2 });
      await tap(page, 'j');
      await waitMenu(page, { stage: 'opp', own: 'wu' });
      await tap(page, 'j');
      const wuGeneral = await waitMenu(page, { stage: 'general', own: 'wu' });
      await page.waitForTimeout(300);
      report('0c team select general (wu)', wuGeneral);
      if (!wuGeneral) throw new Error('wu general stage did not appear');
      wuUp = true;
    }

    const name = `${c.name} (${c.id})`;
    await tapPreview(page, c.slot);
    const started = await waitScene(page, 'MatchScene');
    const playing = await page
      .waitForFunction(() => Boolean(window.__sg) && window.__sg.state().match.phase === 'play', null, { timeout: 10000 })
      .then(
        () => true,
        () => false,
      );
    if (!started || !playing) {
      report(`${name} preview starts`, false, `scene ${started}, play ${playing}`);
      throw new Error('preview did not start');
    }
    const banner = await page.evaluate(() => window.__sg.state().players[window.__sg.humanIdx].charId);
    report(`${name} preview human is the character`, banner === c.id, `charId ${banner}`);

    // Test-only: every fx:* sprite that shows up in this match's scene, per frame (stops when the scene is replaced).
    await page.evaluate(() => {
      const seen = new Set();
      window.__sgFxSeen = seen;
      const scene = window.__sg.scene;
      const tick = () => {
        if (window.__sg.scene !== scene) return;
        for (const c of scene.children.list) if (c.name?.startsWith('fx:')) seen.add(c.name);
        // Latch the spat lob: its flight is ~0.9 s, and a slow screenshot can outlast it.
        if (window.__sg.state().ball.tiger?.phase === 'flight') window.__tigerFlightSeen = true;
        requestAnimationFrame(tick);
      };
      tick();
    });

    let sailing = null;
    if (c.effect === 'sailStart') sailing = await page.evaluate(stageSail);
    let gust = null;
    if (c.effect === 'gustMark') gust = await page.evaluate(stageGust);

    if (c.effect === 'leapLand') {
      // Mid-air (the flight is above 20 px high): the crow trail is on him.
      const airborne = await page
        .waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].z > 20, null, { timeout: 6000 })
        .then(
          () => true,
          () => false,
        );
      await page.screenshot({ path: shot('leap-simayi-flight.png') });
      report(`${name} mid-flight height`, airborne);
    }

    if (c.effect === 'tigerSwallow') {
      // Guard starts (tigerStart), then the staged shot is swallowed; the hold is 0.5 s, so the swallow shot is taken right away.
      await page.evaluate(() => {
        window.__tigerFlightSeen = false;
      });
      await page.waitForFunction(() => window.__sg.preview().events.includes('tigerStart'), null, { timeout: 6000 });
      await page.evaluate(stageTigerShot);
      const held = await page
        .waitForFunction(() => window.__sg.state().ball.tiger?.phase === 'hold', null, { timeout: 4000 })
        .then(() => true, () => false);
      // Taken at CSS scale: the lob lands about 0.9 s after the spit, and a 2x shot is too slow to catch the flight.
      await page.screenshot({ path: shot('tiger-xuchu-swallow.png'), scale: 'css' });
      report(`${name} swallows the shot (ball held)`, held);
      // The spit: the lob flies with the fire trail, and the shot is taken as soon as the flight is seen.
      // The flight is read from the per-frame latch (set by the recorder above), so a slow shot cannot miss it.
      const spat = await page
        .waitForFunction(() => window.__tigerFlightSeen === true, null, { timeout: 4000, polling: 'raf' })
        .then(() => true, () => false);
      await page.screenshot({ path: shot('tiger-xuchu-spit.png'), scale: 'css' }).catch(() => {});
      report(`${name} spits the ball (lob in flight)`, spat);
    }

    if (c.effect === 'rideStart') {
      // Ride (0.5 s): an opponent is staged 170 px ahead in the lane before the L press. The bike reaches him about 0.25 s in, as the
      // ride loop starts: shot mid-ride (bike, dragon, exhaust), then shot at the hit (rideHit, the impact burst on him).
      // A per-frame record of the ride's sprite loop and dragon is checked after.
      const staged = await page.evaluate(stageRideVictim);
      await page.evaluate(() => {
        const seen = new Set();
        window.__rideSeen = seen;
        const scene = window.__sg.scene;
        const tick = () => {
          if (window.__sg.scene !== scene) return;
          const p = window.__sg.state().players[window.__sg.humanIdx];
          if (p.action === 'ride') {
            seen.add(scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key ?? '');
            if (scene.children.list.some((o) => o.name === 'fx:dragon' && o.active)) seen.add('fx:dragon');
          }
          requestAnimationFrame(tick);
        };
        tick();
      });
      await page.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'ride', null, { timeout: 6000 });
      await page.waitForFunction(() => window.__sg.scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key === 'sprite-guanyu:lunge', null, { timeout: 3000, polling: 'raf' }).catch(() => {});
      await page.screenshot({ path: shot('ride-guanyu.png') });
      const hit = await page
        .waitForFunction(() => window.__sg.preview().events.includes('rideHit'), null, { timeout: 4000, polling: 'raf' })
        .then(() => true, () => false);
      await page.screenshot({ path: shot('ride-guanyu-hit.png') });
      report(`${name} bike hits the staged opponent (rideHit)`, hit, `victim ${staged.victim}`);
      await page.waitForTimeout(600);
      const seen = await page.evaluate(() => [...window.__rideSeen]);
      report(`${name} ride loop sprite and dragon shown during the ride`, seen.includes('sprite-guanyu:lunge') && seen.includes('fx:dragon'), `seen ${seen.join(',')}`);
    }

    // Wait for the special and its effect event.
    const fired = await page
      .waitForFunction(
        (eff) => {
          const ev = window.__sg.preview().events;
          return ev.includes('special') && ev.includes(eff);
        },
        c.effect,
        { timeout: 6000 },
      )
      .then(
        () => true,
        () => false,
      );
    // Taken right at the special, before the screenshot delay below.
    if (c.effect === 'sailStart') {
      // The teammate boards (passenger on the deck), the sail loop runs, and the wake follows him; shot before the hull reaches the opponent.
      const boarded = await page
        .waitForFunction(() => window.__sg.preview().events.includes('sailBoard'), null, { timeout: 3000, polling: 'raf' })
        .then(() => true, () => false);
      const looping = await page
        .waitForFunction(() => window.__sg.scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key === 'sprite-sunce:sail', null, { timeout: 2000, polling: 'raf' })
        .then(() => true, () => false);
      await page.waitForTimeout(150);
      const onDeck = await page.evaluate((m) => window.__sg.state().players[m].sailPassengerOf === window.__sg.humanIdx, sailing.mate);
      await page.screenshot({ path: shot('sail-sunce.png') });
      report(`${name} teammate boards the sail (sailBoard)`, boarded && onDeck, `mate ${sailing.mate}`);
      report(`${name} sail loop plays (sprite-sunce:sail)`, looping);
      // The staged opponent is 60 px out, past the hull's reach (about 46 px), so he is moved in now: the next tick's contact is the crash.
      await page.evaluate((v) => {
        const s = window.__sg.state();
        const sailor = s.players[window.__sg.humanIdx];
        const foe = s.players[v];
        foe.x = sailor.x + (sailor.facingX < 0 ? -1 : 1) * 40;
        foe.y = sailor.y;
        foe.vx = 0;
        foe.vy = 0;
      }, sailing.foe);
      // The hull reaches the opponent: the burst and the launched victim (airborne about a second).
      const crashed = await page
        .waitForFunction(() => window.__sg.preview().events.includes('sailCrash'), null, { timeout: 4000, polling: 'raf' })
        .then(() => true, () => false);
      await page.waitForTimeout(150);
      const launched = await page.evaluate((v) => window.__sg.state().players[v].z, sailing.foe);
      await page.screenshot({ path: shot('sail-sunce-crash.png') });
      report(`${name} hull hits the staged opponent (sailCrash)`, crashed && launched > 0, `victim z ${launched}`);
      await page.waitForTimeout(1100);
      const sailFx = await page.evaluate(() => [...window.__sgFxSeen]);
      const hasFx = ['fx:splash', 'fx:wake', 'fx:splinter', 'fx:dizzy'].every((n) => sailFx.includes(n));
      report(`${name} splash, wake, splinter and dizzy fx are drawn`, hasFx, `fx seen ${sailFx.join(',')}`);
    }

    if (c.effect === 'slashWave') {
      // Swings come every 0.2 s (12 ticks) from the cast, so 3 land within 40 ticks (the third at 36). The buff timer (300 minus slashTicks)
      // is read as soon as the third swing is seen, which is the sim time since the cast.
      const swung = await page
        .waitForFunction(() => window.__sg.preview().events.filter((t) => t === 'slashSwing').length >= 3, null, { timeout: 2000, polling: 'raf' })
        .then(
          () => true,
          () => false,
        );
      const elapsed = await page.evaluate(() => 300 - window.__sg.state().players[window.__sg.humanIdx].slashTicks);
      const swings = await page.evaluate(() => window.__sg.preview().events.filter((t) => t === 'slashSwing').length);
      report(`${name} swings (slashSwing) at least 3 times within ~40 ticks of the special`, swung && elapsed <= 40, `swings ${swings}, ${elapsed} ticks after the cast`);
    }
    if (c.effect === 'gustMark') {
      // The mark is live from gustMark until the eruption (30 ticks, 0.5 s): shot right away, then the eruption is awaited.
      const live = await page.evaluate(() => window.__sg.state().gusts.length > 0);
      await page.screenshot({ path: shot('gust-xiaoqiao-mark.png'), scale: 'css' });
      report(`${name} marks the ground (gustMark, gust live)`, live && gust !== null, `staged ${gust?.near}, ${gust?.far}`);
      // The tornado is spawned on the eruption tick and lasts about 0.6 s, and the launch peaks about 116 px up, so the shot is
      // taken as soon as the tornado is in the scene (the victims are still low in the air).
      const blown = await page
        .waitForFunction(() => window.__sg.scene.children.list.some((o) => o.name === 'fx:gust'), null, { timeout: 4000, polling: 'raf' })
        .then(() => true, () => false);
      const launched = await page.evaluate(() => {
        const s = window.__sg.state();
        const me = s.players[window.__sg.humanIdx];
        return s.players.filter((p) => p.team !== me.team && p.z > 0).length;
      });
      await page.screenshot({ path: shot('gust-xiaoqiao-blow.png'), scale: 'css' });
      report(`${name} erupts and launches victims (gustBlow)`, blown && launched >= 1, `launched ${launched}`);
      const gustFx = await page.evaluate(() => [...window.__sgFxSeen]);
      const hasGustFx = ['fx:mark', 'fx:petals', 'fx:gust', 'fx:impact'].every((n) => gustFx.includes(n));
      report(`${name} mark, petal, tornado and burst fx are drawn`, hasGustFx, `fx seen ${gustFx.join(',')}`);
    }

    // Silence lasts 2 s, so the victims are counted at the landing itself, not after the 250 ms wait below.
    const silencedAtLand =
      c.effect === 'leapLand'
        ? await page.evaluate(() => window.__sg.state().players.filter((p) => p.silenceTicks > 0).length)
        : null;
    await page.waitForTimeout(250);
    await page.screenshot({ path: shot(`preview-${c.id}.png`) });
    const events = await page.evaluate(() => window.__sg.preview().events);
    report(`${name} special fires (${c.effect})`, fired, `events ${[...new Set(events)].join(',')}`);

    if (c.effect === 'iceStart') {
      // Mid-field (the first pulse is 0.5 s after the cast): the rain and spikes are on, and the staged opponents inside are tinted.
      const pulsed = await page
        .waitForFunction(() => window.__sg.preview().events.includes('icePulse'), null, { timeout: 4000 })
        .then(
          () => true,
          () => false,
        );
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'ice-zhenji.png') });
      const tinted = await page.evaluate(() => {
        const s = window.__sg.state();
        const scene = window.__sg.scene;
        const me = s.players[window.__sg.humanIdx];
        return s.players.filter((p) => p.team !== me.team && scene.playerViews[p.idx].sprite?.isTinted).length;
      });
      report(`${name} ice field pulses and tints the opponents inside (icePulse)`, pulsed && tinted > 0, `tinted ${tinted}`);
    }

    if (c.effect === 'slashWave') {
      // The first blade wave hits the defenders staged 55 px in front: a heal (slashHeal) and the hit sparks, shot mid-buff.
      const healed = await page
        .waitForFunction(() => window.__sg.preview().events.includes('slashHeal'), null, { timeout: 6000 })
        .then(
          () => true,
          () => false,
        );
      // The heal ring is added in the same tick as slashHeal; shot right then, while it is on him.
      await page.screenshot({ path: shot('slash-caocao.png') });
      report(`${name} blade wave hits and heals (slashHeal)`, healed);
      const fxSeen = await page.evaluate(() => [...window.__sgFxSeen]);
      const hasWave = fxSeen.includes('fx:bladeWave');
      const hasHeal = fxSeen.includes('fx:heal');
      report(`${name} blade wave and heal fx are drawn`, hasWave && hasHeal, `fx seen ${fxSeen.join(',')}`);
    }

    if (c.effect === 'leapLand') {
      // Landing: the victims are silenced (沉默 label) and the burst is on them.
      const silenced = silencedAtLand;
      await page.screenshot({ path: shot('leap-simayi.png') });
      report(`${name} victims are silenced at landing`, silenced > 0, `silenced ${silenced}`);
    }

    if (c.effect === 'fear') {
      // Mid-fear (3 s): the victims are feared, and their chains and '!' follow them.
      await page.waitForTimeout(1000);
      const feared = await page.evaluate(() => window.__sg.state().players.filter((p) => p.action === 'fear').length);
      await page.screenshot({ path: shot('fear-zhangliao.png') });
      report(`${name} victims are feared during the fear`, feared > 0, `feared ${feared}`);
    }

    // Back to team select on its own (about 4.5 s after the L press, or after a goal), on the same row.
    const back = await waitScene(page, 'TeamSelectScene', 12000);
    const menu = back ? await page.evaluate(() => window.__sgMenu()) : null;
    const restored = Boolean(menu) && menu.stage === 'general' && menu.own === (c.wu ? 'wu' : c.wei ? 'wei' : 'shu');
    report(`${name} returns to team select`, back && restored, menu ? `stage ${menu.stage}, cursor ${menu.cursor}` : 'no menu');
    if (!back) throw new Error(`${name}: did not return to team select`);
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
