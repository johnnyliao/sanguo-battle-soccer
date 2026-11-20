import Phaser from 'phaser';
import type { Country } from '../data';
import { matchSheets, queueSheets, type SheetFile } from './sprites';

/** Scene key of the background sheet loader. */
export const SHEET_LOAD_SCENE = 'SheetLoadScene';

/**
 * Downloads the sheets of the match being set up while the menus are up. It is a scene of its own, running beside the menus,
 * so its loader is not reset when a menu scene stops. MatchScene waits for the sheets still downloading here rather than
 * downloading them a second time. It has nothing to draw.
 */
export class SheetLoadScene extends Phaser.Scene {
  /** Keys queued here and not yet failed. */
  private queued = new Set<string>();

  constructor() {
    super(SHEET_LOAD_SCENE);
  }

  create(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.queued.delete(file.key));
  }

  /** Queues the sheets of a match between these countries that are neither loaded nor queued yet, and starts the loader. */
  queueMatch(home: Country, away: Country): void {
    const files = matchSheets(home, away).filter((f) => !this.textures.exists(f.key) && !this.queued.has(f.key));
    for (const f of files) this.queued.add(f.key);
    queueSheets(this.load, files);
    this.load.start();
  }

  /** Whether this sheet is queued here and still downloading. */
  isPending(key: string): boolean {
    return this.queued.has(key) && !this.textures.exists(key);
  }

  /** Whether any of these files is still downloading here. */
  hasPending(files: SheetFile[]): boolean {
    return files.some((f) => this.isPending(f.key));
  }
}
