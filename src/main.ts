import Phaser from 'phaser';
import { MatchScene } from './render/MatchScene';
import { ResultScene } from './render/ResultScene';
import { TeamSelectScene } from './render/TeamSelectScene';
import { TitleScene } from './render/TitleScene';

// `?quick` skips the menus and starts a default match directly (used by e2e/smoke.mjs).
// Phaser auto-starts the first scene in the list, so MatchScene is moved to the front in that case.
const quick = new URLSearchParams(window.location.search).has('quick');
const scenes = quick
  ? [MatchScene, TitleScene, TeamSelectScene, ResultScene]
  : [TitleScene, TeamSelectScene, MatchScene, ResultScene];

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

new Phaser.Game({
  type: Phaser.AUTO,
  width: 640,
  height: 360,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  input: { gamepad: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: scenes,
});
