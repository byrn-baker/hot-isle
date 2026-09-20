import Phaser from 'phaser';
import type { Direction } from '@/types';
import { CELL_SIZE } from '@/utils/constants';

const DIR_ANGLE: Record<Direction, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

const DIR_OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class ColdSourceSprite extends Phaser.GameObjects.Container {
  public gridX: number;
  public gridY: number;
  public direction: Direction;

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    direction: Direction,
    offsetX: number,
    offsetY: number,
    cellSize: number = CELL_SIZE
  ) {
    const pixelX = offsetX + gridX * cellSize + cellSize / 2;
    const pixelY = offsetY + gridY * cellSize + cellSize / 2;

    super(scene, pixelX, pixelY);

    this.gridX = gridX;
    this.gridY = gridY;
    this.direction = direction;

    // Base sprite
    const sprite = new Phaser.GameObjects.Sprite(scene, 0, 0, 'cold-source');
    sprite.setDisplaySize(cellSize, cellSize);
    this.add(sprite);

    // Animated pulsing chevrons extending out from the cell in emission direction
    const offset = DIR_OFFSET[direction];
    for (let i = 1; i <= 2; i++) {
      const chevron = new Phaser.GameObjects.Text(
        scene,
        offset.x * cellSize * 0.3 * i,
        offset.y * cellSize * 0.3 * i,
        '›',
        {
          fontSize: `${Math.round(cellSize * 0.5)}px`,
          fontFamily: 'monospace',
          color: '#4fc3f7',
        }
      );
      chevron.setOrigin(0.5);
      chevron.setAngle(DIR_ANGLE[direction]);
      chevron.setAlpha(0.7 - i * 0.2);
      this.add(chevron);

      // Pulse animation
      scene.tweens.add({
        targets: chevron,
        alpha: 0.2,
        duration: 800,
        yoyo: true,
        repeat: -1,
        delay: i * 200,
        ease: 'Sine.inOut',
      });
    }

    const outlet = new Phaser.GameObjects.Graphics(scene);
    outlet.fillStyle(0xb3fff0, 1);
    outlet.fillTriangle(cellSize * 0.30, -cellSize * 0.07,
      cellSize * 0.30, cellSize * 0.07, cellSize * 0.43, 0);
    outlet.setAngle(DIR_ANGLE[direction]);
    this.add(outlet);
    scene.add.existing(this);
  }
}
