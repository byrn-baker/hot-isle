import Phaser from 'phaser';
import { CELL_SIZE, COLOR_MELTDOWN } from '@/utils/constants';
import { TemperatureBar } from '@/ui/TemperatureBar';

export class ServerRackSprite extends Phaser.GameObjects.Container {
  public gridX: number;
  public gridY: number;
  public serverId: string;
  private sprite: Phaser.GameObjects.Sprite;
  private temperatureBar: TemperatureBar;

  constructor(
    scene: Phaser.Scene,
    gridX: number,
    gridY: number,
    serverId: string,
    meltdownThreshold: number,
    safeThreshold: number,
    offsetX: number,
    offsetY: number
  ) {
    const pixelX = offsetX + gridX * CELL_SIZE + CELL_SIZE / 2;
    const pixelY = offsetY + gridY * CELL_SIZE + CELL_SIZE / 2;

    super(scene, pixelX, pixelY);

    this.gridX = gridX;
    this.gridY = gridY;
    this.serverId = serverId;

    // Server sprite
    this.sprite = new Phaser.GameObjects.Sprite(scene, 0, 0, 'server');
    this.sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
    this.add(this.sprite);

    // Temperature bar positioned below the server sprite
    this.temperatureBar = new TemperatureBar(
      scene,
      pixelX,
      pixelY + CELL_SIZE / 2 - 6,
      meltdownThreshold,
      safeThreshold
    );

    scene.add.existing(this);
  }

  updateTemperature(temperature: number, isMeltedDown: boolean): void {
    this.temperatureBar.update(temperature, isMeltedDown);

    // Meltdown visual on the server sprite itself
    if (isMeltedDown && !this.hasMeltdownPlayed) {
      this.playMeltdownAnimation();
    }
  }

  private hasMeltdownPlayed = false;

  private playMeltdownAnimation(): void {
    this.hasMeltdownPlayed = true;
    this.sprite.setTint(COLOR_MELTDOWN);

    // Shake effect
    this.scene.tweens.add({
      targets: this,
      x: this.x - 3,
      duration: 50,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.inOut',
    });

    // Flash and smoke effect
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.4,
      duration: 200,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.sprite.setAlpha(0.6);
      },
    });

    // Emit "smoke" particles (simple expanding circles)
    for (let i = 0; i < 5; i++) {
      const particle = this.scene.add.circle(
        this.x + Phaser.Math.Between(-10, 10),
        this.y + Phaser.Math.Between(-10, 10),
        3,
        0x555555,
        0.7
      );
      this.scene.tweens.add({
        targets: particle,
        y: particle.y - 30,
        alpha: 0,
        scale: 2.5,
        duration: 600 + i * 100,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  }
}
