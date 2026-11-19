import Phaser from 'phaser';
import { textResolution, type View } from '../render/view';
import { TICK_HZ } from '../sim/constants';
import { ButtonLatch } from './ButtonLatch';

/** Held state of the on-screen controls. */
export interface TouchState {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  dash: boolean;
  j: boolean;
  k: boolean;
  l: boolean;
}

/** The human's special as the touch button shows it. `block` = why it cannot be cast now ('需持球' / '體力不足'), or null. */
export interface SpecialStatus {
  cooldownTicks: number;
  cooldownTotal: number;
  block: string | null;
}

type ButtonKey = 'j' | 'k' | 'l';

/** Button centre measured from the bottom-right corner of the logical view. */
interface ButtonDef {
  key: ButtonKey;
  offX: number;
  offY: number;
  r: number;
  label: string;
  labelSize: string;
  /** Label during the penalty shootout. Undefined = the button is hidden during it. */
  pkLabel?: string;
}

/** Buttons sit 10 units from the right edge and from each other (J bottom-right, K above J, L left of J). */
const BUTTONS: ButtonDef[] = [
  { key: 'j', offX: 48, offY: 92, r: 38, label: '攻擊\n射門', labelSize: '16px', pkLabel: '射門' },
  { key: 'k', offX: 48, offY: 170, r: 30, label: '傳球\n叫球', labelSize: '14px', pkLabel: '高球' },
  { key: 'l', offX: 128, offY: 92, r: 32, label: '大招', labelSize: '16px' },
];

/** Joystick rest centre: 70 from the left edge, 90 from the bottom. */
const STICK_REST_X = 70;
const STICK_REST_OFF_Y = 90;
const STICK_R = 40;
const KNOB_R = 17;
const STICK_DEADZONE = 10;
const AXIS_RATIO = 0.38;
const DASH_RATIO = 0.85;
/** The joystick can start in the left 45% of the screen, below the top bar. */
const STICK_ZONE_RATIO = 0.45;
const STICK_ZONE_TOP = 40;
const POINTERS_TOTAL = 4;
const DEPTH = 1100;
const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const GOLD = 0xffd98a;
const SPECIAL_DARK = 0x222222;
const SPECIAL_RING = 0x8a929c;

interface StickClaim {
  kind: 'stick';
  ox: number;
  oy: number;
  x: number;
  y: number;
}

interface ButtonClaim {
  kind: 'button';
  def: ButtonDef;
}

type Claim = StickClaim | ButtonClaim;

/**
 * On-screen controls for phones: a floating virtual joystick on the left and the attack (J), pass / call (K) and
 * special (L) buttons on the right. Drawn above the HUD with scroll factor 0. Only active once a touch is seen (or on
 * touch-capable devices), so mouse-only desktops never show them. Positions are logical (view) units; pointers are
 * converted by the zoom.
 */
export class TouchControls {
  private scene: Phaser.Scene;
  private enabled: boolean;
  private wanted = true;
  private pk = false;
  private special: SpecialStatus = { cooldownTicks: 0, cooldownTotal: 1, block: null };
  private claims = new Map<Phaser.Input.Pointer, Claim>();
  private pressLatch = new ButtonLatch<ButtonKey>();
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[];
  private cooldownText: Phaser.GameObjects.Text;
  private blockHint: Phaser.GameObjects.Text;
  private view: View;

  constructor(scene: Phaser.Scene, view: View) {
    this.scene = scene;
    this.view = view;
    this.enabled = scene.sys.game.device.input.touch;
    const pointersTotal = scene.input.manager.pointersTotal;
    if (pointersTotal < POINTERS_TOTAL) scene.input.addPointer(POINTERS_TOTAL - pointersTotal);

    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    this.labels = BUTTONS.map((b) =>
      scene.add
        .text(0, 0, b.label, {
          fontFamily: FONT,
          fontSize: b.labelSize,
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
          resolution: textResolution(),
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH + 1),
    );
    this.cooldownText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
        resolution: textResolution(),
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setVisible(false);
    this.blockHint = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
        resolution: textResolution(),
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setVisible(false);
    this.placeLabels();

    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.draw);
    this.applyVisibility();
  }

  /** Re-anchors the controls to a new logical view (called on window resize). */
  setView(view: View): void {
    this.view = view;
    this.placeLabels();
  }

  /**
   * Current held state, once per sample. A button pressed since the previous call is reported as held even if it was
   * already released (a quick tap). All false while hidden.
   */
  state(): TouchState {
    const out: TouchState = { moveX: 0, moveY: 0, dash: false, j: false, k: false, l: false };
    if (!this.isShown()) {
      this.pressLatch.clear();
      return out;
    }
    for (const claim of this.claims.values()) {
      if (claim.kind === 'button') {
        if (this.isActive(claim.def)) out[claim.def.key] = true;
        continue;
      }
      const dx = claim.x - claim.ox;
      const dy = claim.y - claim.oy;
      const len = Math.hypot(dx, dy);
      if (len <= STICK_DEADZONE) continue;
      if (Math.abs(dx) > AXIS_RATIO * len) out.moveX = dx > 0 ? 1 : -1;
      if (Math.abs(dy) > AXIS_RATIO * len) out.moveY = dy > 0 ? 1 : -1;
      if (len > DASH_RATIO * STICK_R) out.dash = true;
    }
    for (const key of ['j', 'k', 'l'] as const) out[key] = this.pressLatch.consume(key, out[key]);
    return out;
  }

  /** Penalty shootout on or off: relabels J and K for the shootout and hides the special button. */
  setPk(on: boolean): void {
    if (this.pk === on) return;
    this.pk = on;
    this.applyVisibility();
  }

  /** The human's special state: ready (gold) when no cooldown and no block; otherwise dark, with the cooldown sweep. */
  setSpecialStatus(status: SpecialStatus): void {
    this.special = status;
  }

  /** Shows or hides the controls. Hidden on desktops that never produced a touch. */
  setVisible(visible: boolean): void {
    this.wanted = visible;
    if (!visible) this.claims.clear();
    this.applyVisibility();
  }

  /** True when the controls are enabled for this device and currently wanted on screen. */
  isShown(): boolean {
    return this.enabled && this.wanted;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.draw);
    this.claims.clear();
    this.gfx.destroy();
    this.labels.forEach((t) => t.destroy());
    this.cooldownText.destroy();
    this.blockHint.destroy();
  }

  /** A button is in use in the current mode (the special is hidden during the shootout). */
  private isActive(def: ButtonDef): boolean {
    return !this.pk || def.pkLabel !== undefined;
  }

  private activeButtons(): ButtonDef[] {
    return BUTTONS.filter((b) => this.isActive(b));
  }

  private labelText(def: ButtonDef): string {
    if (this.pk) return def.pkLabel ?? '';
    return def.label;
  }

  private buttonAt(def: ButtonDef): { x: number; y: number } {
    return { x: this.view.W - def.offX, y: this.view.H - def.offY };
  }

  private stickRest(): { x: number; y: number } {
    return { x: STICK_REST_X, y: this.view.H - STICK_REST_OFF_Y };
  }

  /** Pointer position in logical view units (canvas pixels divided by the zoom). */
  private logical(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: p.x / this.view.Z, y: p.y / this.view.Z };
  }

  private inScreen(p: { x: number; y: number }): boolean {
    return p.x >= 0 && p.x <= this.view.W && p.y >= 0 && p.y <= this.view.H;
  }

  private inCircle(x: number, y: number, def: ButtonDef): boolean {
    const c = this.buttonAt(def);
    return Math.hypot(x - c.x, y - c.y) <= def.r;
  }

  private placeLabels(): void {
    BUTTONS.forEach((b, i) => {
      const c = this.buttonAt(b);
      this.labels[i].setPosition(c.x, c.y);
    });
    const special = BUTTONS.find((b) => b.key === 'l');
    if (special) {
      const c = this.buttonAt(special);
      this.cooldownText.setPosition(c.x, c.y);
      this.blockHint.setPosition(c.x, c.y + special.r + 4);
    }
  }

  private applyVisibility(): void {
    const shown = this.isShown();
    this.gfx.setVisible(shown);
    BUTTONS.forEach((b, i) => this.labels[i].setVisible(shown && this.isActive(b)));
  }

  private onDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.enabled && pointer.wasTouch) {
      this.enabled = true;
      this.applyVisibility();
    }
    if (!this.isShown()) return;
    const p = this.logical(pointer);
    if (!this.inScreen(p)) return;

    const button = this.activeButtons().find((b) => this.inCircle(p.x, p.y, b));
    if (button) {
      this.claims.set(pointer, { kind: 'button', def: button });
      this.pressLatch.press(button.key);
      return;
    }
    if (p.x < this.view.W * STICK_ZONE_RATIO && p.y > STICK_ZONE_TOP && !this.findStick()) {
      this.claims.set(pointer, { kind: 'stick', ox: p.x, oy: p.y, x: p.x, y: p.y });
    }
  };

  private onMove = (pointer: Phaser.Input.Pointer): void => {
    const claim = this.claims.get(pointer);
    if (!claim) return;
    const p = this.logical(pointer);
    if (claim.kind === 'stick') {
      claim.x = p.x;
      claim.y = p.y;
    } else if (!this.inCircle(p.x, p.y, claim.def)) {
      // Sliding off a button releases it.
      this.claims.delete(pointer);
    }
  };

  private onUp = (pointer: Phaser.Input.Pointer): void => {
    this.claims.delete(pointer);
  };

  private findStick(): StickClaim | undefined {
    for (const claim of this.claims.values()) {
      if (claim.kind === 'stick') return claim;
    }
    return undefined;
  }

  private isPressed(key: ButtonKey): boolean {
    for (const claim of this.claims.values()) {
      if (claim.kind === 'button' && claim.def.key === key) return true;
    }
    return false;
  }

  private draw = (): void => {
    const g = this.gfx.clear();
    const shown = this.isShown();
    const { cooldownTicks, block } = this.special;
    const cooling = cooldownTicks > 0;
    const ready = !cooling && block === null;
    this.labels.forEach((t, i) => {
      const b = BUTTONS[i];
      const text = this.labelText(b);
      if (t.text !== text) t.setText(text);
      // While cooling down the special shows the seconds instead of its label. Not ready = dimmed label.
      t.setVisible(shown && this.isActive(b) && !(b.key === 'l' && cooling));
      if (b.key === 'l') t.setAlpha(ready ? 1 : 0.5);
    });
    const seconds = `${Math.ceil(cooldownTicks / TICK_HZ)}`;
    if (this.cooldownText.text !== seconds) this.cooldownText.setText(seconds);
    this.cooldownText.setVisible(shown && !this.pk && cooling);
    // Under the special: why it cannot be cast yet (only when not cooling down, and not in the shootout).
    if (block !== null && this.blockHint.text !== block) this.blockHint.setText(block);
    this.blockHint.setVisible(shown && !this.pk && !cooling && block !== null);
    if (!shown) return;

    const stick = this.findStick();
    const rest = this.stickRest();
    const ox = stick ? stick.ox : rest.x;
    const oy = stick ? stick.oy : rest.y;
    const dx = stick ? stick.x - stick.ox : 0;
    const dy = stick ? stick.y - stick.oy : 0;
    const len = Math.hypot(dx, dy);
    const scale = len > STICK_R ? STICK_R / len : 1;
    const alpha = stick ? 0.5 : 0.2;
    g.fillStyle(0xffffff, alpha * 0.4);
    g.fillCircle(ox, oy, STICK_R);
    g.lineStyle(2, 0xffffff, alpha);
    g.strokeCircle(ox, oy, STICK_R);
    g.fillStyle(0xffffff, alpha + 0.2);
    g.fillCircle(ox + dx * scale, oy + dy * scale, KNOB_R);

    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 160);
    for (const b of this.activeButtons()) {
      const pressed = this.isPressed(b.key);
      const c = this.buttonAt(b);
      if (b.key === 'l') {
        this.drawSpecial(g, c.x, c.y, b.r, pressed, ready, pulse);
        continue;
      }
      g.fillStyle(pressed ? 0xffd98a : 0xffffff, pressed ? 0.6 : 0.25);
      g.fillCircle(c.x, c.y, b.r);
      g.lineStyle(2, 0xffffff, pressed ? 0.9 : 0.5);
      g.strokeCircle(c.x, c.y, b.r);
    }
  };

  /**
   * The special button. Ready: solid gold with a pulsing glow ring. Otherwise dark, and while cooling down a dark pie
   * sweeps clockwise from 12 o'clock over the part of the cooldown still to go. Tapping is always accepted.
   */
  private drawSpecial(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    r: number,
    pressed: boolean,
    ready: boolean,
    pulse: number,
  ): void {
    if (ready) {
      g.fillStyle(GOLD, 0.25 + 0.15 * pulse);
      g.fillCircle(x, y, r + 6);
      g.fillStyle(GOLD, pressed ? 1 : 0.85);
      g.fillCircle(x, y, r);
      g.lineStyle(2, 0xffffff, 1);
      g.strokeCircle(x, y, r);
      return;
    }
    g.fillStyle(SPECIAL_DARK, 0.47);
    g.fillCircle(x, y, r);
    g.lineStyle(2, SPECIAL_RING, 0.8);
    g.strokeCircle(x, y, r);
    const { cooldownTicks, cooldownTotal } = this.special;
    if (cooldownTicks > 0 && cooldownTotal > 0) {
      const frac = Math.min(1, cooldownTicks / cooldownTotal);
      g.fillStyle(0x000000, 0.5);
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
      g.closePath();
      g.fillPath();
    }
  }
}
