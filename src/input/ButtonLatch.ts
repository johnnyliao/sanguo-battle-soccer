/**
 * Keeps a quick press alive until the next input sample. A press and release that both happen between two samples
 * (one 60 Hz tick) would otherwise be lost. press() is called when a press starts; consume() is called once per sample.
 */
export class ButtonLatch<K extends string> {
  private latched = new Set<K>();

  /** Records a press that started since the last consume(). */
  press(key: K): void {
    this.latched.add(key);
  }

  /** True if the key is held now or was pressed since the last consume(). Clears the latch. */
  consume(key: K, held: boolean): boolean {
    const wasPressed = this.latched.delete(key);
    return held || wasPressed;
  }

  clear(): void {
    this.latched.clear();
  }
}
