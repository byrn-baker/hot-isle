import Phaser from 'phaser';
import { fetchLeaderboard } from '@/services/leaderboard';
import type { LeaderboardEntry } from '@/types';

/**
 * Main menu / title screen.
 * Provides navigation to Play (level select) and Custom Levels.
 * Shows a scrolling leaderboard ticker at the bottom.
 */
export class MenuScene extends Phaser.Scene {
  private tickerText: Phaser.GameObjects.Text | null = null;
  private tickerContent = '';

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Title
    this.add.text(centerX, centerY - 120, 'HOT ISLE', {
      fontSize: '42px',
      fontFamily: 'monospace',
      color: '#ef5350',
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 75, 'COLD ISLE', {
      fontSize: '42px',
      fontFamily: 'monospace',
      color: '#4fc3f7',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, centerY - 30, 'Route cold air. Save the servers.', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    }).setOrigin(0.5);

    // Play button
    const playBtn = this.add.text(centerX, centerY + 40, '[ PLAY ]', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#66bb6a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerdown', () => {
      this.scene.start('LevelSelectScene');
    });
    playBtn.on('pointerover', () => playBtn.setColor('#a5d6a7'));
    playBtn.on('pointerout', () => playBtn.setColor('#66bb6a'));

    // Custom Levels button
    const customBtn = this.add.text(centerX, centerY + 90, '[ CUSTOM LEVELS ]', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#4fc3f7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    customBtn.on('pointerdown', () => {
      if (this.scene.get('CustomLevelScene')) {
        this.scene.start('CustomLevelScene');
      }
    });
    customBtn.on('pointerover', () => customBtn.setColor('#81d4fa'));
    customBtn.on('pointerout', () => customBtn.setColor('#4fc3f7'));

    // Version / footer
    this.add.text(centerX, this.scale.height - 20, 'v1.0', {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#455a64',
    }).setOrigin(0.5);

    // Leaderboard ticker
    this.initLeaderboardTicker();
  }

  update(): void {
    // Scroll the ticker text
    if (this.tickerText && this.tickerContent) {
      this.tickerText.x -= 1;
      // Reset position when text scrolls fully off-screen to the left
      if (this.tickerText.x + this.tickerText.width < 0) {
        this.tickerText.x = this.scale.width;
      }
    }
  }

  private initLeaderboardTicker(): void {
    const tickerY = this.scale.height - 45;

    // Placeholder while loading
    this.tickerText = this.add.text(this.scale.width, tickerY, 'Loading leaderboard...', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    });

    fetchLeaderboard()
      .then((entries) => {
        this.tickerContent = this.formatTickerText(entries);
        if (this.tickerText) {
          this.tickerText.setText(this.tickerContent);
          this.tickerText.setColor('#ffd54f');
          this.tickerText.x = this.scale.width;
        }
      })
      .catch(() => {
        this.tickerContent = '';
        if (this.tickerText) {
          this.tickerText.setText('Leaderboard unavailable');
          this.tickerText.setColor('#666666');
          this.tickerText.setOrigin(0.5, 0);
          this.tickerText.x = this.scale.width / 2;
        }
      });
  }

  private formatTickerText(entries: LeaderboardEntry[]): string {
    if (entries.length === 0) {
      return 'No high scores yet — be the first!';
    }

    const parts = entries.map((entry, i) => {
      const rank = i + 1;
      return `#${rank} ${entry.nickname} - ${entry.stars}\u2B50`;
    });

    return `\uD83C\uDFC6 ${parts.join(' | ')}`;
  }
}
