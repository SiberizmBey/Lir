import express from 'express';
import http from 'node:http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { handleSpotifyApi } from './server/spotifyApi.ts';
import {
  cancelYouTubeAccountLogin,
  clearRuntimeYouTubeCookie,
  createAudioReadStream,
  ensureYouTubeAudioCached,
  getYouTubeConfig,
  isValidYouTubeVideoId,
  listCachedYouTubeTracks,
  logoutYouTubeAccount,
  matchSpotifyTrackToYouTube,
  searchYouTubeTracks,
  setRuntimeYouTubeCookie,
  startYouTubeAccountLogin,
} from './server/youtubeApi.ts';
import { scanSystemApps } from './server/systemApps.ts';
import { remoteHub } from './server/remoteHub.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

// 4b. Spotify OAuth authorize URL generator
app.post('/api/spotify/auth-url', async (req, res) => {
  const result = await handleSpotifyApi('auth-url', req.body);
  res.status(result.status).json(result.body);
});

// 5. YouTube Music API & Audio Proxy endpoints
app.get('/api/youtube/config', (_req, res) => {
  res.json(getYouTubeConfig());
});

app.post('/api/youtube/cookie', async (req, res) => {
  const body = (req.body || {}) as { cookie?: unknown };
  const rawCookie = typeof body.cookie === 'string' ? body.cookie : '';
  try {
    const result = await setRuntimeYouTubeCookie(rawCookie);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'YouTube çerezi kaydedilemedi',
    });
  }
});

app.delete('/api/youtube/cookie', async (_req, res) => {
  try {
    const result = await clearRuntimeYouTubeCookie();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'YouTube çerezi silinemedi',
    });
  }
});

app.post('/api/youtube/auth/start', async (_req, res) => {
  try {
    const config = await startYouTubeAccountLogin();
    res.json(config);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'YouTube giriş kodu alınamadı',
    });
  }
});

app.get('/api/youtube/auth/status', (_req, res) => {
  res.json(getYouTubeConfig());
});

app.post('/api/youtube/auth/cancel', (_req, res) => {
  res.json(cancelYouTubeAccountLogin());
});

app.post('/api/youtube/auth/logout', async (_req, res) => {
  try {
    const config = await logoutYouTubeAccount();
    res.json(config);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'YouTube çıkışı yapılamadı',
    });
  }
});

app.get('/api/youtube/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;
  const limit = Number.isFinite(limitRaw) ? Math.min(15, Math.max(1, limitRaw)) : 10;

  if (!query) {
    res.json({ tracks: [] });
    return;
  }

  try {
    const tracks = await searchYouTubeTracks(query, limit);
    res.json({ tracks });
  } catch (err) {
    console.error('YouTube search failed:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'YouTube araması başarısız oldu',
      tracks: [],
    });
  }
});

app.get('/api/youtube/cached', async (_req, res) => {
  try {
    const tracks = await listCachedYouTubeTracks();
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Önbellek listelenemedi',
      tracks: [],
    });
  }
});

app.post('/api/youtube/match', async (req, res) => {
  const body = (req.body || {}) as {
    trackName?: unknown;
    artistName?: unknown;
    durationSec?: unknown;
    videoId?: unknown;
  };
  const trackName = typeof body.trackName === 'string' ? body.trackName.trim() : '';
  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : undefined;
  const durationSec =
    typeof body.durationSec === 'number' && Number.isFinite(body.durationSec)
      ? body.durationSec
      : undefined;

  if (!trackName && !videoId) {
    res.status(400).json({ error: 'Şarkı adı veya video ID gerekli' });
    return;
  }
  if (videoId && !isValidYouTubeVideoId(videoId)) {
    res.status(400).json({ error: 'Geçersiz YouTube video ID' });
    return;
  }

  try {
    const matched = await matchSpotifyTrackToYouTube({
      trackName: trackName || 'YouTube Track',
      artistName,
      durationSec,
      videoId,
    });
    res.json(matched);
  } catch (err) {
    console.error('YouTube match/download failed:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'YouTube üzerinden ses alınamadı',
    });
  }
});

app.get('/api/youtube/audio/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!isValidYouTubeVideoId(videoId)) {
    res.status(400).json({ error: 'Geçersiz YouTube video ID' });
    return;
  }

  try {
    const cached = await ensureYouTubeAudioCached(videoId);
    const total = cached.byteLength;
    const rangeHeader = req.headers.range;

    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const [rawStart, rawEnd] = rangeHeader.replace('bytes=', '').split('-');
      const start = Math.max(0, parseInt(rawStart, 10) || 0);
      const end = rawEnd ? Math.min(total - 1, parseInt(rawEnd, 10)) : total - 1;
      if (start >= total || end < start) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      createAudioReadStream(cached.filePath, start, end).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(total));
    createAudioReadStream(cached.filePath).pipe(res);
  } catch (err) {
    console.error(`YouTube audio stream error (${videoId}):`, err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'YouTube ses akışı alınamadı',
    });
  }
});

// 6. Installed / Running system applications list (for Hotkey App Filter)
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

