import Phaser from 'phaser';
import { MatchScene } from './render/MatchScene';

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
  scene: [MatchScene],
});
