// Special check. Guan Yu (shu DF, human=1) presses L with the ball and rides at once (mount, bike, fire dragon).
// Zhang Fei (shu GK, human=0) presses L without the ball next to two opponents: the roar fires at once (shockwave, stun, HUD cooldown).
// Quick taps: touch 大招 / 攻擊 with CDP touchStart + touchEnd back to back (no wait), so press and release fall between
// two samples. Every special is cast without the ball (no 需持球 hint), so Guan Yu rides and Zhou Yu blows the opponents out without it.
// Test-only state edits (ball owner, positions, stamina) go through window.__sg. Usage: node e2e/special.mjs <url>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/safe3admin/mountain-race-dev/node_modules/');
const { chromium } = require('playwright');

const base = process.argv[2];
if (!base) {
  console.error('usage: node e2e/special.mjs <url>');
  process.exit(2);
}

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

function matchUrl(human, away = 'wei') {
  const url = new URL(base);
  url.searchParams.set('quick', '1');
  url.searchParams.set('ai', '0');
  url.searchParams.set('home', 'shu');
  url.searchParams.set('away', away);
  url.searchParams.set('human', String(human));
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

async function openMatch(browser, human) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachListeners(page);
  await page.goto(matchUrl(human), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  return page;
}

/** Human state snapshot for assertions (read-only). */
const human = (page) =>
  page.evaluate(() => {
    const sg = window.__sg;
    const s = sg.state();
    const p = s.players[sg.humanIdx];
    const view = sg.scene.playerViews[sg.humanIdx];
    return {
      anim: view.sprite?.anims.currentAnim?.key ?? null,
      hasSprite: view.sprite !== null,
      action: p.action,
      rampageTicks: p.rampageTicks,
      specialCooldown: p.specialCooldown,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      ownsBall: s.ball.ownerIdx === p.idx,
    };
  });

/** Test-only: gives the human the ball in front of them at (x, y), facing +x, with full stamina and no cooldown. */
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

/** Phone-sized touch context on a match (Guan Yu, human=1). Returns the page and its CDP session. */
async function openTouchMatch(browser, human, away = 'wei') {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  attachListeners(page);
  const cdp = await context.newCDPSession(page);
  await page.goto(matchUrl(human, away), { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__sg), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__sg.state().match.phase === 'play', null, { timeout: 20000 });
  return { context, page, cdp };
}

/** Page point of a touch button, given its offset from the bottom-right corner of the logical view (same as TouchControls). */
async function buttonPoint(page, offX, offY) {
  const box = await page.locator('canvas').first().boundingBox();
  const view = await page.evaluate(() => window.__sgView);
  const s = box.width / view.W;
  return { x: box.x + (view.W - offX) * s, y: box.y + (view.H - offY) * s };
}

/** Press and release with no wait in between: both land between two 60 Hz samples unless latched. */
async function quickTap(cdp, p) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  // Ride: Guan Yu holds the ball and taps L (no charge). The mount pose (250 ms), then the ride loop; the ride lasts 0.5 s.
  const guan = await openMatch(browser, 1);
  await giveBall(guan, 400, 130);
  await guan.waitForTimeout(400);
  await guan.keyboard.down('l');
  await guan.waitForTimeout(120);
  await guan.keyboard.up('l');
  await guan.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'ride', null, {
    timeout: 3000,
  }).catch(() => {});
  const r0 = await human(guan);
  report('ride starts at once on L with the ball', r0.action === 'ride' && r0.ownsBall, `action ${r0.action}, ownsBall ${r0.ownsBall}`);
  report('ride starts the 12 s special cooldown', r0.specialCooldown > 0 && r0.specialCooldown <= 720, `specialCooldown ${r0.specialCooldown}`);
  await guan.waitForFunction(() => window.__sg.scene.playerViews[window.__sg.humanIdx].sprite?.anims.currentAnim?.key === 'sprite-guanyu:lunge', null, {
    timeout: 3000,
  }).catch(() => {});
  const r1 = await guan.evaluate(() => {
    const sg = window.__sg;
    return {
      anim: sg.scene.playerViews[sg.humanIdx].sprite?.anims.currentAnim?.key ?? null,
      action: sg.state().players[sg.humanIdx].action,
      dragon: sg.scene.children.list.some((o) => o.name === 'fx:dragon' && o.active),
    };
  });
  report('ride plays the ride loop sprite', r1.anim === 'sprite-guanyu:lunge' && r1.action === 'ride', `anim ${r1.anim}, action ${r1.action}`);
  report('ride shows the fire dragon on Guan Yu', r1.dragon, `fx:dragon active ${r1.dragon}`);
  await guan.screenshot({ path: shot('special-ride.png') });
  await guan.close();

  // Roar: Zhang Fei taps L without the ball, with two opponents inside the roar circle (out of punch reach).
  const zhang = await openMatch(browser, 0);
  await zhang.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.facingX = 1;
    h.facingY = 0;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    s.players[5].x = 390;
    s.players[5].y = 130;
    s.players[6].x = 330;
    s.players[6].y = 200;
    s.ball.x = 330;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
  });
  const opponentBefore = await zhang.evaluate(() => window.__sg.state().players[5].stamina);
  await zhang.waitForTimeout(300);
  await zhang.keyboard.down('l');
  await zhang.waitForTimeout(120);
  await zhang.keyboard.up('l');
  await zhang.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].specialCooldown > 0, null, {
    timeout: 3000,
  }).catch(() => {});
  // Read the victim in the same tick as the cooldown check: the stun lasts 1 s, the screenshot takes longer.
  const { roared, victim, centreTexts } = await zhang.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    const v = s.players[5];
    // The special's name no longer shows as big centre text: no visible text ends with the '！' of a special call.
    const texts = window.__sg.scene.children.list.filter((o) => o.type === 'Text' && o.visible && o.text.endsWith('！')).map((o) => o.text);
    return {
      roared: { specialCooldown: h.specialCooldown, ownsBall: s.ball.ownerIdx === h.idx },
      victim: { action: v.action, stamina: v.stamina },
      centreTexts: texts,
    };
  });
  await zhang.screenshot({ path: shot('special-roar.png') });
  report('roar fires at once on L without the ball and starts the cooldown', roared.specialCooldown > 0 && roared.specialCooldown <= 720, `specialCooldown ${roared.specialCooldown}`);
  report('roar shows no centre special name text', centreTexts.length === 0, `visible texts ${JSON.stringify(centreTexts)}`);
  report(
    'roar stuns the opponent in the circle',
    victim.action === 'hitstun' || victim.action === 'down',
    `victim action ${victim.action}, stamina ${opponentBefore.toFixed(1)} -> ${victim.stamina.toFixed(1)}`,
  );
  await zhang.close();

  // Quick taps on the touch buttons (Guan Yu, phone context).
  const touch = await openTouchMatch(browser, 1);
  const tp = touch.page;
  const ballHome = (x, y) => giveBall(tp, x, y);
  // Ends any ride still running (0.5 s), then clears the cooldown so the next 大招 press counts.
  const resetRide = async () => {
    await tp.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action !== 'ride', null, { timeout: 2000 }).catch(() => {});
    await tp.evaluate(() => {
      window.__sg.state().players[window.__sg.humanIdx].specialCooldown = 0;
    });
  };

  // a. 大招 quick tap with the ball starts the ride.
  await ballHome(400, 130);
  await tp.waitForTimeout(300);
  await quickTap(touch.cdp, await buttonPoint(tp, 128, 92));
  await tp.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'ride', null, {
    timeout: 3000,
  }).catch(() => {});
  const qSpecial = await human(tp);
  report('quick tap on 大招 with the ball starts the ride', qSpecial.action === 'ride', `action ${qSpecial.action}`);

  // b. 大招 quick tap without the ball: Guan Yu (shu, no ball needed) rides at once, with no 需持球 hint.
  await resetRide();
  await tp.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.stamina = h.maxStamina;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 100;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await tp.waitForTimeout(200);
  await quickTap(touch.cdp, await buttonPoint(tp, 128, 92));
  await tp.waitForFunction(() => window.__sg.state().players[window.__sg.humanIdx].action === 'ride', null, {
    timeout: 3000,
  }).catch(() => {});
  const noBall = await tp.evaluate(() => ({
    hint: window.__sg.lastHint(),
    action: window.__sg.state().players[window.__sg.humanIdx].action,
  }));
  report(
    'quick tap on 大招 without the ball starts the shu ride (no ball needed)',
    noBall.action === 'ride' && noBall.hint !== '需持球',
    `action ${noBall.action}, hint "${noBall.hint}"`,
  );

  // c. 攻擊 quick tap with the ball releases it (a shot or a clear, either way the ball leaves the human).
  await resetRide();
  await ballHome(400, 130);
  await tp.waitForTimeout(300);
  await quickTap(touch.cdp, await buttonPoint(tp, 48, 92));
  await tp.waitForFunction(() => window.__sg.state().ball.ownerIdx !== window.__sg.humanIdx, null, { timeout: 3000 }).catch(() => {});
  const released = await tp.evaluate(() => {
    const s = window.__sg.state();
    return { owner: s.ball.ownerIdx, human: window.__sg.humanIdx, vx: s.ball.vx };
  });
  report('quick tap on 攻擊 with the ball releases it', released.owner !== released.human, `owner ${released.owner}, ball vx ${released.vx.toFixed(1)}`);
  await touch.context.close();

  // d. Zhou Yu (wu MF, human=7, noBall) 大招 quick tap without the ball casts 赤壁東風 at once. The opponent 60 px in front of him is blown
  // outside 150 px at the cast (shot at the blow-out). A second opponent is then moved inside the live field and gets the slow debuff.
  // The tornado, burst ring, field loop and debuff are latched every frame in the rAF loop (short-lived states).
  const zhouyuDir = '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/zhouyu';
  mkdirSync(zhouyuDir, { recursive: true });
  const wu = await openTouchMatch(browser, 7, 'wu');
  const wp = wu.page;
  await wp.evaluate(() => {
    window.__zyFx = { tornado: false, burst: false, active: false, slow: false };
    const scene = window.__sg.scene;
    const tick = () => {
      if (window.__sg.scene !== scene) return;
      for (const f of scene.fx) {
        if (!f.sprite.visible) continue;
        const k = f.sprite.name.replace('fx:', '');
        if (k in window.__zyFx) window.__zyFx[k] = true;
        // The field keeps its sprite name (fx:burst) when it swaps to the loop, so the loop is latched by its animation key.
        if (f.sprite.anims?.currentAnim?.key === 'fx-zhouyu:active') window.__zyFx.active = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await wp.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.facingX = 1;
    h.facingY = 0;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    const near = s.players.find((p) => p.team !== h.team && p.role !== 'GK');
    near.x = h.x + 60;
    near.y = h.y;
    near.vx = 0;
    near.vy = 0;
    window.__zyNear = near.idx;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 100;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await wp.waitForTimeout(200);
  await quickTap(wu.cdp, await buttonPoint(wp, 128, 92));
  await wp.waitForFunction(() => window.__sg.state().eastwinds.length > 0, null, { timeout: 3000 }).catch(() => {});
  const zyCast = await wp.evaluate(() => {
    const s = window.__sg.state();
    const me = s.players[window.__sg.humanIdx];
    const w = s.eastwinds[0];
    const near = s.players[window.__zyNear];
    return {
      charId: me.charId,
      winds: s.eastwinds.length,
      hint: window.__sg.lastHint(),
      dist: w ? Math.hypot(near.x - w.x, near.y - w.y) : -1,
    };
  });
  await wp.screenshot({ path: resolve(zhouyuDir, 'zhouyu-blow-out.png'), scale: 'css' });
  report(
    'quick tap on 大招 without the ball (zhouyu) casts 赤壁東風, no 需持球 hint',
    zyCast.charId === 'zhouyu' && zyCast.winds > 0 && zyCast.hint !== '需持球',
    `charId ${zyCast.charId}, eastwinds ${zyCast.winds}, hint "${zyCast.hint}"`,
  );
  report('opponent 60 px ahead is blown outside 150 px at the cast', zyCast.dist > 150, `distance ${zyCast.dist.toFixed(0)}`);
  await wp.waitForFunction(() => window.__zyFx.tornado && window.__zyFx.burst && window.__zyFx.active, null, { timeout: 3000, polling: 'raf' }).catch(() => {});
  const fieldFx = await wp.evaluate(() => window.__zyFx);
  report(
    'eastwind shows the tornado, the burst ring and then the live wind field',
    fieldFx.tornado && fieldFx.burst && fieldFx.active,
    `tornado ${fieldFx.tornado}, burst ${fieldFx.burst}, active ${fieldFx.active}`,
  );
  await wp.evaluate(() => {
    const s = window.__sg.state();
    const me = s.players[window.__sg.humanIdx];
    const far = s.players.find((p) => p.team !== me.team && p.role !== 'GK' && p.idx !== window.__zyNear);
    far.x = me.x + 80;
    far.y = me.y;
    far.vx = 0;
    far.vy = 0;
    window.__zyFar = far.idx;
  });
  await wp.waitForFunction(() => window.__zyFx.slow, null, { timeout: 2000, polling: 'raf' }).catch(() => {});
  const inside = await wp.evaluate(() => {
    const s = window.__sg.state();
    const w = s.eastwinds[0];
    const far = s.players[window.__zyFar];
    return { slow: window.__zyFx.slow, dist: w ? Math.hypot(far.x - w.x, far.y - w.y) : -1 };
  });
  await wp.screenshot({ path: resolve(zhouyuDir, 'zhouyu-field-active.png'), scale: 'css' });
  report('slow debuff overlays the opponent inside the live field', inside.slow && inside.dist <= 150, `slow ${inside.slow}, distance ${inside.dist.toFixed(0)}`);
  await wu.context.close();

  // e. Da Qiao (wu, human=6) 大招 quick tap without the ball casts 時空之門 at once (no 需持球 hint). Her teammates are summoned to her at 0.5 s.
  const dq = await openTouchMatch(browser, 6, 'wu');
  const dp = dq.page;
  await dp.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 100;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await dp.waitForTimeout(200);
  await quickTap(dq.cdp, await buttonPoint(dp, 128, 92));
  await dp.waitForFunction(() => window.__sg.state().portals.length > 0, null, { timeout: 3000 }).catch(() => {});
  const cast = await dp.evaluate(() => ({
    charId: window.__sg.state().players[window.__sg.humanIdx].charId,
    portals: window.__sg.state().portals.length,
    hint: window.__sg.lastHint(),
  }));
  report(
    'quick tap on 大招 without the ball (daqiao) casts the portal, no 需持球 hint',
    cast.charId === 'daqiao' && cast.portals > 0 && cast.hint !== '需持球',
    `charId ${cast.charId}, portals ${cast.portals}, hint "${cast.hint}"`,
  );
  await dp.waitForFunction(() => window.__sg.state().portals.some((f) => f.summoned), null, { timeout: 3000 }).catch(() => {});
  const near = await dp.evaluate(() => {
    const s = window.__sg.state();
    const me = s.players[window.__sg.humanIdx];
    return s.players.filter((p) => p.team === me.team && p.idx !== me.idx && p.role !== 'GK' && Math.hypot(p.x - me.x, p.y - me.y) <= 100).length;
  });
  report('portal summons teammates next to her at 0.5 s', near >= 1, `teammates within 100 px ${near}`);
  await dp.screenshot({ path: shot('portal-daqiao.png') });
  await dq.context.close();

  // f. The field is live (its circle loops from the forming) with an opponent 90 px ahead of Da Qiao inside it: shot at the portal's 60th tick,
  // while the 2 s portal is still on and the staged opponent is bound by the chain.
  const dq2 = await openTouchMatch(browser, 6, 'wu');
  const dp2 = dq2.page;
  await dp2.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 300;
    h.y = 130;
    h.facingX = 1;
    h.facingY = 0;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    const foe = s.players.find((p) => p.team !== h.team && p.role !== 'GK');
    foe.x = h.x + 90;
    foe.y = h.y;
    foe.vx = 0;
    foe.vy = 0;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 100;
    s.ball.y = 70;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await dp2.waitForTimeout(200);
  await quickTap(dq2.cdp, await buttonPoint(dp2, 128, 92));
  await dp2.waitForFunction(() => window.__sg.state().portals.some((f) => f.ticks >= 60), null, { timeout: 4000, polling: 'raf' }).catch(() => {});
  const live = await dp2.evaluate(() => {
    const s = window.__sg.state();
    const f = s.portals[0];
    const me = s.players[window.__sg.humanIdx];
    const foe = s.players.find((p) => p.team !== me.team && p.role !== 'GK');
    return { ticks: f?.ticks ?? -1, inside: Math.hypot(foe.x - f?.x, foe.y - f?.y) <= 140 };
  });
  await dp2.screenshot({ path: '/tmp/claude-1000/-home-safe3admin/0b7bc786-6b15-4a7f-930c-d14bce7049d1/scratchpad/daqiao/daqiao-field-active.png', scale: 'css' });
  report('portal field is live at its 60th tick with the staged opponent inside', live.ticks >= 60 && live.inside, `ticks ${live.ticks}, inside ${live.inside}`);
  await dq2.context.close();

  // g. Sun Quan (wu GK, human=5) 大招 quick tap without the ball raises 受箭回舟 at once. The ship rises at his goal (fx:emerge, then a stage frame).
  // A ball crossing the ship line once it is up is blocked: no goal, one arrow, stage 2 shows. The volley fires at the end of the 2 s window.
  const sq = await openTouchMatch(browser, 5, 'wu');
  const sp = sq.page;
  // Every frame, latches the ship's animation keys and the arrows in flight (short-lived states).
  await sp.evaluate(() => {
    window.__sgShip = { anims: [], arrowFx: false };
    const scene = window.__sg.scene;
    const tick = () => {
      if (window.__sg.scene !== scene) return;
      for (const f of scene.fx) {
        if (f.sprite.name === 'fx:emerge') {
          const k = f.sprite.anims?.currentAnim?.key;
          if (k && !window.__sgShip.anims.includes(k)) window.__sgShip.anims.push(k);
        }
        if (f.sprite.name === 'fx:arrow' && f.sprite.visible) window.__sgShip.arrowFx = true;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await sp.evaluate(() => {
    const s = window.__sg.state();
    const h = s.players[window.__sg.humanIdx];
    h.x = 1100;
    h.y = 130;
    h.stamina = h.maxStamina;
    h.specialCooldown = 0;
    s.ball.ownerIdx = -1;
    s.ball.lastTouchIdx = -1;
    s.ball.special = null;
    s.ball.x = 1160;
    s.ball.y = 130;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
  });
  await sp.waitForTimeout(200);
  const scoreBefore = await sp.evaluate(() => window.__sg.state().match.score.slice());
  await quickTap(sq.cdp, await buttonPoint(sp, 128, 92));
  await sp.waitForFunction(() => window.__sg.state().arrowships.length > 0, null, { timeout: 2000, polling: 'raf' }).catch(() => {});
  const raised = await sp.evaluate(() => ({
    charId: window.__sg.state().players[window.__sg.humanIdx].charId,
    ships: window.__sg.state().arrowships.length,
    hint: window.__sg.lastHint(),
  }));
  report(
    'quick tap on 大招 without the ball (sunquan) raises the arrowship, no 需持球 hint',
    raised.charId === 'sunquan' && raised.ships > 0 && raised.hint !== '需持球',
    `charId ${raised.charId}, ships ${raised.ships}, hint "${raised.hint}"`,
  );
  // Screenshots are slow in headless, so the ship's timer is held (its ticks reset to 0, test-only) before each one, not counted in the window.
  const holdShip = () => sp.evaluate(() => {
    for (const a of window.__sg.state().arrowships) a.ticks = 0;
  });
  const emerging = await sp.waitForFunction(() => window.__sgShip.anims.includes('fx-sunquan:emerge'), null, { timeout: 2000, polling: 'raf' })
    .then(() => true, () => false);
  await holdShip();
  await sp.screenshot({ path: shot('ship-emerging.png'), scale: 'css' });
  report('ship emerges at his goal (fx-sunquan:emerge)', emerging);
  // The stage frame (stage 1, no arrows yet) shows once the ship has risen.
  const risen = await sp.waitForFunction(() => window.__sgShip.anims.includes('fx-sunquan:stage1'), null, { timeout: 2000, polling: 'raf' })
    .then(() => true, () => false);
  report('ship rises then shows the first arrow stage (fx-sunquan:stage1)', risen);
  // The shot: the ball crosses the ship line at 1170 from the field side and is stopped (blocked, one arrow).
  await holdShip();
  await sp.evaluate(() => {
    window.__sg.state().ball.vx = 1200;
  });
  const blocked = await sp.waitForFunction(() => window.__sg.state().arrowships.some((a) => a.arrows >= 1), null, { timeout: 2000, polling: 'raf' })
    .then(() => true, () => false);
  const stage2 = await sp.waitForFunction(() => window.__sgShip.anims.includes('fx-sunquan:stage2'), null, { timeout: 2000, polling: 'raf' })
    .then(() => true, () => false);
  await holdShip();
  await sp.screenshot({ path: shot('ship-arrows.png'), scale: 'css' });
  const afterBlock = await sp.evaluate(() => ({
    arrows: window.__sg.state().arrowships[0]?.arrows ?? -1,
    score: window.__sg.state().match.score.slice(),
  }));
  report('shot at goal is blocked by the ship (arrows counted)', blocked && afterBlock.arrows === 1, `arrows ${afterBlock.arrows}`);
  report('arrow stage advances after the block (fx-sunquan:stage2)', stage2);
  await sp.waitForTimeout(300);
  const noGoal = await sp.evaluate((before) => window.__sg.state().match.score.every((v, i) => v === before[i]), scoreBefore);
  report('no goal from the blocked shot', noGoal, `score ${scoreBefore.join('-')}`);
  // The volley: when the 2 s window ends (the ship turns and fires), the arrows fly across and the ship fades.
  const volley = await sp.waitForFunction(() => window.__sgShip.anims.includes('fx-sunquan:volley'), null, { timeout: 6000, polling: 'raf' })
    .then(() => true, () => false);
  await sp.screenshot({ path: shot('ship-volley.png'), scale: 'css' });
  const arrowFx = await sp.evaluate(() => window.__sgShip.arrowFx);
  report('volley fires at the end of the 2 s window (fx-sunquan:volley)', volley);
  report('volley arrows fly across (fx:arrow)', arrowFx);
  const faded = await sp.waitForFunction(() => !window.__sg.scene.fx.some((f) => f.sprite.name === 'fx:emerge'), null, { timeout: 6000, polling: 'raf' })
    .then(() => true, () => false);
  report('ship fades after the volley', faded);
  await sq.context.close();
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  failed = true;
} finally {
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
