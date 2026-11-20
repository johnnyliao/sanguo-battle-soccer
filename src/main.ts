import Phaser from 'phaser';
import { MatchScene } from './render/MatchScene';
import { ResultScene } from './render/ResultScene';
import { TeamSelectScene } from './render/TeamSelectScene';
import { TitleScene } from './render/TitleScene';
import { SheetLoadScene } from './render/SheetLoadScene';
import { mountAudition } from './audio/audition';

// `?quick` skips the menus and starts a default match directly (used by e2e/smoke.mjs).
// Phaser auto-starts the first scene in the list, so MatchScene is moved to the front in that case.
const quick = new URLSearchParams(window.location.search).has('quick');
const scenes = quick
  ? [MatchScene, TitleScene, TeamSelectScene, ResultScene, SheetLoadScene]
  : [TitleScene, TeamSelectScene, MatchScene, ResultScene, SheetLoadScene];

// Phones: no context menu on long press.
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Touch device held in portrait: cover the game with a "rotate your phone" hint.
const rotateHint = document.getElementById('rotate-hint');
const touchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
function updateRotateHint(): void {
  rotateHint?.classList.toggle('show', touchDevice && window.innerHeight > window.innerWidth);
}
window.addEventListener('resize', updateRotateHint);
window.addEventListener('orientationchange', updateRotateHint);
updateRotateHint();

// Canvas fills the window at up to 2x device pixels; the logical view is set per scene (render/view.ts).
const dpr = (): number => Math.min(window.devicePixelRatio || 1, 2);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: Math.round(window.innerWidth * dpr()),
  height: Math.round(window.innerHeight * dpr()),
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: false,
  roundPixels: true,
  input: { gamepad: true },
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: 1 / dpr(),
  },
  scene: scenes,
});

/** Resizes the canvas backing store to the window and keeps the CSS size equal to the window. */
function fitToWindow(): void {
  const d = dpr();
  if (game.scale.zoom !== 1 / d) game.scale.setZoom(1 / d);
  game.scale.resize(Math.round(window.innerWidth * d), Math.round(window.innerHeight * d));
}
window.addEventListener('resize', fitToWindow);
window.addEventListener('orientationchange', fitToWindow);

// `?sfx=1` opens the hidden sound audition overlay (see audio/audition.ts).
if (new URLSearchParams(window.location.search).get('sfx') === '1') mountAudition();
