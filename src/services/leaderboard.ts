import type { LeaderboardEntry } from '@/types';
import { LEADERBOARD_API_URL } from '@/utils/constants';

/**
 * Fetches the top 3 leaderboard entries from the backend.
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch(LEADERBOARD_API_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Leaderboard fetch failed: ${response.status}`);
  }

  return response.json() as Promise<LeaderboardEntry[]>;
}

/**
 * Submits a score to the leaderboard. Returns true if the score qualified for top 3.
 */
export async function submitScore(
  nickname: string,
  stars: number,
  totalTime: number,
  levelsCompleted: number,
): Promise<boolean> {
  const response = await fetch(LEADERBOARD_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, stars, totalTime, levelsCompleted }),
  });

  if (!response.ok) {
    throw new Error(`Score submission failed: ${response.status}`);
  }

  const result = (await response.json()) as { success: boolean; qualified: boolean };
  return result.qualified;
}
