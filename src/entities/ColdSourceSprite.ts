import Phaser from 'phaser';
import type { Direction } from '@/types';
import { CELL_SIZE, COLOR_COLD } from '@/utils/constants';

const DIR_ANGLE: Record<Direction, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

export class ColdSourceSprite extends Phaser.GameObjects.Container {
  public gridX: number;
  public gridY: number;
  public direction: Direction;
  private sprite: Phaser.GameObjects.Sprite;
  private arrow: Phaser.GameObjects.Graphics;

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
    this.sprite = new Phaser.GameObjects.Sprite(scene, 0, 0, 'cold-source');
    this.sprite.setDisplaySize(cellSize, cellSize);
    this.add(this.sprite);

    // Direction arrow
    this.arrow = new Phaser.GameObjects.Graphics(scene);
    this.arrow.fillStyle(COLOR_COLD, 0.9);
    this.arrow.fillTriangle(-6, -8, -6, 8, 10, 0);
    this.arrow.setAngle(DIR_ANGLE[direction]);
    this.add(this.arrow);

    scene.add.existing(this);
  }
}
