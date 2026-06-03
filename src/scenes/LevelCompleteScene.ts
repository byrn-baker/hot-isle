import Phaser from 'phaser';
import type { LevelScoringConfig } from '@/types';
import { calculateScore } from '@/systems/ScoreSystem';
import { saveLevelProgress, loadProgress } from '@/utils/persistence';
import { submitScore } from '@/services/leaderboard';

interface LevelCompleteData {
  success: boolean;
  levelId: string;
  tilesUsed: number;
  timeElapsed: number;
  scoring: LevelScoringConfig;
}

export class LevelCompleteScene extends Phaser.Scene {
  private nicknameInput: HTMLInputElement | null = null;
  private submitContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'LevelCompleteScene' });
  }

  create(data: LevelCompleteData): void {
    const { success, levelId, tilesUsed, timeElapsed, scoring } = data;

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    if (success) {
      const result = calculateScore(tilesUsed, timeElapsed, scoring);

      // Persist progress
      saveLevelProgress(levelId, {
        completed: true,
        stars: result.stars,
        bestTilesUsed: tilesUsed,
        bestTime: timeElapsed,
      });

      // Title
      this.add.text(centerX, centerY - 100, 'LEVEL COMPLETE!', {
        fontSize: '32px',
        fontFamily: 'monospace',
        color: '#66bb6a',
      }).setOrigin(0.5);

      // Star display with animation
      const starsText = this.add.text(centerX, centerY - 40, '', {
        fontSize: '48px',
        fontFamily: 'monospace',
        color: '#ffd54f',
      }).setOrigin(0.5);

      // Animate stars appearing one by one
      for (let i = 0; i < 3; i++) {
        this.time.delayedCall(300 + i * 300, () => {
          const filled = i < result.stars;
          const currentText = starsText.text + (filled ? '\u2605' : '\u2606');
          starsText.setText(currentText);
          if (filled) {
            this.tweens.add({
              targets: starsText,
              scale: 1.2,
              duration: 100,
              yoyo: true,
              ease: 'Back.easeOut',
            });
          }
        });
      }

      // Score breakdown
      this.add.text(centerX, centerY + 20, `Tiles used: ${tilesUsed}`, {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#cccccc',
      }).setOrigin(0.5);

      this.add.text(centerX, centerY + 42, `Time: ${Math.floor(timeElapsed)}s`, {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#cccccc',
      }).setOrigin(0.5);

      // Star breakdown
      this.add.text(centerX, centerY + 68, `Tile rating: ${'\u2605'.repeat(result.tileStars)}${'\u2606'.repeat(3 - result.tileStars)}  |  Time rating: ${'\u2605'.repeat(result.timeStars)}${'\u2606'.repeat(3 - result.timeStars)}`, {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#999999',
      }).setOrigin(0.5);

      // Submit Score button
      const submitBtn = this.add.text(centerX, centerY + 100, '[ SUBMIT SCORE ]', {
        fontSize: '16px',
        fontFamily: 'monospace',
        color: '#ffd54f',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      submitBtn.on('pointerdown', () => {
        submitBtn.disableInteractive();
        submitBtn.setColor('#666666');
        this.showNicknamePrompt(centerX, centerY);
      });
      submitBtn.on('pointerover', () => submitBtn.setColor('#fff176'));
      submitBtn.on('pointerout', () => submitBtn.setColor('#ffd54f'));

      // Next Level button
      const nextBtn = this.add.text(centerX, centerY + 140, '[ NEXT LEVEL ]', {
        fontSize: '20px',
        fontFamily: 'monospace',
        color: '#66bb6a',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      nextBtn.on('pointerdown', () => {
        this.cleanupDOM();
        const nextLevelId = this.getNextLevelId(levelId);
        if (nextLevelId) {
          this.scene.start('GameScene', { levelId: nextLevelId });
        } else {
          if (this.scene.get('LevelSelectScene')) {
            this.scene.start('LevelSelectScene');
          } else {
            this.scene.start('GameScene', { levelId });
          }
        }
      });
      nextBtn.on('pointerover', () => nextBtn.setColor('#a5d6a7'));
      nextBtn.on('pointerout', () => nextBtn.setColor('#66bb6a'));

      // Retry button
      const retryBtn = this.add.text(centerX, centerY + 175, '[ RETRY ]', {
        fontSize: '18px',
        fontFamily: 'monospace',
        color: '#4fc3f7',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      retryBtn.on('pointerdown', () => {
        this.cleanupDOM();
        this.scene.start('GameScene', { levelId });
      });
      retryBtn.on('pointerover', () => retryBtn.setColor('#81d4fa'));
      retryBtn.on('pointerout', () => retryBtn.setColor('#4fc3f7'));

    } else {
      // Failure state
      this.add.text(centerX, centerY - 60, 'MELTDOWN!', {
        fontSize: '36px',
        fontFamily: 'monospace',
        color: '#ef5350',
      }).setOrigin(0.5);

      // Shake the title
      const title = this.children.getAt(this.children.length - 1) as Phaser.GameObjects.Text;
      this.tweens.add({
        targets: title,
        x: centerX - 3,
        duration: 50,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.inOut',
      });

      this.add.text(centerX, centerY, '\uD83D\uDC80 Equipment overheated \uD83D\uDC80', {
        fontSize: '16px',
        fontFamily: 'monospace',
        color: '#cccccc',
      }).setOrigin(0.5);

      this.add.text(centerX, centerY + 40, `Time survived: ${Math.floor(timeElapsed)}s`, {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#999999',
      }).setOrigin(0.5);

      // Retry button
      const retryBtn = this.add.text(centerX, centerY + 110, '[ RETRY ]', {
        fontSize: '22px',
        fontFamily: 'monospace',
        color: '#4fc3f7',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      retryBtn.on('pointerdown', () => {
        this.cleanupDOM();
        this.scene.start('GameScene', { levelId });
      });
      retryBtn.on('pointerover', () => retryBtn.setColor('#81d4fa'));
      retryBtn.on('pointerout', () => retryBtn.setColor('#4fc3f7'));

      // Level Select button (if available)
      const menuBtn = this.add.text(centerX, centerY + 155, '[ MENU ]', {
        fontSize: '16px',
        fontFamily: 'monospace',
        color: '#90a4ae',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      menuBtn.on('pointerdown', () => {
        this.cleanupDOM();
        if (this.scene.get('LevelSelectScene')) {
          this.scene.start('LevelSelectScene');
        } else if (this.scene.get('MenuScene')) {
          this.scene.start('MenuScene');
        } else {
          this.scene.start('GameScene', { levelId });
        }
      });
      menuBtn.on('pointerover', () => menuBtn.setColor('#cfd8dc'));
      menuBtn.on('pointerout', () => menuBtn.setColor('#90a4ae'));
    }
  }

  shutdown(): void {
    this.cleanupDOM();
  }

  private showNicknamePrompt(centerX: number, centerY: number): void {
    // Create a container for the submit UI elements
    this.submitContainer = this.add.container(0, 0);

    // Backdrop
    const backdrop = this.add.rectangle(centerX, centerY, 320, 140, 0x1a1a2e, 0.95);
    backdrop.setStrokeStyle(1, 0x4fc3f7);
    this.submitContainer.add(backdrop);

    const promptText = this.add.text(centerX, centerY - 45, 'Enter nickname:', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.submitContainer.add(promptText);

    // Create DOM input for nickname
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scale.width;
    const scaleY = rect.height / this.scale.height;

    this.nicknameInput = document.createElement('input');
    this.nicknameInput.type = 'text';
    this.nicknameInput.maxLength = 20;
    this.nicknameInput.placeholder = 'Your name';
    this.nicknameInput.style.position = 'absolute';
    this.nicknameInput.style.left = `${rect.left + (centerX - 100) * scaleX}px`;
    this.nicknameInput.style.top = `${rect.top + (centerY - 15) * scaleY}px`;
    this.nicknameInput.style.width = `${200 * scaleX}px`;
    this.nicknameInput.style.height = `${28 * scaleY}px`;
    this.nicknameInput.style.backgroundColor = '#263238';
    this.nicknameInput.style.color = '#ffffff';
    this.nicknameInput.style.border = '1px solid #455a64';
    this.nicknameInput.style.borderRadius = '4px';
    this.nicknameInput.style.padding = '4px 8px';
    this.nicknameInput.style.fontFamily = 'monospace';
    this.nicknameInput.style.fontSize = '14px';
    this.nicknameInput.style.textAlign = 'center';
    document.body.appendChild(this.nicknameInput);
    this.nicknameInput.focus();

    // Submit button
    const confirmBtn = this.add.text(centerX - 50, centerY + 35, '[ OK ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#66bb6a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.submitContainer.add(confirmBtn);

    // Cancel button
    const cancelBtn = this.add.text(centerX + 50, centerY + 35, '[ CANCEL ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.submitContainer.add(cancelBtn);

    confirmBtn.on('pointerdown', () => {
      const nickname = this.nicknameInput?.value.trim() || '';
      if (nickname.length < 1) return;
      this.doSubmitScore(nickname, centerX, centerY);
    });

    cancelBtn.on('pointerdown', () => {
      this.hideNicknamePrompt();
    });

    // Also submit on Enter key
    this.nicknameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const nickname = this.nicknameInput?.value.trim() || '';
        if (nickname.length < 1) return;
        this.doSubmitScore(nickname, centerX, centerY);
      }
    });
  }

  private doSubmitScore(nickname: string, centerX: number, centerY: number): void {
    this.hideNicknamePrompt();

    // Calculate total stars and time from all completed levels
    const progress = loadProgress();
    let totalStars = 0;
    let totalTime = 0;
    let levelsCompleted = 0;

    for (const levelProgress of Object.values(progress.levels)) {
      if (levelProgress.completed) {
        totalStars += levelProgress.stars;
        totalTime += levelProgress.bestTime;
        levelsCompleted++;
      }
    }

    if (levelsCompleted === 0) return;

    const statusText = this.add.text(centerX, centerY + 100, 'Submitting...', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    }).setOrigin(0.5);

    submitScore(nickname, totalStars, totalTime, levelsCompleted)
      .then((qualified) => {
        if (qualified) {
          statusText.setText('\uD83C\uDFC6 You made the top 3!');
          statusText.setColor('#ffd54f');
        } else {
          statusText.setText('Score submitted! Keep playing to climb higher.');
          statusText.setColor('#66bb6a');
        }
      })
      .catch(() => {
        statusText.setText('Submission failed. Try again later.');
        statusText.setColor('#ef5350');
      });
  }

  private hideNicknamePrompt(): void {
    if (this.nicknameInput && this.nicknameInput.parentNode) {
      this.nicknameInput.parentNode.removeChild(this.nicknameInput);
      this.nicknameInput = null;
    }
    if (this.submitContainer) {
      this.submitContainer.destroy(true);
      this.submitContainer = null;
    }
  }

  private cleanupDOM(): void {
    if (this.nicknameInput && this.nicknameInput.parentNode) {
      this.nicknameInput.parentNode.removeChild(this.nicknameInput);
      this.nicknameInput = null;
    }
  }

  private getNextLevelId(currentLevelId: string): string | null {
    const match = currentLevelId.match(/level-(\d+)/);
    if (!match) return null;
    const currentNum = parseInt(match[1]!, 10);
    const nextNum = currentNum + 1;
    return `level-${nextNum.toString().padStart(3, '0')}`;
  }
}
