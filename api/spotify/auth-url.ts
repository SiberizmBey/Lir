interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

const DEFAULT_SPOTIFY_REDIRECT_URI = 'https://lir.anticvalley.com.tr/auth/callback';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const clientId =
    typeof body.client_id === 'string' && body.client_id.trim()
      ? body.client_id.trim()
      : process.env.SPOTIFY_CLIENT_ID || '';
  const redirectUri =
    typeof body.redirect_uri === 'string' && body.redirect_uri.trim()
      ? body.redirect_uri.trim()
      : DEFAULT_SPOTIFY_REDIRECT_URI;
  const codeChallenge =
    typeof body.code_challenge === 'string' ? body.code_challenge.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const scope =
    typeof body.scope === 'string' && body.scope.trim()
      ? body.scope.trim()
      : 'playlist-read-private playlist-read-collaborative user-library-read user-top-read user-read-recently-played';

  if (!clientId) {
    return res.status(400).json({ error: 'Spotify Client ID eksik' });
  }
  if (!codeChallenge) {
    return res.status(400).json({ error: 'PKCE code challenge eksik' });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    scope,
  });
  if (state) {
    params.set('state', state);
  }

  return res.status(200).json({
    url: `https://accounts.spotify.com/authorize?${params.toString()}`,
  });
}
