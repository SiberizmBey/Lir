interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const clientId = typeof body.client_id === 'string' && body.client_id.trim()
    ? body.client_id.trim()
    : process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = typeof body.client_secret === 'string' && body.client_secret.trim()
    ? body.client_secret.trim()
    : process.env.SPOTIFY_CLIENT_SECRET || '';
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';

  if (!clientId) {
    return res.status(400).json({ error: 'Spotify Client ID eksik' });
  }
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token eksik' });
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  try {
    const spotifyResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: params.toString(),
    });
    const text = await spotifyResponse.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { error: text || 'Spotify boş veya geçersiz yanıt döndürdü' };
    }
    return res.status(spotifyResponse.status).json(responseBody);
  } catch (error: unknown) {
    console.error('Spotify token refresh error:', error);
    return res.status(502).json({ error: 'Spotify sunucusuna ulaşılamadı' });
  }
}
