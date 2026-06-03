import Phaser from 'phaser';
import { BootScene } from '@/scenes/BootScene';
import { MenuScene } from '@/scenes/MenuScene';
import { LevelSelectScene } from '@/scenes/LevelSelectScene';
import { GameScene } from '@/scenes/GameScene';
import { LevelCompleteScene } from '@/scenes/LevelCompleteScene';
import { CustomLevelScene } from '@/scenes/CustomLevelScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL with Canvas fallback
  parent: 'game-container',
  width: 960,
  height: 640,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
    min: {
      width: 375,
      height: 250,
    },
  },
  input: {
    keyboard: true,
    mouse: true,
    touch: true,
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene, LevelCompleteScene, CustomLevelScene],
};

new Phaser.Game(config);
