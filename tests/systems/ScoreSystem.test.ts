import { describe, it, expect } from 'vitest';
import { calculateScore } from '@/systems/ScoreSystem';
import type { LevelScoringConfig } from '@/types';

const scoring: LevelScoringConfig = {
  threeStarTiles: 3,
  twoStarTiles: 5,
  threeStarTime: 30,
  twoStarTime: 60,
};

describe('ScoreSystem', () => {
  describe('calculateScore', () => {
    it('gives 3 stars when both tile and time are within thresholds', () => {
      const result = calculateScore(2, 20, scoring);
      expect(result.stars).toBe(3);
      expect(result.tileStars).toBe(3);
      expect(result.timeStars).toBe(3);
    });

    it('gives 2 stars when tiles exceed 3-star but within 2-star', () => {
      const result = calculateScore(4, 20, scoring);
      expect(result.stars).toBe(2);
      expect(result.tileStars).toBe(2);
      expect(result.timeStars).toBe(3);
    });

    it('gives 1 star when tiles exceed 2-star threshold', () => {
      const result = calculateScore(8, 20, scoring);
      expect(result.stars).toBe(1);
      expect(result.tileStars).toBe(1);
    });

    it('gives 2 stars when time exceeds 3-star but within 2-star', () => {
      const result = calculateScore(2, 45, scoring);
      expect(result.stars).toBe(2);
      expect(result.timeStars).toBe(2);
    });

    it('gives 1 star when time exceeds 2-star threshold', () => {
      const result = calculateScore(2, 90, scoring);
      expect(result.stars).toBe(1);
      expect(result.timeStars).toBe(1);
    });

    it('overall stars is minimum of tile and time stars', () => {
      // 3-star tiles, 1-star time → 1 star overall
      const result = calculateScore(2, 90, scoring);
      expect(result.stars).toBe(1);
      expect(result.tileStars).toBe(3);
      expect(result.timeStars).toBe(1);
    });

    it('returns correct metadata', () => {
      const result = calculateScore(4, 45, scoring);
      expect(result.tilesUsed).toBe(4);
      expect(result.timeElapsed).toBe(45);
    });

    it('exact threshold values earn higher tier', () => {
      // Exactly at the 3-star threshold
      const result = calculateScore(3, 30, scoring);
      expect(result.stars).toBe(3);
    });
  });
});
