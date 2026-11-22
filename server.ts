import express from 'express';
import http from 'node:http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { handleSpotifyApi } from './server/spotifyApi.ts';
import { scanSystemApps } from './server/systemApps.ts';
import { remoteHub } from './server/remoteHub.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// 1. Spotify OAuth callback route (handles both with and without trailing slash)
app.get(['/auth/callback', '/auth/callback/'], (req, res) => {
  const { code, error, state } = req.query;
  const authError = error || (!code ? 'missing_code' : '');

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
    h2 { margin: 0 0 8px 0; font-size: 16px; color: ${authError ? '#f87171' : '#1db954'}; }
    p { margin: 0; font-size: 13px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="box">
    <h2>${authError ? 'Bağlantı Başarısız' : 'Yetkilendirme alındı'}</h2>
    <p>${authError ? (authError === 'missing_code' ? 'Spotify yetkilendirme kodu göndermedi.' : 'Yetkilendirme reddedildi veya bir hata oluştu.') : 'Spotify bağlantısı doğrulanıyor...'}</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: ${authError ? "'OAUTH_AUTH_ERROR'" : "'OAUTH_AUTH_SUCCESS'"},
          code: ${JSON.stringify(code || '')},
          error: ${JSON.stringify(authError || '')},
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
  const result = await handleSpotifyApi('token', req.body);
  res.status(result.status).json(result.body);
});

// 3. Spotify Token Refresh endpoint
app.post('/api/spotify/refresh', async (req, res) => {
  const result = await handleSpotifyApi('refresh', req.body);
  res.status(result.status).json(result.body);
});

// 4. Spotify configuration endpoint
app.get('/api/spotify/config', async (_req, res) => {
  const result = await handleSpotifyApi('config');
  res.status(result.status).json(result.body);
});

// 5. Installed / Running system applications list (for Hotkey App Filter)
app.get('/api/system/apps', async (_req, res) => {
  try {
    const apps = await scanSystemApps();
    res.json({ apps });
  } catch (err) {
    console.warn('Failed to scan system apps:', err);
    res.status(500).json({ error: 'Uygulama listesi alınamadı.', apps: [] });
  }
});

// Mount Vite middleware for dev or serve dist in production
async function startServer() {
  const httpServer = http.createServer(app);
  remoteHub.attach(app, httpServer, PORT);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Lir server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

