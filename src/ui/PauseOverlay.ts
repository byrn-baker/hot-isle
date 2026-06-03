import Phaser from 'phaser';

export interface PauseOverlayCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

/**
 * Semi-transparent overlay shown when game is paused.
 * Provides Resume, Restart, and Quit options.
 */
export class PauseOverlay extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private callbacks: PauseOverlayCallbacks;

  constructor(
    scene: Phaser.Scene,
    callbacks: PauseOverlayCallbacks
  ) {
    super(scene, 0, 0);
    this.callbacks = callbacks;

    const width = scene.scale.width;
    const height = scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Semi-transparent dark background
    this.background = new Phaser.GameObjects.Rectangle(
      scene, centerX, centerY, width, height, 0x000000, 0.7
    );
    this.background.setInteractive(); // Block clicks to game behind
    this.add(this.background);

    // Title
    const title = new Phaser.GameObjects.Text(scene, centerX, centerY - 80, 'PAUSED', {
      fontSize: '32px',
      fontFamily: 'monospace',
      color: '#ffffff',
    });
    title.setOrigin(0.5);
    this.add(title);

    // Resume button
    this.addButton(scene, centerX, centerY - 10, '[ RESUME ]', '#4fc3f7', () => {
      this.callbacks.onResume();
    });

    // Restart button
    this.addButton(scene, centerX, centerY + 40, '[ RESTART ]', '#ffb74d', () => {
      this.callbacks.onRestart();
    });

    // Quit button
    this.addButton(scene, centerX, centerY + 90, '[ QUIT ]', '#ef5350', () => {
      this.callbacks.onQuit();
    });

    // Hint text
    const hint = new Phaser.GameObjects.Text(scene, centerX, centerY + 150, 'Press ESC or P to resume', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#666666',
    });
    hint.setOrigin(0.5);
    this.add(hint);

    // Start hidden
    this.setVisible(false);
    this.setDepth(1000);

    scene.add.existing(this);
  }

  private addButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    color: string,
    onClick: () => void
  ): void {
    const btn = new Phaser.GameObjects.Text(scene, x, y, label, {
      fontSize: '20px',
      fontFamily: 'monospace',
      color,
    });
    btn.setOrigin(0.5);
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerdown', onClick);
    btn.on('pointerover', () => btn.setAlpha(0.7));
    btn.on('pointerout', () => btn.setAlpha(1));
    this.add(btn);
  }

  show(): void {
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }
}
