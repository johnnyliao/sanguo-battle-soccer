import Phaser from 'phaser';

/** Minimum logical size. Scenes lay out in these units; the view grows past them to fill the window. */
export const BASE_W = 640;
export const BASE_H = 360;

/** Logical view size W×H and the camera zoom Z (canvas pixels per logical unit). */
export interface View {
  W: number;
  H: number;
  Z: number;
}

let textRes = 2;

/** Text resolution for crisp glyphs at the current zoom (at least 2). */
export function textResolution(): number {
  return textRes;
}

/**
 * Fits a 16:9 base of baseH rows (baseH×16/9 wide, BASE_W×BASE_H by default) inside the canvas on one axis and fills
 * the rest of the canvas on the other.
 */
export function computeView(canvasW: number, canvasH: number, baseH = BASE_H): View {
  const baseW = (baseH * 16) / 9;
  const Z = Math.min(canvasH / baseH, canvasW / baseW);
  return { W: canvasW / Z, H: canvasH / Z, Z };
}

/**
 * Sets the scene's main camera to the window view and keeps it updated on resize.
 * `onChange` runs after each resize so the scene can re-layout. The listener is removed on shutdown.
 * `baseH` is the scene's base height (BASE_H unless the scene draws bigger on touch devices).
 */
export function applyView(scene: Phaser.Scene, onChange?: (view: View) => void, baseH = BASE_H): View {
  const update = (): View => {
    const view = computeView(scene.scale.width, scene.scale.height, baseH);
    textRes = Math.max(2, Math.round(view.Z));
    scene.cameras.main.setZoom(view.Z).setOrigin(0, 0);
    (window as unknown as { __sgView: View }).__sgView = view;
    return view;
  };
  const view = update();
  const onResize = (): void => {
    const next = update();
    onChange?.(next);
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  return view;
}
