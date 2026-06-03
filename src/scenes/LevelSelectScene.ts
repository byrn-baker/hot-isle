import Phaser from 'phaser';
import { loadProgress, isLevelUnlocked, loadCustomLevels } from '@/utils/persistence';

/** All campaign level IDs in order */
const CAMPAIGN_LEVELS = [
  'level-001', 'level-002', 'level-003', 'level-004', 'level-005',
  'level-006', 'level-007', 'level-008', 'level-009', 'level-010',
];

/**
 * Level select screen showing a grid of level buttons.
 * Each button shows locked/unlocked/completed state and star rating.
 */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create(): void {
    this.scale.on('resize', () => {
      this.scale.off('resize');
      this.scene.restart();
    });

    const centerX = this.scale.width / 2;
    const progress = loadProgress();

    // Title
    this.add.text(centerX, 30, 'SELECT LEVEL', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Back button
    const backBtn = this.add.text(20, 20, '← MENU', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    }).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('MenuScene'));
    backBtn.on('pointerover', () => backBtn.setColor('#cfd8dc'));
    backBtn.on('pointerout', () => backBtn.setColor('#90a4ae'));

    // Grid layout for level buttons
    const cols = 5;
    const buttonSize = 80;
    const gap = 16;
    const gridWidth = cols * buttonSize + (cols - 1) * gap;
    const startX = centerX - gridWidth / 2 + buttonSize / 2;
    const startY = 90;

    CAMPAIGN_LEVELS.forEach((levelId, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (buttonSize + gap);
      const y = startY + row * (buttonSize + gap + 20);

      const unlocked = isLevelUnlocked(levelId, CAMPAIGN_LEVELS);
      const levelProgress = progress.levels[levelId];
      const completed = levelProgress?.completed ?? false;
      const stars = levelProgress?.stars ?? 0;

      this.createLevelButton(x, y, buttonSize, index + 1, levelId, unlocked, completed, stars);
    });

    // Custom levels section
    const customLevels = loadCustomLevels().levels;
    if (customLevels.length > 0) {
      const customStartY = startY + Math.ceil(CAMPAIGN_LEVELS.length / cols) * (buttonSize + gap + 20) + 20;

      this.add.text(centerX, customStartY, '— CUSTOM LEVELS —', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#ffb74d',
      }).setOrigin(0.5);

      customLevels.forEach((entry, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * (buttonSize + gap);
        const y = customStartY + 30 + row * (buttonSize + gap + 20);

        this.createCustomLevelButton(x, y, buttonSize, entry.name, entry.id, entry.config);
      });
    }
  }

  private createCustomLevelButton(
    x: number,
    y: number,
    size: number,
    name: string,
    levelId: string,
    config: import('@/types').LevelConfig
  ): void {
    const bg = this.add.rectangle(x, y, size, size, 0x263238);
    bg.setStrokeStyle(2, 0xffb74d);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.scene.start('GameScene', { levelId, customConfig: config });
    });
    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0xffb74d));

    // Truncate name to fit
    const displayName = name.length > 6 ? name.slice(0, 6) + '…' : name;
    this.add.text(x, y, displayName, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);
  }

  private createLevelButton(
    x: number,
    y: number,
    size: number,
    levelNum: number,
    levelId: string,
    unlocked: boolean,
    completed: boolean,
    stars: number
  ): void {
    // Background
    let bgColor: number;
    let borderColor: number;
    if (!unlocked) {
      bgColor = 0x1a1a2e;
      borderColor = 0x37474f;
    } else if (completed) {
      bgColor = 0x1b5e20;
      borderColor = 0x66bb6a;
    } else {
      bgColor = 0x263238;
      borderColor = 0x4fc3f7;
    }

    const bg = this.add.rectangle(x, y, size, size, bgColor);
    bg.setStrokeStyle(2, borderColor);

    if (unlocked) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this.scene.start('GameScene', { levelId });
      });
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff));
      bg.on('pointerout', () => bg.setStrokeStyle(2, borderColor));
    }

    // Level number
    const numColor = unlocked ? '#ffffff' : '#555555';
    this.add.text(x, y - 8, `${levelNum}`, {
      fontSize: '22px',
      fontFamily: 'monospace',
      color: numColor,
    }).setOrigin(0.5);

    // Stars or lock icon
    if (!unlocked) {
      this.add.text(x, y + 16, '🔒', {
        fontSize: '14px',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    } else if (completed) {
      const starDisplay = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      this.add.text(x, y + 18, starDisplay, {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#ffd54f',
      }).setOrigin(0.5);
    }
  }
}
