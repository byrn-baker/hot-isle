import Phaser from 'phaser';
import type { DuctType, Rotation } from '@/types';
import { CELL_SIZE } from '@/utils/constants';

const TEXTURE_MAP: Record<DuctType, string> = {
  straight: 'duct-straight',
  corner: 'duct-corner',
  t_junction: 'duct-t-junction',
  cross: 'duct-cross',
};

export class DuctTileSprite extends Phaser.GameObjects.Sprite {
  public ductType: DuctType;
  public ductRotation: Rotation;
  public gridX: number;
  public gridY: number;

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    type: DuctType,
    rotation: Rotation,
    offsetX: number,
    offsetY: number,
    cellSize: number = CELL_SIZE
  ) {
    const pixelX = offsetX + gridX * cellSize + cellSize / 2;
    const pixelY = offsetY + gridY * cellSize + cellSize / 2;

    super(scene, pixelX, pixelY, TEXTURE_MAP[type]);

    this.ductType = type;
    this.ductRotation = rotation;
    this.gridX = gridX;
    this.gridY = gridY;

    this.setAngle(rotation);
    this.setDisplaySize(cellSize, cellSize);

    scene.add.existing(this);
  }

  rotateClockwise(): void {
    this.ductRotation = ((this.ductRotation + 90) % 360) as Rotation;
    this.scene.tweens.add({
      targets: this,
      angle: this.ductRotation,
      duration: 150,
      ease: 'Power2',
    });
  }

  remove(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.5,
      duration: 150,
      ease: 'Power2',
      onComplete: () => this.destroy(),
    });
  }
}
