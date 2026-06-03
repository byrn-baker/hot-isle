// Grid rendering
export const CELL_SIZE = 64;
export const GRID_LINE_COLOR = 0x334455;
export const GRID_LINE_ALPHA = 0.5;

// Temperature defaults
export const DEFAULT_AMBIENT_TEMP = 20;
export const DEFAULT_HEAT_RATE = 5; // degrees per second
export const DEFAULT_COOLING_RATE = 8; // degrees per second
export const DEFAULT_MELTDOWN_THRESHOLD = 100;
export const DEFAULT_SAFE_THRESHOLD = 40;

// Simulation
export const TICK_INTERVAL_MS = 16; // ~60fps

// Colors
export const COLOR_COLD = 0x4fc3f7;
export const COLOR_WARM = 0xffb74d;
export const COLOR_HOT = 0xef5350;
export const COLOR_SAFE = 0x66bb6a;
export const COLOR_MELTDOWN = 0xb71c1c;
export const COLOR_BACKGROUND = 0x1a1a2e;
export const COLOR_GRID_BG = 0x16213e;
export const COLOR_DUCT = 0x90a4ae;
export const COLOR_SERVER = 0x546e7a;
export const COLOR_COLD_SOURCE = 0x29b6f6;
export const COLOR_OBSTACLE = 0x37474f;

// UI
export const UI_PADDING = 12;
export const FONT_FAMILY = 'monospace';
export const FONT_SIZE_SMALL = '12px';
export const FONT_SIZE_MEDIUM = '16px';
export const FONT_SIZE_LARGE = '24px';

// Scoring
export const MAX_STARS = 3;

// Leaderboard
export const LEADERBOARD_API_URL: string = '/api/leaderboard';
