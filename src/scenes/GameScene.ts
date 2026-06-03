import Phaser from 'phaser';
import type { DuctType, LevelConfig, ServerRack } from '@/types';
import { createGrid, placeDuct, removeDuct, rotateDuct, canPlaceDuct, getDuctAt } from '@/systems/GridSystem';
import type { GridState } from '@/systems/GridSystem';
import { resolveAirflow } from '@/systems/AirflowSystem';
import { createServers, updateTemperatures } from '@/systems/TemperatureSystem';
import { CELL_SIZE, COLOR_GRID_BG } from '@/utils/constants';
import { DuctTileSprite } from '@/entities/DuctTileSprite';
import { ServerRackSprite } from '@/entities/ServerRackSprite';
import { ColdSourceSprite } from '@/entities/ColdSourceSprite';
import { TileInventory } from '@/ui/TileInventory';
import { PauseOverlay } from '@/ui/PauseOverlay';

// Import level data
import level001 from '@/data/levels/level-001.json';
import level002 from '@/data/levels/level-002.json';
import level003 from '@/data/levels/level-003.json';
import level004 from '@/data/levels/level-004.json';
import level005 from '@/data/levels/level-005.json';
import level006 from '@/data/levels/level-006.json';
import level007 from '@/data/levels/level-007.json';
import level008 from '@/data/levels/level-008.json';
import level009 from '@/data/levels/level-009.json';
import level010 from '@/data/levels/level-010.json';

const LEVELS: Record<string, LevelConfig> = {
  'level-001': level001 as LevelConfig,
  'level-002': level002 as LevelConfig,
  'level-003': level003 as LevelConfig,
  'level-004': level004 as LevelConfig,
  'level-005': level005 as LevelConfig,
  'level-006': level006 as LevelConfig,
  'level-007': level007 as LevelConfig,
  'level-008': level008 as LevelConfig,
  'level-009': level009 as LevelConfig,
  'level-010': level010 as LevelConfig,
};

export class GameScene extends Phaser.Scene {
  private grid!: GridState;
  private levelConfig!: LevelConfig;
  private servers: ServerRack[] = [];
  private serverSprites: Map<string, ServerRackSprite> = new Map();
  private ductSprites: Map<string, DuctTileSprite> = new Map();
  private coldSourceSprites: ColdSourceSprite[] = [];
  private inventory!: TileInventory;
  private selectedType: DuctType | null = null;
  private airflowGraphics!: Phaser.GameObjects.Graphics;
  private elapsedTime = 0;
  private isPaused = false;
  private gridOffsetX = 0;
  private gridOffsetY = 0;
  private timerText!: Phaser.GameObjects.Text;
  private pauseOverlay!: PauseOverlay;
  private pauseButton!: Phaser.GameObjects.Text;
  private cursorX = 0;
  private cursorY = 0;
  private cursorGraphics!: Phaser.GameObjects.Graphics;
  private cursorVisible = false;
  private lastTapTime = 0;
  private lastTapX = -1;
  private lastTapY = -1;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private currentCellSize = CELL_SIZE;

  private meltdownTriggered = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: { levelId: string; customConfig?: LevelConfig }): void {
    const levelId = data.levelId ?? 'level-001';
    if (data.customConfig) {
      this.levelConfig = data.customConfig;
    } else {
      this.levelConfig = LEVELS[levelId] ?? level001 as LevelConfig;
    }
    this.elapsedTime = 0;
    this.isPaused = false;
    this.meltdownTriggered = false;
    this.serverSprites = new Map();
    this.ductSprites = new Map();
    this.coldSourceSprites = [];
  }

  create(): void {
    const { levelConfig } = this;

    // Restart scene on resize (orientation change)
    this.scale.on('resize', () => {
      this.scale.off('resize');
      this.scene.restart({ levelId: this.levelConfig.id });
    });

    // Calculate dynamic cell size to fit the screen
    const availableWidth = this.scale.width - 20; // padding
    const availableHeight = this.scale.height - 120; // room for UI top + inventory bottom
    const cellFromWidth = Math.floor(availableWidth / levelConfig.gridWidth);
    const cellFromHeight = Math.floor(availableHeight / levelConfig.gridHeight);
    const dynamicCellSize = Math.min(cellFromWidth, cellFromHeight, CELL_SIZE);
    this.currentCellSize = Math.max(dynamicCellSize, 32); // minimum 32px cells

    // Calculate grid offset to center it
    const gridPixelWidth = levelConfig.gridWidth * this.currentCellSize;
    const gridPixelHeight = levelConfig.gridHeight * this.currentCellSize;
    this.gridOffsetX = (this.scale.width - gridPixelWidth) / 2;
    this.gridOffsetY = 40; // Leave room for UI at top

    // Initialize systems
    this.grid = createGrid(levelConfig);
    this.servers = createServers(
      levelConfig.servers.map((s, i) => ({ id: `s${i}`, ...s }))
    );

    // Draw grid background
    this.drawGridBackground(gridPixelWidth, gridPixelHeight);

    // Create airflow graphics layer
    this.airflowGraphics = this.add.graphics();

    // Create entity sprites
    this.createServerSprites();
    this.createColdSourceSprites();

    // Create tile inventory
    const inventoryY = this.gridOffsetY + gridPixelHeight + 20;
    this.inventory = new TileInventory(
      this,
      this.gridOffsetX,
      inventoryY,
      levelConfig.availableTiles,
      (type) => { this.selectedType = type; }
    );
    this.inventory.setInitialCounts(levelConfig.availableTiles);

    // Timer
    this.timerText = this.add.text(
      this.scale.width - 80, 10, '0:00',
      { fontSize: '16px', fontFamily: 'monospace', color: '#ffffff' }
    );

    // Level name
    this.add.text(
      10, 10, levelConfig.name,
      { fontSize: '14px', fontFamily: 'monospace', color: '#aaaaaa' }
    );

    // Input handling
    this.lastTapTime = 0;
    this.lastTapX = -1;
    this.lastTapY = -1;
    this.longPressTimer = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPaused) return;
      this.handlePointerDown(pointer);
    });

    this.input.on('pointerup', () => {
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());

    // Keyboard cursor controls
    this.cursorGraphics = this.add.graphics();
    this.cursorGraphics.setDepth(500);
    this.input.keyboard?.on('keydown-UP', () => this.moveCursor(0, -1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveCursor(0, 1));
    this.input.keyboard?.on('keydown-LEFT', () => this.moveCursor(-1, 0));
    this.input.keyboard?.on('keydown-RIGHT', () => this.moveCursor(1, 0));
    this.input.keyboard?.on('keydown-SPACE', () => this.handleKeyboardPlace());
    this.input.keyboard?.on('keydown-R', () => this.handleKeyboardRotate());
    this.input.keyboard?.on('keydown-DELETE', () => this.handleKeyboardRemove());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.handleKeyboardRemove());

    // Pause button (top right)
    this.pauseButton = this.add.text(
      this.scale.width - 30, 10, '⏸', {
        fontSize: '20px',
        fontFamily: 'monospace',
        color: '#ffffff',
      }
    ).setInteractive({ useHandCursor: true });
    this.pauseButton.on('pointerdown', () => this.togglePause());

    // Pause overlay
    this.pauseOverlay = new PauseOverlay(this, {
      onResume: () => this.togglePause(),
      onRestart: () => {
        this.scene.restart({ levelId: this.levelConfig.id });
      },
      onQuit: () => {
        if (this.scene.get('LevelSelectScene')) {
          this.scene.start('LevelSelectScene');
        } else if (this.scene.get('MenuScene')) {
          this.scene.start('MenuScene');
        } else {
          this.scene.start('BootScene');
        }
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.isPaused) return;

    const deltaSec = delta / 1000;
    this.elapsedTime += deltaSec;

    // Update timer display
    const mins = Math.floor(this.elapsedTime / 60);
    const secs = Math.floor(this.elapsedTime % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);

    // Resolve airflow
    const serverPosData = this.servers.map((s) => ({
      id: s.id,
      x: s.position.x,
      y: s.position.y,
    }));
    const airflow = resolveAirflow(this.grid, this.levelConfig.coldSources, serverPosData);

    // Update temperatures
    const tempState = updateTemperatures(this.servers, deltaSec, airflow.cooledServers);

    // Update server visuals
    for (const server of tempState.servers) {
      const sprite = this.serverSprites.get(server.id);
      sprite?.updateTemperature(server.temperature, server.isMeltedDown);
    }

    // Draw airflow paths
    this.drawAirflowPaths(airflow.airflowPaths);

    // Check win/lose (grace period: don't check win in first 2 seconds)
    if (tempState.hasMeltdown && !this.meltdownTriggered) {
      this.meltdownTriggered = true;
      // Delay to let the meltdown animation play
      this.time.delayedCall(1500, () => {
        this.endLevel(false);
      });
    } else if (tempState.allCooled && this.elapsedTime > 2 && !this.meltdownTriggered) {
      this.endLevel(true);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Convert pointer to grid position
    const gridX = Math.floor((pointer.x - this.gridOffsetX) / this.currentCellSize);
    const gridY = Math.floor((pointer.y - this.gridOffsetY) / this.currentCellSize);

    // Check bounds
    if (gridX < 0 || gridX >= this.grid.width || gridY < 0 || gridY >= this.grid.height) return;

    const existingDuct = getDuctAt(this.grid, gridX, gridY);

    // Right-click: remove (desktop)
    if (pointer.rightButtonDown()) {
      if (existingDuct) {
        this.removeDuctAt(gridX, gridY, existingDuct.type);
      }
      return;
    }

    // Long-press detection: start timer for removal (touch)
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      if (existingDuct) {
        this.removeDuctAt(gridX, gridY, existingDuct.type);
      }
    }, 500);

    // Double-tap detection: rotate
    const now = Date.now();
    if (now - this.lastTapTime < 350 && gridX === this.lastTapX && gridY === this.lastTapY) {
      // Double-tap on same cell: rotate
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (existingDuct) {
        rotateDuct(this.grid, gridX, gridY);
        const sprite = this.ductSprites.get(`${gridX},${gridY}`);
        sprite?.rotateClockwise();
      }
      this.lastTapTime = 0;
      return;
    }

    this.lastTapTime = now;
    this.lastTapX = gridX;
    this.lastTapY = gridY;

    // Single tap: place or rotate existing
    if (existingDuct) {
      // On desktop single-click rotates; on touch the double-tap handles it
      // For simplicity, single click also rotates
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      rotateDuct(this.grid, gridX, gridY);
      const sprite = this.ductSprites.get(`${gridX},${gridY}`);
      sprite?.rotateClockwise();
    } else if (this.selectedType && canPlaceDuct(this.grid, gridX, gridY)) {
      if (this.longPressTimer !== null) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.placeDuctAt(gridX, gridY, this.selectedType);
    }
  }

  private placeDuctAt(gridX: number, gridY: number, type: DuctType): void {
    if (!this.inventory.useTile(type)) return;

    const duct = placeDuct(this.grid, gridX, gridY, type, 0);
    if (!duct) {
      this.inventory.returnTile(type);
      return;
    }

    const sprite = new DuctTileSprite(
      this, gridX, gridY, type, 0,
      this.gridOffsetX, this.gridOffsetY, this.currentCellSize
    );
    this.ductSprites.set(`${gridX},${gridY}`, sprite);
  }

  private removeDuctAt(gridX: number, gridY: number, type: DuctType): void {
    const removed = removeDuct(this.grid, gridX, gridY);
    if (!removed) return;

    const key = `${gridX},${gridY}`;
    const sprite = this.ductSprites.get(key);
    sprite?.remove();
    this.ductSprites.delete(key);
    this.inventory.returnTile(type);
  }

  private drawGridBackground(width: number, height: number): void {
    const g = this.add.graphics();
    const cs = this.currentCellSize;
    g.fillStyle(COLOR_GRID_BG, 1);
    g.fillRect(this.gridOffsetX, this.gridOffsetY, width, height);

    // Grid lines
    g.lineStyle(1, 0x334455, 0.4);
    for (let x = 0; x <= this.grid.width; x++) {
      g.lineBetween(
        this.gridOffsetX + x * cs, this.gridOffsetY,
        this.gridOffsetX + x * cs, this.gridOffsetY + height
      );
    }
    for (let y = 0; y <= this.grid.height; y++) {
      g.lineBetween(
        this.gridOffsetX, this.gridOffsetY + y * cs,
        this.gridOffsetX + width, this.gridOffsetY + y * cs
      );
    }

    // Obstacle sprites
    for (const obs of this.levelConfig.obstacles) {
      this.add.sprite(
        this.gridOffsetX + obs.x * cs + cs / 2,
        this.gridOffsetY + obs.y * cs + cs / 2,
        'obstacle'
      ).setDisplaySize(cs, cs);
    }
  }

  private createServerSprites(): void {
    const cs = this.currentCellSize;
    this.servers.forEach((server) => {
      const sprite = new ServerRackSprite(
        this,
        server.position.x,
        server.position.y,
        server.id,
        server.meltdownThreshold,
        server.safeThreshold,
        this.gridOffsetX,
        this.gridOffsetY,
        cs
      );
      this.serverSprites.set(server.id, sprite);
    });
  }

  private createColdSourceSprites(): void {
    const cs = this.currentCellSize;
    for (const source of this.levelConfig.coldSources) {
      const sprite = new ColdSourceSprite(
        this,
        source.x,
        source.y,
        source.direction,
        this.gridOffsetX,
        this.gridOffsetY,
        cs
      );
      this.coldSourceSprites.push(sprite);
    }
  }

  private drawAirflowPaths(paths: Set<string>): void {
    const cs = this.currentCellSize;
    this.airflowGraphics.clear();
    this.airflowGraphics.fillStyle(0x4fc3f7, 0.2);

    for (const posKey of paths) {
      const [xStr, yStr] = posKey.split(',');
      const x = parseInt(xStr!, 10);
      const y = parseInt(yStr!, 10);
      this.airflowGraphics.fillRect(
        this.gridOffsetX + x * cs + 4,
        this.gridOffsetY + y * cs + 4,
        cs - 8,
        cs - 8
      );
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.pauseOverlay.show();
    } else {
      this.pauseOverlay.hide();
    }
  }

  private endLevel(success: boolean): void {
    this.isPaused = true;
    // Calculate tiles used
    let tilesUsed = 0;
    for (const type of ['straight', 'corner', 't_junction', 'cross'] as DuctType[]) {
      tilesUsed += (this.levelConfig.availableTiles[type] ?? 0) - this.inventory.getRemainingCount(type);
    }

    this.scene.start('LevelCompleteScene', {
      success,
      levelId: this.levelConfig.id,
      tilesUsed,
      timeElapsed: this.elapsedTime,
      scoring: this.levelConfig.scoring,
    });
  }

  // --- Keyboard cursor controls ---

  private moveCursor(dx: number, dy: number): void {
    if (this.isPaused) return;
    this.cursorVisible = true;
    this.cursorX = Phaser.Math.Clamp(this.cursorX + dx, 0, this.grid.width - 1);
    this.cursorY = Phaser.Math.Clamp(this.cursorY + dy, 0, this.grid.height - 1);
    this.drawCursor();
  }

  private drawCursor(): void {
    this.cursorGraphics.clear();
    if (!this.cursorVisible) return;
    const cs = this.currentCellSize;
    this.cursorGraphics.lineStyle(2, 0xffffff, 0.9);
    this.cursorGraphics.strokeRect(
      this.gridOffsetX + this.cursorX * cs + 2,
      this.gridOffsetY + this.cursorY * cs + 2,
      cs - 4,
      cs - 4
    );
  }

  private handleKeyboardPlace(): void {
    if (this.isPaused || !this.cursorVisible) return;
    const existingDuct = getDuctAt(this.grid, this.cursorX, this.cursorY);
    if (existingDuct) {
      // If duct exists at cursor, rotate it
      rotateDuct(this.grid, this.cursorX, this.cursorY);
      const sprite = this.ductSprites.get(`${this.cursorX},${this.cursorY}`);
      sprite?.rotateClockwise();
    } else if (this.selectedType && canPlaceDuct(this.grid, this.cursorX, this.cursorY)) {
      this.placeDuctAt(this.cursorX, this.cursorY, this.selectedType);
    }
  }

  private handleKeyboardRotate(): void {
    if (this.isPaused || !this.cursorVisible) return;
    const existingDuct = getDuctAt(this.grid, this.cursorX, this.cursorY);
    if (existingDuct) {
      rotateDuct(this.grid, this.cursorX, this.cursorY);
      const sprite = this.ductSprites.get(`${this.cursorX},${this.cursorY}`);
      sprite?.rotateClockwise();
    }
  }

  private handleKeyboardRemove(): void {
    if (this.isPaused || !this.cursorVisible) return;
    const existingDuct = getDuctAt(this.grid, this.cursorX, this.cursorY);
    if (existingDuct) {
      this.removeDuctAt(this.cursorX, this.cursorY, existingDuct.type);
    }
  }
}
