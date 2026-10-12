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
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
  const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier.trim() : '';

  if (!clientId) {
    return res.status(400).json({ error: 'Spotify Client ID eksik' });
  }
  if (!code || !redirectUri || !codeVerifier) {
    return res.status(400).json({ error: 'OAuth kodu, Redirect URI veya code verifier eksik' });
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
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
    console.error('Spotify token exchange error:', error);
    return res.status(502).json({ error: 'Spotify sunucusuna ulaşılamadı' });
  }
}
