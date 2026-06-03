import Phaser from 'phaser';
import { CELL_SIZE, COLOR_COLD, COLOR_HOT, COLOR_MELTDOWN, COLOR_SAFE, COLOR_WARM } from '@/utils/constants';

/**
 * Per-rack temperature bar that shows a color gradient (blue→yellow→red)
 * plus a numeric readout. Updates each tick from GameScene.
 */
export class TemperatureBar extends Phaser.GameObjects.Container {
  private barGraphics: Phaser.GameObjects.Graphics;
  private tempText: Phaser.GameObjects.Text;
  private dangerIcon: Phaser.GameObjects.Text;
  private meltdownThreshold: number;
  private safeThreshold: number;
  private barWidth: number;
  private barHeight: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    meltdownThreshold: number,
    safeThreshold: number
  ) {
    super(scene, x, y);

    this.meltdownThreshold = meltdownThreshold;
    this.safeThreshold = safeThreshold;
    this.barWidth = CELL_SIZE - 8;
    this.barHeight = 6;

    // Graphics for the bar
    this.barGraphics = new Phaser.GameObjects.Graphics(scene);
    this.add(this.barGraphics);

    // Numeric temperature readout
    this.tempText = new Phaser.GameObjects.Text(scene, 0, -12, '20°', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      align: 'center',
    });
    this.tempText.setOrigin(0.5, 0.5);
    this.add(this.tempText);

    // Danger icon (hidden until temperature is critical)
    this.dangerIcon = new Phaser.GameObjects.Text(scene, this.barWidth / 2 + 4, 0, '⚠', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ff1744',
    });
    this.dangerIcon.setOrigin(0, 0.5);
    this.dangerIcon.setVisible(false);
    this.add(this.dangerIcon);

    scene.add.existing(this);
  }

  /**
   * Update the bar display with the current temperature.
   */
  update(temperature: number, isMeltedDown: boolean): void {
    this.tempText.setText(`${Math.round(temperature)}°`);

    this.barGraphics.clear();

    // Background track
    this.barGraphics.fillStyle(0x263238);
    this.barGraphics.fillRect(-this.barWidth / 2, 0, this.barWidth, this.barHeight);

    // Calculate fill ratio (0 = ambient 20°, 1 = meltdown)
    const minTemp = 20;
    const ratio = Math.min(
      Math.max((temperature - minTemp) / (this.meltdownThreshold - minTemp), 0),
      1
    );
    const fillWidth = this.barWidth * ratio;

    // Color based on temperature zone
    const color = this.getBarColor(temperature, isMeltedDown, ratio);
    this.barGraphics.fillStyle(color);
    this.barGraphics.fillRect(-this.barWidth / 2, 0, fillWidth, this.barHeight);

    // Border
    this.barGraphics.lineStyle(1, 0x455a64, 0.6);
    this.barGraphics.strokeRect(-this.barWidth / 2, 0, this.barWidth, this.barHeight);

    // Update text color
    if (isMeltedDown) {
      this.tempText.setColor('#ff1744');
    } else if (temperature > this.safeThreshold) {
      const dangerRatio = (temperature - this.safeThreshold) / (this.meltdownThreshold - this.safeThreshold);
      if (dangerRatio > 0.7) {
        this.tempText.setColor('#ff5252');
      } else {
        this.tempText.setColor('#ffb74d');
      }
    } else {
      this.tempText.setColor('#81c784');
    }

    // Show danger icon when above 70% to meltdown
    const dangerRatio = (temperature - this.safeThreshold) / (this.meltdownThreshold - this.safeThreshold);
    if (dangerRatio > 0.7 && !isMeltedDown) {
      this.dangerIcon.setVisible(true);
      // Pulse effect via alpha
      this.dangerIcon.setAlpha(0.5 + 0.5 * Math.sin(Date.now() / 200));
    } else {
      this.dangerIcon.setVisible(isMeltedDown); // Show skull on meltdown
      if (isMeltedDown) {
        this.dangerIcon.setText('💀');
      }
    }
  }

  private getBarColor(temperature: number, isMeltedDown: boolean, ratio: number): number {
    if (isMeltedDown) return COLOR_MELTDOWN;
    if (temperature <= this.safeThreshold) return COLOR_SAFE;
    if (ratio > 0.85) return COLOR_HOT;
    if (ratio > 0.5) return COLOR_WARM;
    return COLOR_COLD;
  }
}
