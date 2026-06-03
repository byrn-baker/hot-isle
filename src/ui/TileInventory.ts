import Phaser from 'phaser';
import type { DuctType } from '@/types';
import { CELL_SIZE, UI_PADDING } from '@/utils/constants';

export interface TileSlot {
  type: DuctType;
  remaining: number;
  total: number;
}

export class TileInventory extends Phaser.GameObjects.Container {
  private slots: Map<DuctType, { bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Sprite; countText: Phaser.GameObjects.Text; remaining: number; total: number }> = new Map();
  private selectedType: DuctType | null = null;
  private selectionIndicator: Phaser.GameObjects.Rectangle;
  private onSelect: (type: DuctType | null) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tiles: Record<DuctType, number>,
    onSelect: (type: DuctType | null) => void
  ) {
    super(scene, x, y);
    this.onSelect = onSelect;

    // Selection indicator (rendered behind slots)
    this.selectionIndicator = new Phaser.GameObjects.Rectangle(
      scene, 0, 0, CELL_SIZE + 8, CELL_SIZE + 24, 0x4fc3f7, 0.3
    );
    this.selectionIndicator.setVisible(false);
    this.add(this.selectionIndicator);

    const types: DuctType[] = ['straight', 'corner', 't_junction', 'cross'];
    const slotWidth = CELL_SIZE + UI_PADDING;

    types.forEach((type, i) => {
      const slotX = i * slotWidth;
      const count = tiles[type] ?? 0;

      // Background
      const bg = new Phaser.GameObjects.Rectangle(
        scene, slotX, 0, CELL_SIZE + 4, CELL_SIZE + 20, 0x263238
      );
      bg.setStrokeStyle(1, 0x455a64);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectSlot(type));
      this.add(bg);

      // Icon
      const textureKey = `duct-${type.replace('_', '-')}`;
      const icon = new Phaser.GameObjects.Sprite(scene, slotX, -6, textureKey);
      icon.setDisplaySize(CELL_SIZE - 12, CELL_SIZE - 12);
      this.add(icon);

      // Count text
      const countText = new Phaser.GameObjects.Text(
        scene, slotX, CELL_SIZE / 2, `${count}`, {
          fontSize: '12px',
          fontFamily: 'monospace',
          color: '#ffffff',
          align: 'center',
        }
      );
      countText.setOrigin(0.5, 0.5);
      this.add(countText);

      this.slots.set(type, { bg, icon, countText, remaining: count, total: count });
    });

    scene.add.existing(this);
  }

  private selectSlot(type: DuctType): void {
    const slot = this.slots.get(type);
    if (!slot || slot.remaining <= 0) return;

    if (this.selectedType === type) {
      // Deselect
      this.selectedType = null;
      this.selectionIndicator.setVisible(false);
      this.onSelect(null);
    } else {
      this.selectedType = type;
      this.selectionIndicator.setPosition(slot.bg.x, slot.bg.y);
      this.selectionIndicator.setVisible(true);
      this.onSelect(type);
    }
  }

  getSelectedType(): DuctType | null {
    return this.selectedType;
  }

  useTile(type: DuctType): boolean {
    const slot = this.slots.get(type);
    if (!slot || slot.remaining <= 0) return false;
    slot.remaining--;
    slot.countText.setText(`${slot.remaining}`);
    if (slot.remaining === 0) {
      // Visually disable the slot
      slot.icon.setAlpha(0.3);
      slot.countText.setColor('#666666');
      if (this.selectedType === type) {
        this.selectedType = null;
        this.selectionIndicator.setVisible(false);
        this.onSelect(null);
      }
    }
    return true;
  }

  returnTile(type: DuctType): void {
    const slot = this.slots.get(type);
    if (!slot) return;
    slot.remaining++;
    slot.countText.setText(`${slot.remaining}`);
    // Re-enable visual if it was disabled
    slot.icon.setAlpha(1);
    slot.countText.setColor('#ffffff');
  }

  getRemainingCount(type: DuctType): number {
    return this.slots.get(type)?.remaining ?? 0;
  }

  getTotalUsed(): number {
    let used = 0;
    for (const slot of this.slots.values()) {
      used += slot.total - slot.remaining;
    }
    return used;
  }

  setInitialCounts(tiles: Record<DuctType, number>): void {
    for (const [type, slot] of this.slots) {
      const count = tiles[type] ?? 0;
      slot.remaining = count;
      slot.total = count;
      slot.countText.setText(`${count}`);
    }
  }

  /** Select a tile type by its position index (0=straight, 1=corner, 2=t_junction, 3=cross) */
  selectByIndex(index: number): void {
    const types: DuctType[] = ['straight', 'corner', 't_junction', 'cross'];
    const type = types[index];
    if (type) {
      this.selectSlot(type);
    }
  }
}
