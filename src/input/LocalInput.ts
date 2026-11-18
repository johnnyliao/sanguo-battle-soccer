import Phaser from 'phaser';
import type { InputFrame } from '../sim/types';
import { DashDetector } from './DashDetector';
import { buildInputFrame, type RawInput } from './buildInputFrame';

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

/**
 * Phaser adapter: reads keyboard and gamepad 0 into a RawInput each tick and
 * returns the InputFrame. Keyboard and gamepad are combined with OR.
 */
export class LocalInput {
  private keys: Partial<Record<KeyName, Phaser.Input.Keyboard.Key>> = {};
  private scene: Phaser.Scene;
  private dash = new DashDetector();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L') as Partial<
        Record<KeyName, Phaser.Input.Keyboard.Key>
      >;
    }
  }

  /** Samples the current input state once per tick. */
  sample(): InputFrame {
    const down = (name: KeyName): boolean => this.keys[name]?.isDown ?? false;
    const pad = this.scene.input.gamepad?.getPad(0);
    const padBtn = (index: number): boolean => pad?.buttons[index]?.pressed ?? false;
    const stickX = pad?.leftStick.x ?? 0;
    const stickY = pad?.leftStick.y ?? 0;

    const raw: RawInput = {
      left: down('A') || down('LEFT') || stickX < -STICK_DEADZONE || padBtn(PAD_DPAD_LEFT),
      right: down('D') || down('RIGHT') || stickX > STICK_DEADZONE || padBtn(PAD_DPAD_RIGHT),
      up: down('W') || down('UP') || stickY < -STICK_DEADZONE || padBtn(PAD_DPAD_UP),
      down: down('S') || down('DOWN') || stickY > STICK_DEADZONE || padBtn(PAD_DPAD_DOWN),
      j: down('J') || padBtn(PAD_BTN_J),
      k: down('K') || padBtn(PAD_BTN_K),
      l: down('L') || padBtn(PAD_BTN_L),
      dashButton: padBtn(PAD_BTN_DASH),
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
  }
}
