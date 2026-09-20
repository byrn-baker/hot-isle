import Phaser from 'phaser';

/** Instructions pause the simulation, so players can read before building. */
export class ControlsOverlay extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, branchingLevel: boolean, onClose: () => void) {
    super(scene, 0, 0);
    const { width, height } = scene.scale;
    const panelWidth = Math.min(510, width - 24);
    const fontSize = height < 480 ? 11 : 14;
    const body = new Phaser.GameObjects.Text(scene, width / 2, 0,
      '1 Straight   2 Corner   3 T-junction   4 Cross\n' +
      'Arrow keys — move the highlighted cell\n' +
      'Space / Enter — place the selected pipe\n' +
      'R — rotate the preview or an existing pipe\n' +
      'Delete / Backspace — remove and refund a pipe\n' +
      'H — open / close help     Esc / P — pause\n\n' +
      'Mouse: click to place or rotate; right-click to remove.\n' +
      'Cool every server to its safe temperature to win.' +
      (branchingLevel ? '\n\nLevel 3: use a T-junction to split air up and down.\nA second T can also carry air straight across.' : ''),
      { fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#c1d6e2',
        lineSpacing: height < 480 ? 3 : 6, wordWrap: { width: panelWidth - 36 }, align: 'left' });
    body.setOrigin(0.5, 0);
    const panelHeight = body.height + 125;
    const top = Math.max(8, (height - panelHeight) / 2);
    const backdrop = new Phaser.GameObjects.Rectangle(scene, width / 2, height / 2, width, height, 0x030911, 0.92);
    backdrop.setInteractive();
    this.add(backdrop);
    this.add(new Phaser.GameObjects.Rectangle(scene, width / 2, top + panelHeight / 2, panelWidth, panelHeight, 0x102033)
      .setStrokeStyle(1, 0x65e6ce));
    this.add(new Phaser.GameObjects.Text(scene, width / 2, top + 18, 'CONTROLS / TIMER PAUSED', {
      fontFamily: 'monospace', fontSize: '16px', color: '#72ead9',
    }).setOrigin(0.5, 0));
    body.y = top + 52;
    this.add(body);
    const close = new Phaser.GameObjects.Text(scene, width / 2, top + panelHeight - 42, '[ ENTER / CLICK TO PLAY ]', {
      fontFamily: 'monospace', fontSize: '14px', color: '#72ead9', padding: { x: 12, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClose();
    });
    this.add(close);
    this.setDepth(1100).setVisible(false);
    scene.add.existing(this);
  }
}
