import Phaser from 'phaser';

/** Hardware textures rendered at double resolution without external assets. */
export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  create(): void {
    this.texture('server', c => {
      this.panel(c, 8, 4, 48, 56, '#354b61', '#111e30');
      c.fillStyle = '#080f1b'; c.fillRect(13, 9, 38, 43);
      for (let row = 0; row < 4; row++) {
        const y = 11 + row * 10;
        this.panel(c, 15, y, 34, 8, '#3b5065', '#243449');
        c.fillStyle = '#081421';
        for (let x = 20; x < 39; x += 4) c.fillRect(x, y + 2, 2, 4);
        c.fillStyle = '#6ce8d5'; c.fillRect(43, y + 3, 3, 2);
      }
      c.fillStyle = '#829aaf';
      for (const x of [10, 52]) for (const y of [7, 55]) c.fillRect(x, y, 2, 2);
    });
    this.texture('cold-source', c => {
      this.panel(c, 3, 3, 58, 58, '#22485a', '#0c2334');
      c.strokeStyle = '#3aabbc'; c.lineWidth = 1; c.strokeRect(6.5, 6.5, 51, 51);
      c.fillStyle = '#091927'; c.beginPath(); c.arc(30, 30, 21, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#477382'; c.beginPath(); c.arc(30, 30, 19, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 6; i++) {
        c.save(); c.translate(30, 30); c.rotate(i * Math.PI / 3);
        c.fillStyle = '#4f9daa'; c.beginPath(); c.moveTo(3, 0); c.quadraticCurveTo(17, -15, 16, -2); c.quadraticCurveTo(9, 7, 3, 0); c.fill(); c.restore();
      }
      c.fillStyle = '#9af9ee'; c.beginPath(); c.arc(30, 30, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5ef0da'; c.fillRect(14, 54, 34, 2);
    });
    this.texture('obstacle', c => {
      this.panel(c, 3, 3, 58, 58, '#2b3646', '#111a28');
      c.strokeStyle = '#485163'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(13, 13); c.lineTo(51, 51); c.moveTo(51, 13); c.lineTo(13, 51); c.stroke();
      c.save(); c.beginPath(); c.rect(7, 49, 50, 8); c.clip();
      c.fillStyle = '#b98c49'; c.fillRect(7, 49, 50, 8);
      c.strokeStyle = '#242536'; c.lineWidth = 5;
      for (let x = 0; x < 70; x += 12) { c.beginPath(); c.moveTo(x, 48); c.lineTo(x - 8, 58); c.stroke(); }
      c.restore();
    });
    for (const [key, ports] of Object.entries({
      'duct-straight': [0, 2], 'duct-corner': [0, 1],
      'duct-t-junction': [0, 1, 2], 'duct-cross': [0, 1, 2, 3],
    })) {
      this.texture(key, c => {
        for (const [width, color] of [[30, '#081322'], [26, '#53687b'], [22, '#9aacb8'], [16, '#31485b'], [10, '#203347']] as const) {
          c.strokeStyle = color; c.lineWidth = width;
          for (const port of ports) {
            const a = (port - 1) * Math.PI / 2;
            c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.cos(a) * 34, 32 + Math.sin(a) * 34); c.stroke();
          }
          c.fillStyle = color; c.beginPath(); c.arc(32, 32, width / 2, 0, Math.PI * 2); c.fill();
        }
        for (const port of ports) {
          c.save(); c.translate(32, 32); c.rotate(port * Math.PI / 2);
          c.fillStyle = '#7892a4'; c.fillRect(-15, -29, 30, 4);
          c.fillStyle = '#c3d5df'; c.fillRect(-14, -29, 28, 1);
          c.fillStyle = '#1a2c3e'; c.fillRect(-11, -28, 2, 2); c.fillRect(9, -28, 2, 2);
          c.restore();
        }
      });
    }
    this.scene.start('MenuScene');
  }
  private texture(key: string, draw: (context: CanvasRenderingContext2D) => void): void {
    const texture = this.textures.createCanvas(key, 128, 128);
    if (!texture) return;
    const context = texture.getContext();
    context.scale(2, 2); draw(context); texture.refresh();
  }
  private panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
    const gradient = c.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
    c.fillStyle = '#050c16'; c.fillRect(x, y + 2, w, h);
    c.fillStyle = gradient; c.fillRect(x, y, w, h);
    c.strokeStyle = '#536a7e'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}
