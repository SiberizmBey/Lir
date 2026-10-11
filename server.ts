import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// 1. Spotify OAuth callback route (handles both with and without trailing slash)
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  const { code, error, state } = req.query;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>Spotify Yetkilendirme</title>
  <style>
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .box {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px 32px;
      text-align: center;
      max-width: 380px;
    }
    h2 { margin: 0 0 8px 0; font-size: 16px; color: ${error ? '#f87171' : '#1db954'}; }
    p { margin: 0; font-size: 13px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="box">
    <h2>${error ? 'Bağlantı Başarısız' : 'Spotify Bağlantısı Başarılı'}</h2>
    <p>${error ? 'Yetkilendirme reddedildi veya bir hata oluştu.' : 'Pencere kapatılıyor ve Lir uygulamasına aktarılıyor...'}</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: ${error ? "'OAUTH_AUTH_ERROR'" : "'OAUTH_AUTH_SUCCESS'"},
          code: ${JSON.stringify(code || '')},
          error: ${JSON.stringify(error || '')},
          state: ${JSON.stringify(state || '')}
        }, '*');
        setTimeout(() => window.close(), 600);
      } else {
        setTimeout(() => { window.location.href = '/'; }, 1000);
      }
    } catch (e) {
      console.error(e);
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 2. Spotify Token Exchange endpoint
app.post('/api/spotify/token', async (req, res) => {
  try {
    const { code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

    const clientId = client_id || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = client_secret || process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId) {
      return res.status(400).json({ error: 'Spotify Client ID eksik' });
    }

    if (!code) {
      return res.status(400).json({ error: 'Yetkilendirme kodu (code) eksik' });
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: String(redirect_uri),
      client_id: String(clientId),
    });

    if (code_verifier) {
      bodyParams.append('code_verifier', String(code_verifier));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    const spotifyRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });

    const data = await spotifyRes.json();
    if (!spotifyRes.ok) {
      return res.status(spotifyRes.status).json(data);
    }

    res.json(data);
  } catch (err: unknown) {
    console.error('Spotify token exchange error:', err);
    res.status(500).json({ error: 'Token değişimi sırasında sunucu hatası oluştu' });
  }
});

// 3. Spotify Token Refresh endpoint
app.post('/api/spotify/refresh', async (req, res) => {
  try {
    const { refresh_token, client_id, client_secret } = req.body;

    const clientId = client_id || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = client_secret || process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId) {
      return res.status(400).json({ error: 'Spotify Client ID eksik' });
    }

    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token eksik' });
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refresh_token),
      client_id: String(clientId),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    }

    const spotifyRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: bodyParams.toString(),
    });

    const data = await spotifyRes.json();
    if (!spotifyRes.ok) {
      return res.status(spotifyRes.status).json(data);
    }

    res.json(data);
  } catch (err: unknown) {
    console.error('Spotify token refresh error:', err);
    res.status(500).json({ error: 'Token yenileme sırasında sunucu hatası oluştu' });
  }
});

// 4. Spotify configuration endpoint
app.get('/api/spotify/config', (req, res) => {
  res.json({
    hasEnvClientId: Boolean(process.env.SPOTIFY_CLIENT_ID),
    hasEnvClientSecret: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
    envClientId: process.env.SPOTIFY_CLIENT_ID || '',
  });
});

// Mount Vite middleware for dev or serve dist in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lir server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
