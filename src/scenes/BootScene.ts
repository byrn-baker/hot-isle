import Phaser from 'phaser';
import {
  CELL_SIZE,
  COLOR_COLD_SOURCE,
  COLOR_DUCT,
  COLOR_GRID_BG,
  COLOR_HOT,
  COLOR_OBSTACLE,
  COLOR_SERVER,
  COLOR_COLD,
} from '@/utils/constants';

/**
 * BootScene handles generating placeholder sprite textures.
 * Since we use geometric placeholders, all "assets" are generated at runtime.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No external assets to load
  }

  create(): void {
    this.generateTextures();
    // Brief loading text before transitioning
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading...', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.time.delayedCall(100, () => {
      this.scene.start('MenuScene');
    });
  }

  private generateTextures(): void {
    const size = CELL_SIZE;

    this.generateRect('cell-bg', size, size, COLOR_GRID_BG);
    this.generateServerTexture(size);
    this.generateColdSourceTexture(size);
    this.generateRect('obstacle', size, size, COLOR_OBSTACLE);
    this.generateDuctStraight(size);
    this.generateDuctCorner(size);
    this.generateDuctTJunction(size);
    this.generateDuctCross(size);

    // Airflow particle
    const g = this.add.graphics();
    g.fillStyle(COLOR_COLD, 0.8);
    g.fillCircle(4, 4, 4);
    g.generateTexture('airflow-particle', 8, 8);
    g.destroy();
  }

  private generateRect(key: string, w: number, h: number, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(color);
    g.fillRect(0, 0, w, h);
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private generateServerTexture(size: number): void {
    const g = this.add.graphics();
    const pad = 6;
    g.fillStyle(COLOR_SERVER);
    g.fillRoundedRect(pad, pad, size - pad * 2, size - pad * 2, 4);
    g.fillStyle(COLOR_HOT);
    g.fillCircle(size / 2 - 8, size / 2, 3);
    g.fillCircle(size / 2, size / 2, 3);
    g.fillCircle(size / 2 + 8, size / 2, 3);
    g.lineStyle(2, 0x263238);
    g.strokeRoundedRect(pad, pad, size - pad * 2, size - pad * 2, 4);
    g.generateTexture('server', size, size);
    g.destroy();
  }

  private generateColdSourceTexture(size: number): void {
    const g = this.add.graphics();
    const pad = 4;
    g.fillStyle(COLOR_COLD_SOURCE);
    g.fillRoundedRect(pad, pad, size - pad * 2, size - pad * 2, 6);
    g.lineStyle(2, 0xffffff, 0.6);
    const cx = size / 2;
    const cy = size / 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      g.lineBetween(cx, cy, cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
    }
    g.generateTexture('cold-source', size, size);
    g.destroy();
  }

  private generateDuctStraight(size: number): void {
    const g = this.add.graphics();
    const w = 20;
    g.fillStyle(COLOR_DUCT);
    g.fillRect(size / 2 - w / 2, 0, w, size);
    g.lineStyle(1, 0x607d8b);
    g.strokeRect(size / 2 - w / 2, 0, w, size);
    g.generateTexture('duct-straight', size, size);
    g.destroy();
  }

  private generateDuctCorner(size: number): void {
    const g = this.add.graphics();
    const w = 20;
    g.fillStyle(COLOR_DUCT);
    g.fillRect(size / 2 - w / 2, 0, w, size / 2 + w / 2);
    g.fillRect(size / 2 - w / 2, size / 2 - w / 2, size / 2 + w / 2, w);
    g.lineStyle(1, 0x607d8b);
    g.strokeRect(size / 2 - w / 2, 0, w, size / 2);
    g.strokeRect(size / 2, size / 2 - w / 2, size / 2, w);
    g.generateTexture('duct-corner', size, size);
    g.destroy();
  }

  private generateDuctTJunction(size: number): void {
    const g = this.add.graphics();
    const w = 20;
    g.fillStyle(COLOR_DUCT);
    g.fillRect(size / 2 - w / 2, 0, w, size);
    g.fillRect(size / 2 - w / 2, size / 2 - w / 2, size / 2 + w / 2, w);
    g.lineStyle(1, 0x607d8b);
    g.strokeRect(size / 2 - w / 2, 0, w, size);
    g.strokeRect(size / 2, size / 2 - w / 2, size / 2, w);
    g.generateTexture('duct-t-junction', size, size);
    g.destroy();
  }

  private generateDuctCross(size: number): void {
    const g = this.add.graphics();
    const w = 20;
    g.fillStyle(COLOR_DUCT);
    g.fillRect(size / 2 - w / 2, 0, w, size);
    g.fillRect(0, size / 2 - w / 2, size, w);
    g.lineStyle(1, 0x607d8b);
    g.strokeRect(size / 2 - w / 2, 0, w, size);
    g.strokeRect(0, size / 2 - w / 2, size, w);
    g.generateTexture('duct-cross', size, size);
    g.destroy();
  }
}
