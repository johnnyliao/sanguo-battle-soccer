import Phaser from 'phaser';
import type { InputFrame } from '../sim/types';
import { ButtonLatch } from './ButtonLatch';
import { DashDetector } from './DashDetector';
import { buildInputFrame, type RawInput } from './buildInputFrame';
import type { TouchControls } from './TouchControls';

const STICK_DEADZONE = 0.4;

// Standard gamepad mapping button indices.
const PAD_BTN_K = 0; // A
const PAD_BTN_L = 1; // B
const PAD_BTN_J = 2; // X
const PAD_BTN_DASH = 5; // RB / R1
const PAD_DPAD_UP = 12;
const PAD_DPAD_DOWN = 13;
const PAD_DPAD_LEFT = 14;
const PAD_DPAD_RIGHT = 15;

type KeyName = 'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'J' | 'K' | 'L';
type ActionKey = 'j' | 'k' | 'l';

/** Keyboard keys and gamepad buttons whose presses are latched (see ButtonLatch). */
const LATCHED_KEYS: [KeyName, ActionKey][] = [
  ['J', 'j'],
  ['K', 'k'],
  ['L', 'l'],
];

function padLatchKey(index: number): ActionKey | null {
  if (index === PAD_BTN_J) return 'j';
  if (index === PAD_BTN_K) return 'k';
  if (index === PAD_BTN_L) return 'l';
  return null;
}

/**
 * Phaser adapter: reads keyboard and gamepad 0 into a RawInput each tick and
 * returns the InputFrame. Keyboard and gamepad are combined with OR.
 */
export class LocalInput {
  private keys: Partial<Record<KeyName, Phaser.Input.Keyboard.Key>> = {};
  private scene: Phaser.Scene;
  private dash = new DashDetector();
  private touch?: TouchControls;
  private latch = new ButtonLatch<ActionKey>();

  constructor(scene: Phaser.Scene, touch?: TouchControls) {
    this.scene = scene;
    this.touch = touch;
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L') as Partial<
        Record<KeyName, Phaser.Input.Keyboard.Key>
      >;
      for (const [name, action] of LATCHED_KEYS) {
        this.keys[name]?.on('down', () => this.latch.press(action));
      }
    }
    scene.input.gamepad?.on('down', this.onPadDown);
  }

  private onPadDown = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button): void => {
    const action = padLatchKey(button.index);
    if (action) this.latch.press(action);
  };

  /** Samples the current input state once per tick. */
  sample(): InputFrame {
    const down = (name: KeyName): boolean => this.keys[name]?.isDown ?? false;
    const pad = this.scene.input.gamepad?.getPad(0);
    const padBtn = (index: number): boolean => pad?.buttons[index]?.pressed ?? false;
    const stickX = pad?.leftStick.x ?? 0;
    const stickY = pad?.leftStick.y ?? 0;
    const t = this.touch?.state();

    // Touch dash goes through dashButton, which buildInputFrame ORs in directly (not through DashDetector).
    const raw: RawInput = {
      left: down('A') || down('LEFT') || stickX < -STICK_DEADZONE || padBtn(PAD_DPAD_LEFT) || t?.moveX === -1,
      right: down('D') || down('RIGHT') || stickX > STICK_DEADZONE || padBtn(PAD_DPAD_RIGHT) || t?.moveX === 1,
      up: down('W') || down('UP') || stickY < -STICK_DEADZONE || padBtn(PAD_DPAD_UP) || t?.moveY === -1,
      down: down('S') || down('DOWN') || stickY > STICK_DEADZONE || padBtn(PAD_DPAD_DOWN) || t?.moveY === 1,
      j: this.latch.consume('j', down('J') || padBtn(PAD_BTN_J) || t?.j === true),
      k: this.latch.consume('k', down('K') || padBtn(PAD_BTN_K) || t?.k === true),
      l: this.latch.consume('l', down('L') || padBtn(PAD_BTN_L) || t?.l === true),
      dashButton: padBtn(PAD_BTN_DASH) || t?.dash === true,
    };

    const base = buildInputFrame(raw, false);
    const dash = this.dash.update(base.moveX, base.moveY);
    return buildInputFrame(raw, dash);
  }

  destroy(): void {
    for (const key of Object.values(this.keys)) {
      if (key) this.scene.input.keyboard?.removeKey(key);
    }
    this.keys = {};
    this.scene.input.gamepad?.off('down', this.onPadDown);
  }
}
