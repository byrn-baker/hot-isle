interface Env {
  LEADERBOARD: KVNamespace;
}

interface LeaderboardEntry {
  nickname: string;
  stars: number;
  totalTime: number;
  levelsCompleted: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only handle /api/leaderboard
    if (url.pathname !== '/api/leaderboard') {
      return new Response(null, { status: 404 });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === 'GET') {
      return handleGet(env);
    }

    if (request.method === 'POST') {
      return handlePost(request, env);
    }

    return errorResponse('Method not allowed', 405);
  },
} satisfies ExportedHandler<Env>;

async function handleGet(env: Env): Promise<Response> {
  const raw = await env.LEADERBOARD.get('top3');
  const entries: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
  return jsonResponse(entries);
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body || typeof body !== 'object') {
    return errorResponse('Request body must be an object', 400);
  }

  const { nickname, stars, totalTime, levelsCompleted } = body as Record<string, unknown>;

  // Validate nickname
  if (typeof nickname !== 'string') {
    return errorResponse('nickname must be a string', 400);
  }
  const trimmedNickname = nickname.trim();
  if (trimmedNickname.length < 1 || trimmedNickname.length > 20) {
    return errorResponse('nickname must be 1-20 characters', 400);
  }

  // Validate stars
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 0 || stars > 30) {
    return errorResponse('stars must be an integer between 0 and 30', 400);
  }

  // Validate totalTime
  if (typeof totalTime !== 'number' || totalTime <= 0) {
    return errorResponse('totalTime must be a number greater than 0', 400);
  }

  // Validate levelsCompleted
  if (typeof levelsCompleted !== 'number' || !Number.isInteger(levelsCompleted) || levelsCompleted < 1 || levelsCompleted > 10) {
    return errorResponse('levelsCompleted must be an integer between 1 and 10', 400);
  }

  const newEntry: LeaderboardEntry = {
    nickname: trimmedNickname,
    stars,
    totalTime,
    levelsCompleted,
  };

  // Get current leaderboard
  const raw = await env.LEADERBOARD.get('top3');
  const entries: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];

  // Add new entry and sort: stars desc, then totalTime asc
  entries.push(newEntry);
  entries.sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    return a.totalTime - b.totalTime;
  });

  // Keep only top 3
  const top3 = entries.slice(0, 3);

  // Check if the new entry made it into top 3
  const qualified = top3.some(
    (e) => e.nickname === newEntry.nickname && e.stars === newEntry.stars && e.totalTime === newEntry.totalTime
  );

  await env.LEADERBOARD.put('top3', JSON.stringify(top3));

  return jsonResponse({ success: true, qualified });
}
