import type { LevelScoringConfig } from '@/types';

export type StarRating = 1 | 2 | 3;

export interface ScoreResult {
  stars: StarRating;
  tilesUsed: number;
  timeElapsed: number;
  tileStars: StarRating;
  timeStars: StarRating;
}

/**
 * Calculate star rating based on tiles used and time elapsed.
 * Final rating is the minimum of tile stars and time stars.
 */
export function calculateScore(
  tilesUsed: number,
  timeElapsed: number,
  scoring: LevelScoringConfig
): ScoreResult {
  const tileStars = getTileStars(tilesUsed, scoring);
  const timeStars = getTimeStars(timeElapsed, scoring);

  // Overall stars = minimum of both categories
  const stars: StarRating = Math.min(tileStars, timeStars) as StarRating;

  return { stars, tilesUsed, timeElapsed, tileStars, timeStars };
}

function getTileStars(tilesUsed: number, scoring: LevelScoringConfig): StarRating {
  if (tilesUsed <= scoring.threeStarTiles) return 3;
  if (tilesUsed <= scoring.twoStarTiles) return 2;
  return 1;
}

function getTimeStars(timeElapsed: number, scoring: LevelScoringConfig): StarRating {
  if (timeElapsed <= scoring.threeStarTime) return 3;
  if (timeElapsed <= scoring.twoStarTime) return 2;
  return 1;
}
