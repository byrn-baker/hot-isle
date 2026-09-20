import Phaser from 'phaser';

export function drawBackdrop(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const g = scene.add.graphics().setDepth(-10);
  g.fillGradientStyle(0x101f32, 0x091422, 0x060c16, 0x0a1724, 1);
  g.fillRect(0, 0, width, height);
  g.lineStyle(1, 0x6bafc5, 0.045);
  for (let x = 0; x < width; x += 40) g.lineBetween(x, 0, x, height);
  for (let y = 0; y < height; y += 40) g.lineBetween(0, y, width, y);
  g.lineStyle(1, 0x5edccb, 0.18);
  g.lineBetween(24, 54, width - 24, 54);
  g.lineBetween(24, height - 64, width - 24, height - 64);
}
