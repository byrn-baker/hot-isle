import Phaser from 'phaser';
import { loadCustomLevels, addCustomLevel, removeCustomLevel } from '@/utils/persistence';
import { validateLevel } from '@/systems/LevelValidator';
import type { CustomLevelEntry, LevelConfig } from '@/types';

/**
 * Custom level management scene.
 * Allows importing JSON (paste), viewing imported levels, playing, deleting, and exporting.
 */
export class CustomLevelScene extends Phaser.Scene {
  private levelList: CustomLevelEntry[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private errorText!: Phaser.GameObjects.Text;
  private importInput!: HTMLTextAreaElement;

  constructor() {
    super({ key: 'CustomLevelScene' });
  }

  create(): void {
    const centerX = this.scale.width / 2;
    this.levelList = loadCustomLevels().levels;

    // Title
    this.add.text(centerX, 25, 'CUSTOM LEVELS', {
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
    backBtn.on('pointerdown', () => {
      this.cleanupDOM();
      this.scene.start('MenuScene');
    });
    backBtn.on('pointerover', () => backBtn.setColor('#cfd8dc'));
    backBtn.on('pointerout', () => backBtn.setColor('#90a4ae'));

    // Import section
    this.add.text(centerX, 60, 'Paste level JSON below and click Import:', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    }).setOrigin(0.5);

    // Create DOM textarea for JSON input
    this.createImportInput();

    // Import button
    const importBtn = this.add.text(centerX + 100, 150, '[ IMPORT ]', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#66bb6a',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    importBtn.on('pointerdown', () => this.handleImport());
    importBtn.on('pointerover', () => importBtn.setColor('#a5d6a7'));
    importBtn.on('pointerout', () => importBtn.setColor('#66bb6a'));

    // File upload button
    const fileBtn = this.add.text(centerX - 100, 150, '[ UPLOAD FILE ]', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#4fc3f7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    fileBtn.on('pointerdown', () => this.handleFileUpload());
    fileBtn.on('pointerover', () => fileBtn.setColor('#81d4fa'));
    fileBtn.on('pointerout', () => fileBtn.setColor('#4fc3f7'));

    // Schema guide link
    const guideBtn = this.add.text(centerX, 175, '[ HOW TO CREATE LEVELS ]', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffb74d',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    guideBtn.on('pointerdown', () => {
      window.open('docs/level-schema-guide.md', '_blank');
    });
    guideBtn.on('pointerover', () => guideBtn.setColor('#ffe0b2'));
    guideBtn.on('pointerout', () => guideBtn.setColor('#ffb74d'));

    // Error/success message
    this.errorText = this.add.text(centerX, 200, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ef5350',
      wordWrap: { width: 600 },
    }).setOrigin(0.5, 0);

    // Level list container
    this.listContainer = this.add.container(0, 240);
    this.renderLevelList();
  }

  private createImportInput(): void {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scale.width;
    const scaleY = rect.height / this.scale.height;

    this.importInput = document.createElement('textarea');
    this.importInput.style.position = 'absolute';
    this.importInput.style.left = `${rect.left + (this.scale.width / 2 - 250) * scaleX}px`;
    this.importInput.style.top = `${rect.top + 75 * scaleY}px`;
    this.importInput.style.width = `${500 * scaleX}px`;
    this.importInput.style.height = `${60 * scaleY}px`;
    this.importInput.style.backgroundColor = '#263238';
    this.importInput.style.color = '#ffffff';
    this.importInput.style.border = '1px solid #455a64';
    this.importInput.style.borderRadius = '4px';
    this.importInput.style.padding = '8px';
    this.importInput.style.fontFamily = 'monospace';
    this.importInput.style.fontSize = '11px';
    this.importInput.style.resize = 'none';
    this.importInput.placeholder = '{ "id": "my-level", "name": "My Level", ... }';
    document.body.appendChild(this.importInput);
  }

  private cleanupDOM(): void {
    if (this.importInput && this.importInput.parentNode) {
      this.importInput.parentNode.removeChild(this.importInput);
    }
  }

  shutdown(): void {
    this.cleanupDOM();
  }

  private handleImport(): void {
    const json = this.importInput.value.trim();
    if (!json) {
      this.showError('Please paste level JSON before importing.');
      return;
    }
    this.importJSON(json);
  }

  private handleFileUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        this.importJSON(text);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private importJSON(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      this.showError('Invalid JSON syntax. Please check your formatting.');
      return;
    }

    const validation = validateLevel(parsed);
    if (!validation.valid) {
      const messages = validation.errors.map((e) => `• ${e.field}: ${e.message}`).join('\n');
      this.showError(`Validation failed:\n${messages}`);
      return;
    }

    const config = parsed as LevelConfig;
    const entry: CustomLevelEntry = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: config.name,
      config,
      importedAt: new Date().toISOString(),
    };

    addCustomLevel(entry);
    this.levelList.push(entry);
    this.importInput.value = '';
    this.showSuccess(`Level "${config.name}" imported successfully!`);
    this.renderLevelList();
  }

  private showError(msg: string): void {
    this.errorText.setColor('#ef5350');
    this.errorText.setText(msg);
  }

  private showSuccess(msg: string): void {
    this.errorText.setColor('#66bb6a');
    this.errorText.setText(msg);
  }

  private renderLevelList(): void {
    this.listContainer.removeAll(true);
    const centerX = this.scale.width / 2;

    if (this.levelList.length === 0) {
      const empty = new Phaser.GameObjects.Text(this.scene.scene, centerX, 20, 'No custom levels imported yet.', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#666666',
      });
      empty.setOrigin(0.5);
      this.listContainer.add(empty);
      return;
    }

    const headerText = new Phaser.GameObjects.Text(this.scene.scene, centerX, 0, `— ${this.levelList.length} custom level(s) —`, {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#90a4ae',
    });
    headerText.setOrigin(0.5);
    this.listContainer.add(headerText);

    this.levelList.forEach((entry, i) => {
      const y = 30 + i * 40;

      // Level name
      const name = new Phaser.GameObjects.Text(this.scene.scene, 60, y, entry.name, {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#ffffff',
      });
      this.listContainer.add(name);

      // Play button
      const playBtn = new Phaser.GameObjects.Text(this.scene.scene, centerX + 80, y, '▶ Play', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#66bb6a',
      });
      playBtn.setInteractive({ useHandCursor: true });
      playBtn.on('pointerdown', () => {
        this.cleanupDOM();
        this.scene.start('GameScene', { levelId: entry.id, customConfig: entry.config });
      });
      this.listContainer.add(playBtn);

      // Export button (copy)
      const exportBtn = new Phaser.GameObjects.Text(this.scene.scene, centerX + 160, y, '📋 Copy', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#4fc3f7',
      });
      exportBtn.setInteractive({ useHandCursor: true });
      exportBtn.on('pointerdown', () => {
        navigator.clipboard.writeText(JSON.stringify(entry.config, null, 2));
        this.showSuccess(`"${entry.name}" copied to clipboard!`);
      });
      this.listContainer.add(exportBtn);

      // Download button
      const downloadBtn = new Phaser.GameObjects.Text(this.scene.scene, centerX + 240, y, '⬇ .json', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#4fc3f7',
      });
      downloadBtn.setInteractive({ useHandCursor: true });
      downloadBtn.on('pointerdown', () => {
        const blob = new Blob([JSON.stringify(entry.config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entry.config.id || 'custom-level'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showSuccess(`"${entry.name}" downloading...`);
      });
      this.listContainer.add(downloadBtn);

      // Delete button
      const deleteBtn = new Phaser.GameObjects.Text(this.scene.scene, centerX + 330, y, '✕ Delete', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#ef5350',
      });
      deleteBtn.setInteractive({ useHandCursor: true });
      deleteBtn.on('pointerdown', () => {
        removeCustomLevel(entry.id);
        this.levelList = this.levelList.filter((l) => l.id !== entry.id);
        this.renderLevelList();
        this.showSuccess(`"${entry.name}" deleted.`);
      });
      this.listContainer.add(deleteBtn);
    });
  }
}
