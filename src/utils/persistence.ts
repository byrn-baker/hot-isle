import type { CustomLevelEntry, CustomLevelStore, Difficulty, LevelProgress, PlayerProgress } from '@/types';

const PROGRESS_KEY = 'hici-progress';
const CUSTOM_LEVELS_KEY = 'hici-custom-levels';
const DIFFICULTY_KEY = 'hici-difficulty';

// === Player Progress ===

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { levels: {} };
    return JSON.parse(raw) as PlayerProgress;
  } catch {
    return { levels: {} };
  }
}

export function saveProgress(progress: PlayerProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function getLevelProgress(levelId: string): LevelProgress | null {
  const progress = loadProgress();
  return progress.levels[levelId] ?? null;
}

export function saveLevelProgress(levelId: string, result: LevelProgress): void {
  const progress = loadProgress();
  const existing = progress.levels[levelId];

  // Only update if better result
  if (!existing || result.stars > existing.stars) {
    progress.levels[levelId] = result;
  } else {
    // Update best time/tiles if this attempt was better
    if (result.bestTilesUsed < existing.bestTilesUsed) {
      existing.bestTilesUsed = result.bestTilesUsed;
    }
    if (result.bestTime < existing.bestTime) {
      existing.bestTime = result.bestTime;
    }
  }

  saveProgress(progress);
}

export function isLevelUnlocked(levelId: string, allLevelIds: string[]): boolean {
  const index = allLevelIds.indexOf(levelId);
  if (index <= 0) return true; // First level always unlocked
  const previousId = allLevelIds[index - 1]!;
  const previousProgress = getLevelProgress(previousId);
  return previousProgress?.completed ?? false;
}

// === Custom Levels ===

export function loadCustomLevels(): CustomLevelStore {
  try {
    const raw = localStorage.getItem(CUSTOM_LEVELS_KEY);
    if (!raw) return { levels: [] };
    return JSON.parse(raw) as CustomLevelStore;
  } catch {
    return { levels: [] };
  }
}

export function saveCustomLevels(store: CustomLevelStore): void {
  localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(store));
}

export function addCustomLevel(entry: CustomLevelEntry): void {
  const store = loadCustomLevels();
  store.levels.push(entry);
  saveCustomLevels(store);
}

export function removeCustomLevel(id: string): void {
  const store = loadCustomLevels();
  store.levels = store.levels.filter((l) => l.id !== id);
  saveCustomLevels(store);
}

export function getCustomLevel(id: string): CustomLevelEntry | null {
  const store = loadCustomLevels();
  return store.levels.find((l) => l.id === id) ?? null;
}

// === Difficulty ===

export function loadDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(DIFFICULTY_KEY);
    if (raw === 'easy' || raw === 'normal' || raw === 'hard') {
      return raw;
    }
    return 'normal';
  } catch {
    return 'normal';
  }
}

export function saveDifficulty(d: Difficulty): void {
  localStorage.setItem(DIFFICULTY_KEY, d);
}
