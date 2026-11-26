import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import express from 'express';
import { ClientType, Constants, Innertube, Log, Platform } from 'youtubei.js';
import yts from 'yt-search';

const execFileAsync = promisify(execFile);
Log.setLevel(Log.Level.ERROR);

// Provide JS evaluator so Innertube can decipher signature/n-param URLs cleanly inside Electron
Platform.shim.eval = async (data, evalEnv) => {
  const properties = [];
  if (evalEnv.n) properties.push(`n: exportedVars.nFunction(${JSON.stringify(evalEnv.n)})`);
  if (evalEnv.sig) properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(evalEnv.sig)})`);
  const code = `${data.output}\nreturn {${properties.join(',')}}`;
  return new Function(code)();
};

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_SPOTIFY_REDIRECT_URI = 'https://lir.anticvalley.com.tr/auth/callback';
const MAX_AUDIO_BYTES = 28 * 1024 * 1024;
const MAX_CACHED_FILES = 60;
const MAX_COOKIE_INPUT_BYTES = 48 * 1024;
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

let httpServer = null;
let serverBaseUrl = '';

export async function startLocalApiServer(options = {}) {
  if (httpServer && serverBaseUrl) {
    return serverBaseUrl;
  }

  try {
    dotenv.config();
  } catch {
    // ignore missing .env
  }

  const cacheBaseDir = path.resolve(
    options.dataDir || path.join(process.cwd(), '.lir-cache'),
  );
  const cacheRootDir = path.resolve(cacheBaseDir, 'youtube-audio');
  const binRootDir = path.resolve(cacheBaseDir, 'bin');
  const runtimeCookieFile = path.resolve(cacheBaseDir, 'youtube-cookie.txt');
  const runtimeOAuthFile = path.resolve(cacheBaseDir, 'youtube-oauth.json');

  let anonymousInnertubePromise = null;
  let cookieInnertubePromise = null;
  let oauthInnertubePromise = null;
  let ytDlpBinaryPromise = null;
  let runtimeCookieLoaded = false;
  let runtimeCookieValue = '';
  let runtimeOAuthLoaded = false;
  let runtimeOAuthTokens = null;
  let authState = {
    status: 'idle',
    pendingAuth: null,
    error: null,
  };
  let activeLoginAbort = null;
  const inFlightDownloads = new Map();

  function loadRuntimeCookieSync() {
    if (runtimeCookieLoaded) return runtimeCookieValue;
    runtimeCookieLoaded = true;
    try {
      if (fs.existsSync(runtimeCookieFile)) {
        runtimeCookieValue = fs.readFileSync(runtimeCookieFile, 'utf8').trim();
      }
    } catch {
      runtimeCookieValue = '';
    }
    return runtimeCookieValue;
  }

  function loadRuntimeOAuthSync() {
    if (runtimeOAuthLoaded) return runtimeOAuthTokens;
    runtimeOAuthLoaded = true;
    try {
      if (fs.existsSync(runtimeOAuthFile)) {
        const raw = fs.readFileSync(runtimeOAuthFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed?.access_token && parsed?.refresh_token && parsed?.expiry_date) {
          runtimeOAuthTokens = parsed;
          if (authState.status === 'idle') {
            authState.status = 'connected';
          }
        }
      }
    } catch {
      runtimeOAuthTokens = null;
    }
    return runtimeOAuthTokens;
  }

  async function persistRuntimeOAuth(tokens) {
    runtimeOAuthTokens = tokens;
    runtimeOAuthLoaded = true;
    await fsp.mkdir(cacheBaseDir, { recursive: true });
    await fsp.writeFile(runtimeOAuthFile, JSON.stringify(tokens), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  async function deleteRuntimeOAuth() {
    runtimeOAuthTokens = null;
    runtimeOAuthLoaded = true;
    await fsp.unlink(runtimeOAuthFile).catch(() => {});
  }

  function getEffectiveYouTubeCookie() {
    const runtime = loadRuntimeCookieSync();
    if (runtime) return { cookie: runtime, source: 'runtime' };
    const envCookie = env.YOUTUBE_COOKIE?.trim() || '';
    if (envCookie) return { cookie: envCookie, source: 'env' };
    return { cookie: '', source: 'none' };
  }

  function isValidYouTubeVideoId(videoId) {
    return typeof videoId === 'string' && YOUTUBE_ID_REGEX.test(videoId.trim());
  }

  function getYouTubeConfig() {
    const { cookie, source } = getEffectiveYouTubeCookie();
    const oauth = loadRuntimeOAuthSync();
    const resolvedAuthStatus =
      authState.status === 'pending'
        ? 'pending'
        : oauth
          ? 'connected'
          : authState.status === 'error'
            ? 'error'
            : 'idle';

    return {
      hasApiKey: Boolean(env.YOUTUBE_API_KEY?.trim()),
      hasCookie: Boolean(cookie),
      cookieSource: source,
      hasOAuth: Boolean(oauth),
      authStatus: resolvedAuthStatus,
      pendingAuth: authState.status === 'pending' ? authState.pendingAuth : null,
      authError: authState.status === 'error' ? authState.error : null,
    };
  }

  function sanitizeCookiePair(name, value) {
    const cleanName = name.replace(/[\r\n\0;\s]/g, '').trim();
    const cleanVal = value.replace(/[\r\n\0;]/g, '').trim();
    if (!cleanName || !cleanVal) return null;
    if (/[\u0000-\u001f\u007f]/.test(cleanName) || /[\u0000-\u001f\u007f]/.test(cleanVal)) {
      return null;
    }
    return `${cleanName}=${cleanVal}`;
  }

  function parseAndSanitizeYouTubeCookie(rawInput) {
    if (typeof rawInput !== 'string') {
      throw new Error('Geçerli bir çerez metni girilmelidir.');
    }
    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new Error('Çerez alanı boş bırakılamaz.');
    }
    if (Buffer.byteLength(trimmed, 'utf8') > MAX_COOKIE_INPUT_BYTES) {
      throw new Error('Çerez verisi çok büyük (en fazla 48 KB).');
    }

    const lines = trimmed.split(/\r?\n/);
    const isNetscape = lines.some((line) => {
      const clean = line.replace(/^#HttpOnly_/i, '').trim();
      return clean && !clean.startsWith('#') && clean.split('\t').length >= 7;
    });

    const pairs = new Map();
    if (isNetscape) {
      for (const rawLine of lines) {
        const normalized = rawLine.replace(/^#HttpOnly_/i, '').trim();
        if (!normalized || normalized.startsWith('#')) continue;
        const cols = normalized.split('\t');
        if (cols.length < 7) continue;
        const domain = cols[0].toLowerCase();
        if (
          !domain.includes('youtube.com') &&
          !domain.includes('google.com') &&
          !domain.includes('youtu.be')
        ) {
          continue;
        }
        const pair = sanitizeCookiePair(cols[5], cols.slice(6).join('\t'));
        if (pair) {
          pairs.set(pair.slice(0, pair.indexOf('=')), pair);
        }
      }
    } else {
      const withoutPrefix = trimmed.replace(/^cookie\s*:\s*/i, '');
      for (const part of withoutPrefix.split(';')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx <= 0) continue;
        const pair = sanitizeCookiePair(part.slice(0, eqIdx), part.slice(eqIdx + 1));
        if (pair) {
          pairs.set(pair.slice(0, pair.indexOf('=')), pair);
        }
      }
    }

    if (pairs.size === 0) {
      throw new Error(
        'Geçerli YouTube çerezi bulunamadı. HTTP Cookie metni (SID=...; HSID=...) veya Netscape cookies.txt içeriği yapıştırın.',
      );
    }

    return {
      header: Array.from(pairs.values()).join('; '),
      cookieCount: pairs.size,
    };
  }

  async function setRuntimeYouTubeCookie(rawInput) {
    const { header, cookieCount } = parseAndSanitizeYouTubeCookie(rawInput);
    await fsp.mkdir(cacheBaseDir, { recursive: true });
    await fsp.writeFile(runtimeCookieFile, header, { encoding: 'utf8', mode: 0o600 });
    runtimeCookieValue = header;
    runtimeCookieLoaded = true;
    cookieInnertubePromise = null;
    return {
      ...getYouTubeConfig(),
      cookieCount,
    };
  }

  async function clearRuntimeYouTubeCookie() {
    runtimeCookieValue = '';
    runtimeCookieLoaded = true;
    cookieInnertubePromise = null;
    await fsp.unlink(runtimeCookieFile).catch(() => {});
    return getYouTubeConfig();
  }

  async function getAnonymousInnertube() {
    if (!anonymousInnertubePromise) {
      anonymousInnertubePromise = Innertube.create({
        retrieve_player: true,
      }).catch((err) => {
        anonymousInnertubePromise = null;
        throw err;
      });
    }
    return anonymousInnertubePromise;
  }

  async function getCookieInnertube() {
    const { cookie } = getEffectiveYouTubeCookie();
    if (!cookie) return null;
    if (!cookieInnertubePromise) {
      cookieInnertubePromise = Innertube.create({
        retrieve_player: true,
        cookie,
      }).catch((err) => {
        cookieInnertubePromise = null;
        throw err;
      });
    }
    return cookieInnertubePromise;
  }

  async function getOAuthInnertube(allowAnonymous = false) {
    if (!oauthInnertubePromise) {
      const savedOAuth = loadRuntimeOAuthSync();
      if (!savedOAuth && !allowAnonymous) {
        return getAnonymousInnertube();
      }
      oauthInnertubePromise = (async () => {
        const yt = await Innertube.create({
          retrieve_player: true,
          client_type: ClientType.TV,
        });

        if (savedOAuth) {
          try {
            yt.session.on('update-credentials', ({ credentials }) => {
              if (credentials?.access_token && credentials?.refresh_token && credentials?.expiry_date) {
                void persistRuntimeOAuth({
                  ...credentials,
                  client: credentials.client || savedOAuth.client || yt.session.oauth.client_id,
                });
              }
            });
            await yt.session.signIn(savedOAuth);
            authState = { status: 'connected', pendingAuth: null, error: null };
          } catch (err) {
            console.warn('Electron YouTube OAuth session invalid/expired:', err);
            await deleteRuntimeOAuth();
            authState = {
              status: 'error',
              pendingAuth: null,
              error: 'YouTube hesabının oturum süresi doldu. Lütfen yeniden giriş yapın.',
            };
          }
        }

        return yt;
      })().catch((err) => {
        oauthInnertubePromise = null;
        throw err;
      });
    }
    return oauthInnertubePromise;
  }

  function sleepAbortable(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function startYouTubeAccountLogin() {
    if (activeLoginAbort) {
      activeLoginAbort.abort();
      activeLoginAbort = null;
    }

    const controller = new AbortController();
    activeLoginAbort = controller;

    const yt = await getOAuthInnertube(true);
    const clientId = yt.session.oauth.client_id || (await yt.session.oauth.getClientID());
    yt.session.oauth.client_id = clientId;
    const deviceCodeData = await yt.session.oauth.getDeviceAndUserCode();

    const expiresAt = Date.now() + Math.max(60, Number(deviceCodeData.expires_in || 1800)) * 1000;
    authState = {
      status: 'pending',
      pendingAuth: {
        userCode: deviceCodeData.user_code,
        verificationUrl: deviceCodeData.verification_url || 'https://www.google.com/device',
        expiresAt,
      },
      error: null,
    };

    let pollIntervalMs = Math.max(5, Number(deviceCodeData.interval || 5)) * 1000;
    const tokenUrl = yt.session.oauth.AUTH_SERVER_TOKEN_URL.toString();

    void (async () => {
      try {
        while (!controller.signal.aborted && Date.now() < expiresAt) {
          await sleepAbortable(pollIntervalMs, controller.signal);
          if (controller.signal.aborted) return;

          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId.client_id,
              client_secret: clientId.client_secret,
              code: deviceCodeData.device_code,
              grant_type: 'http://oauth.net/grant_type/device/1.0',
            }),
            signal: controller.signal,
          });

          const data = await tokenRes.json().catch(() => ({}));
          if (data.error) {
            if (data.error === 'authorization_pending') continue;
            if (data.error === 'slow_down') {
              pollIntervalMs = Math.min(15000, pollIntervalMs + 3000);
              continue;
            }
            if (data.error === 'access_denied') {
              authState = {
                status: 'error',
                pendingAuth: null,
                error: 'Google/YouTube giriş onayı reddedildi.',
              };
              return;
            }
            if (data.error === 'expired_token') {
              authState = {
                status: 'error',
                pendingAuth: null,
                error: 'Doğrulama kodunun süresi doldu. Lütfen yeniden deneyin.',
              };
              return;
            }
            authState = {
              status: 'error',
              pendingAuth: null,
              error: `YouTube giriş hatası: ${data.error}`,
            };
            return;
          }

          if (data.access_token && data.refresh_token) {
            const tokens = {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expiry_date: new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString(),
              scope: data.scope,
              token_type: data.token_type,
              client: clientId,
            };
            await persistRuntimeOAuth(tokens);
            oauthInnertubePromise = null;
            authState = { status: 'connected', pendingAuth: null, error: null };
            void getOAuthInnertube().catch(() => {});
            return;
          }
        }

        if (!controller.signal.aborted) {
          authState = {
            status: 'error',
            pendingAuth: null,
            error: 'Doğrulama kodunun süresi doldu.',
          };
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        authState = {
          status: 'error',
          pendingAuth: null,
          error: err instanceof Error ? err.message : 'YouTube oturum doğrulaması başarısız oldu.',
        };
      } finally {
        if (activeLoginAbort === controller) {
          activeLoginAbort = null;
        }
      }
    })();

    return getYouTubeConfig();
  }

  function cancelYouTubeAccountLogin() {
    if (activeLoginAbort) {
      activeLoginAbort.abort();
      activeLoginAbort = null;
    }
    const hasOAuth = Boolean(loadRuntimeOAuthSync());
    authState = {
      status: hasOAuth ? 'connected' : 'idle',
      pendingAuth: null,
      error: null,
    };
    return getYouTubeConfig();
  }

  async function logoutYouTubeAccount() {
    if (activeLoginAbort) {
      activeLoginAbort.abort();
      activeLoginAbort = null;
    }
    try {
      if (oauthInnertubePromise) {
        const yt = await oauthInnertubePromise;
        await yt.session.signOut().catch(() => {});
      }
    } catch {
      // ignore
    }
    await deleteRuntimeOAuth();
    oauthInnertubePromise = null;
    authState = { status: 'idle', pendingAuth: null, error: null };
    return getYouTubeConfig();
  }

  function isAllowedGoogleVideoUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      return host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
    } catch {
      return false;
    }
  }

  function resolveConfinedCachePath(fileName) {
    const target = path.resolve(cacheRootDir, fileName);
    if (!target.startsWith(cacheRootDir + path.sep)) {
      throw new Error('Geçersiz önbellek dosya yolu');
    }
    return target;
  }

  async function ensureCacheDir() {
    await fsp.mkdir(cacheRootDir, { recursive: true });
  }

  const AUDIO_EXT_MIME = {
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    webm: 'audio/webm',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
  };

  async function pruneCacheIfNeeded() {
    try {
      const entries = await fsp.readdir(cacheRootDir, { withFileTypes: true });
      const audioFiles = entries.filter(
        (e) => e.isFile() && /\.(m4a|mp4|webm|opus|ogg|mp3)$/i.test(e.name),
      );
      if (audioFiles.length <= MAX_CACHED_FILES) return;
      const withStats = await Promise.all(
        audioFiles.map(async (entry) => {
          const full = resolveConfinedCachePath(entry.name);
          const st = await fsp.stat(full);
          return { name: entry.name, full, mtimeMs: st.mtimeMs };
        }),
      );
      withStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const item of withStats.slice(0, withStats.length - MAX_CACHED_FILES)) {
        const id = item.name.replace(/\.(m4a|mp4|webm|opus|ogg|mp3)$/i, '');
        await fsp.unlink(item.full).catch(() => {});
        await fsp.unlink(resolveConfinedCachePath(`${id}.json`)).catch(() => {});
      }
    } catch {
      // non-fatal
    }
  }

  async function searchYouTubeTracks(rawQuery, limit = 10) {
    const query = rawQuery.trim().slice(0, 160);
    if (!query) return [];
    const clampedLimit = Math.min(15, Math.max(1, limit));

    try {
      const yt = await getAnonymousInnertube();
      const res = await yt.search(query, { type: 'video' });
      const mapped = [];
      for (const item of (res.videos || []).slice(0, clampedLimit)) {
        if (!isValidYouTubeVideoId(item?.id)) continue;
        mapped.push({
          videoId: item.id,
          title: item.title?.text || item.title?.toString?.() || 'YouTube Müzik',
          channelTitle: item.author?.name || 'YouTube',
          durationSec: Number(item.duration?.seconds || 0),
          thumbnailUrl:
            item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          source: 'youtube-innertube',
        });
      }
      if (mapped.length > 0) return mapped;
    } catch (err) {
      console.warn('Electron Innertube search error, trying yt-search:', err);
    }

    try {
      const fallback = await yts(query);
      return (fallback.videos || [])
        .filter((v) => isValidYouTubeVideoId(v?.videoId))
        .slice(0, clampedLimit)
        .map((v) => ({
          videoId: v.videoId,
          title: v.title || 'YouTube Müzik',
          channelTitle: v.author?.name || 'YouTube',
          durationSec: Number(v.seconds || 0),
          thumbnailUrl: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          source: 'youtube-search',
        }));
    } catch {
      return [];
    }
  }

  async function readExistingCachedAudio(videoId) {
    await ensureCacheDir();
    for (const ext of Object.keys(AUDIO_EXT_MIME)) {
      const audioPath = resolveConfinedCachePath(`${videoId}.${ext}`);
      try {
        const stat = await fsp.stat(audioPath);
        if (stat.isFile() && stat.size > 1024) {
          let meta = {};
          try {
            const rawMeta = await fsp.readFile(resolveConfinedCachePath(`${videoId}.json`), 'utf8');
            meta = JSON.parse(rawMeta);
          } catch {}
          return {
            videoId,
            filePath: audioPath,
            contentType: AUDIO_EXT_MIME[ext] || 'audio/mp4',
            byteLength: stat.size,
            ...meta,
          };
        }
      } catch {}
    }
    return null;
  }

  async function listCachedYouTubeTracks() {
    await ensureCacheDir();
    let entries = [];
    try {
      entries = await fsp.readdir(cacheRootDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const tracksById = new Map();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = /^([A-Za-z0-9_-]{11})\.(m4a|mp4|webm|opus|ogg|mp3)$/i.exec(entry.name);
      if (!match) continue;
      const videoId = match[1];
      const ext = match[2].toLowerCase();
      if (tracksById.has(videoId)) continue;

      try {
        const audioPath = resolveConfinedCachePath(entry.name);
        const stat = await fsp.stat(audioPath);
        if (!stat.isFile() || stat.size <= 1024) continue;

        let meta = {};
        try {
          const rawMeta = await fsp.readFile(resolveConfinedCachePath(`${videoId}.json`), 'utf8');
          meta = JSON.parse(rawMeta);
        } catch {
          // ignore missing/corrupt meta
        }

        tracksById.set(videoId, {
          videoId,
          title: meta.title || 'YouTube Müzik',
          channelTitle: meta.channelTitle || 'YouTube',
          durationSec: Number(meta.durationSec || 0),
          thumbnailUrl:
            meta.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          audioUrl: `/api/youtube/audio/${videoId}`,
          contentType: AUDIO_EXT_MIME[ext] || 'audio/mp4',
          byteLength: stat.size,
          cachedAt: Math.round(stat.mtimeMs),
        });
      } catch {
        // skip unreadable entry
      }
    }

    return Array.from(tracksById.values()).sort((a, b) => b.cachedAt - a.cachedAt);
  }

  function getClientUserAgent(client) {
    switch (client) {
      case 'IOS':
        return Constants.CLIENTS.IOS.USER_AGENT;
      case 'ANDROID_VR':
        return Constants.CLIENTS.ANDROID_VR.USER_AGENT;
      case 'VISIONOS':
        return Constants.CLIENTS.VISIONOS.USER_AGENT;
      case 'TV':
        return Constants.CLIENTS.TV.USER_AGENT;
      default:
        return undefined;
    }
  }

  function pickBestPlayableAudioFormat(info) {
    const all = [
      ...(info.streaming_data?.adaptive_formats || []),
      ...(info.streaming_data?.formats || []),
    ].filter(
      (f) =>
        f &&
        f.has_audio &&
        !f.has_video &&
        !f.is_type_otf &&
        !(Array.isArray(f.drm_families) && f.drm_families.length > 0) &&
        Boolean(f.url || f.signature_cipher || f.cipher),
    );

    if (all.length === 0) return null;

    all.sort((a, b) => {
      const aMp4 = (a.mime_type || '').toLowerCase().includes('mp4') ? 1 : 0;
      const bMp4 = (b.mime_type || '').toLowerCase().includes('mp4') ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;

      const aOrig = a.is_original ? 1 : 0;
      const bOrig = b.is_original ? 1 : 0;
      if (aOrig !== bOrig) return bOrig - aOrig;

      const aDrc = a.is_drc ? 1 : 0;
      const bDrc = b.is_drc ? 1 : 0;
      if (aDrc !== bDrc) return aDrc - bDrc;

      return Number(b.bitrate || 0) - Number(a.bitrate || 0);
    });

    return all[0];
  }

  async function downloadAudioStreamWithRangeFallback(
    streamUrl,
    expectedLength,
    clientUserAgent,
    isMobileClient = false,
  ) {
    if (!isAllowedGoogleVideoUrl(streamUrl)) {
      throw new Error('Güvenlik doğrulaması: Geçersiz ses akışı adresi');
    }
    if (expectedLength && expectedLength > MAX_AUDIO_BYTES) {
      throw new Error('Ses dosyası 28 MB güvenlik sınırını aşıyor');
    }

    const baseHeaders = isMobileClient
      ? {
          Accept: '*/*',
          ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
        }
      : {
          ...Constants.STREAM_HEADERS,
          ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
        };

    if (expectedLength && expectedLength > CHUNK_SIZE_BYTES) {
      const chunks = [];
      let offset = 0;
      while (offset < expectedLength) {
        const end = Math.min(expectedLength - 1, offset + CHUNK_SIZE_BYTES - 1);
        const sep = streamUrl.includes('?') ? '&' : '?';
        const chunkUrl = isMobileClient ? `${streamUrl}${sep}range=${offset}-${end}` : streamUrl;
        const headers = isMobileClient ? baseHeaders : { ...baseHeaders, Range: `bytes=${offset}-${end}` };
        const res = await fetch(chunkUrl, { headers });
        if (!res.ok) throw new Error(`Ses akışı indirilemedi (HTTP ${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength === 0) break;
        chunks.push(buf);
        offset += buf.byteLength;
        if (offset > MAX_AUDIO_BYTES) throw new Error('Ses dosyası 28 MB sınırını aştı');
      }
      return Buffer.concat(chunks);
    }

    const res = await fetch(streamUrl, { headers: baseHeaders });
    if (!res.ok || !res.body) {
      throw new Error(`Ses akışı indirilemedi (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const parts = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_AUDIO_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error('Ses dosyası 28 MB güvenlik sınırını aşıyor');
        }
        parts.push(Buffer.from(value));
      }
    }
    return Buffer.concat(parts);
  }

  async function resolveYtDlpBinary() {
    if (ytDlpBinaryPromise) return ytDlpBinaryPromise;

    ytDlpBinaryPromise = (async () => {
      const systemCmd = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
      try {
        await execFileAsync(systemCmd, ['--version'], { timeout: 4000, windowsHide: true });
        return systemCmd;
      } catch {
        // Not installed on PATH; use/cache official standalone yt-dlp binary inside Lir cache
      }

      const binName =
        process.platform === 'win32'
          ? 'yt-dlp.exe'
          : process.platform === 'darwin'
            ? 'yt-dlp_macos'
            : 'yt-dlp_linux';
      const localBin = path.resolve(binRootDir, binName);
      if (fs.existsSync(localBin)) {
        try {
          const st = await fsp.stat(localBin);
          if (st.size > 1_000_000) return localBin;
        } catch {}
      }

      await fsp.mkdir(binRootDir, { recursive: true });
      const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${binName}`;
      console.log(`[Lir YouTube] Downloading standalone ${binName} fallback...`);
      const res = await fetch(downloadUrl, { redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`yt-dlp indirilemedi (HTTP ${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 1_000_000) {
        throw new Error('İndirilen yt-dlp ikilisi geçersiz boyutlu');
      }
      const tmpBin = `${localBin}.tmp-${Date.now()}`;
      await fsp.writeFile(tmpBin, buf, { mode: 0o755 });
      await fsp.rename(tmpBin, localBin);
      if (process.platform !== 'win32') {
        await fsp.chmod(localBin, 0o755).catch(() => {});
      }
      return localBin;
    })().catch((err) => {
      ytDlpBinaryPromise = null;
      throw err;
    });

    return ytDlpBinaryPromise;
  }

  async function downloadWithYtDlpFallback(videoId, metaHint) {
    const binPath = await resolveYtDlpBinary();
    await ensureCacheDir();

    const tempPrefix = `${videoId}.ytdlp-${Date.now()}`;
    const outTemplate = resolveConfinedCachePath(`${tempPrefix}.%(ext)s`);
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      '--max-filesize',
      '28M',
      '-f',
      'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '-o',
      outTemplate,
      watchUrl,
    ];

    const { cookie } = getEffectiveYouTubeCookie();
    if (cookie) {
      args.splice(args.length - 1, 0, '--add-header', `Cookie:${cookie}`);
    }

    await execFileAsync(binPath, args, {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });

    const entries = await fsp.readdir(cacheRootDir, { withFileTypes: true });
    const downloadedEntry = entries.find(
      (e) => e.isFile() && e.name.startsWith(`${tempPrefix}.`) && !e.name.endsWith('.part'),
    );
    if (!downloadedEntry) {
      throw new Error('yt-dlp ses dosyasını oluşturamadı');
    }

    const rawExt = path.extname(downloadedEntry.name).replace('.', '').toLowerCase() || 'm4a';
    const ext = AUDIO_EXT_MIME[rawExt] ? rawExt : 'm4a';
    const contentType = AUDIO_EXT_MIME[ext] || 'audio/mp4';

    const tempFile = resolveConfinedCachePath(downloadedEntry.name);
    const targetFile = resolveConfinedCachePath(`${videoId}.${ext}`);
    await fsp.rename(tempFile, targetFile);
    const stat = await fsp.stat(targetFile);

    const meta = {
      title: metaHint?.title || 'YouTube Müzik',
      channelTitle: metaHint?.channelTitle || 'YouTube',
      durationSec: metaHint?.durationSec || 0,
      thumbnailUrl: metaHint?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
    await fsp
      .writeFile(resolveConfinedCachePath(`${videoId}.json`), JSON.stringify(meta), 'utf8')
      .catch(() => {});
    void pruneCacheIfNeeded();

    return {
      videoId,
      filePath: targetFile,
      contentType,
      byteLength: stat.size,
      ...meta,
    };
  }

  async function performYouTubeAudioDownload(videoId, metaHint) {
    const existing = await readExistingCachedAudio(videoId);
    if (existing) return existing;

    const hasOAuth = Boolean(loadRuntimeOAuthSync());
    const { cookie } = getEffectiveYouTubeCookie();

    const attempts = [];
    if (cookie) {
      attempts.push(
        { getYt: getCookieInnertube, client: 'WEB', isMobile: false },
        { getYt: getCookieInnertube, client: 'TV_SIMPLY', isMobile: false },
      );
    }
    attempts.push(
      { getYt: getAnonymousInnertube, client: 'VISIONOS', isMobile: true },
      { getYt: getAnonymousInnertube, client: 'IOS', isMobile: true },
      { getYt: getAnonymousInnertube, client: 'TV_SIMPLY', isMobile: false },
    );
    if (hasOAuth) {
      attempts.push({ getYt: () => getOAuthInnertube(), client: 'TV', isMobile: false });
    }

    let lastError = null;
    let sawBotCheck = false;
    const failureNotes = [];

    for (const { getYt, client, isMobile } of attempts) {
      try {
        const yt = await getYt();
        if (!yt) continue;
        const info = await yt.getBasicInfo(videoId, { client });
        const status = info.playability_status?.status;
        const reason = info.playability_status?.reason || '';
        if (status === 'LOGIN_REQUIRED' || /bot|sign in|confirm you/i.test(reason)) {
          sawBotCheck = true;
          failureNotes.push(`${client}:LOGIN_REQUIRED`);
          continue;
        }

        const durationFromInfo = Number(info.basic_info?.duration || 0);
        if (durationFromInfo > 15 * 60) {
          throw new Error('15 dakikadan uzun videolar Soundpad için desteklenmiyor');
        }

        const fmt = pickBestPlayableAudioFormat(info);
        if (!fmt) {
          failureNotes.push(`${client}:NO_PLAYABLE_FORMAT`);
          continue;
        }

        let rawUrl = '';
        try {
          rawUrl = await fmt.decipher(yt.session.player);
        } catch (decErr) {
          if (fmt.url) {
            rawUrl = fmt.url;
          } else {
            throw decErr;
          }
        }
        if (!rawUrl) continue;
        if (info.cpn && !rawUrl.includes('cpn=')) {
          rawUrl += (rawUrl.includes('?') ? '&' : '?') + `cpn=${encodeURIComponent(info.cpn)}`;
        }
        if (!isAllowedGoogleVideoUrl(rawUrl)) continue;

        const mime = (fmt.mime_type || '').toLowerCase();
        const isWebm = mime.includes('webm');
        const ext = isWebm ? 'webm' : 'm4a';
        const contentType = isWebm ? 'audio/webm' : 'audio/mp4';

        const contentLenNum = fmt.content_length ? Number(fmt.content_length) : undefined;
        const audioBuffer = await downloadAudioStreamWithRangeFallback(
          rawUrl,
          Number.isFinite(contentLenNum) ? contentLenNum : undefined,
          getClientUserAgent(client),
          isMobile,
        );
        if (audioBuffer.byteLength < 2048) continue;

        await ensureCacheDir();
        const targetFile = resolveConfinedCachePath(`${videoId}.${ext}`);
        const tempFile = resolveConfinedCachePath(`${videoId}.${ext}.tmp-${Date.now()}`);
        await fsp.writeFile(tempFile, audioBuffer);
        await fsp.rename(tempFile, targetFile);

        const meta = {
          title: metaHint?.title || info.basic_info?.title || 'YouTube Müzik',
          channelTitle: metaHint?.channelTitle || info.basic_info?.author || 'YouTube',
          durationSec: metaHint?.durationSec || durationFromInfo || 0,
          thumbnailUrl:
            metaHint?.thumbnailUrl ||
            info.basic_info?.thumbnail?.[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };

        await fsp
          .writeFile(resolveConfinedCachePath(`${videoId}.json`), JSON.stringify(meta), 'utf8')
          .catch(() => {});
        void pruneCacheIfNeeded();

        return {
          videoId,
          filePath: targetFile,
          contentType,
          byteLength: audioBuffer.byteLength,
          ...meta,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/15 dakikadan uzun/i.test(msg)) throw err;
        failureNotes.push(`${client}:${msg}`);
        lastError = err;
      }
    }

    // Automatic yt-dlp standalone fallback when YouTube enforces SABR-only or PO-token gates
    try {
      return await downloadWithYtDlpFallback(videoId, metaHint);
    } catch (ytDlpErr) {
      const msg = ytDlpErr instanceof Error ? ytDlpErr.message : String(ytDlpErr);
      console.warn(`[Lir YouTube] ${videoId} failed (${failureNotes.join(' | ')}) & yt-dlp: ${msg}`);
      if (sawBotCheck) {
        throw new Error(
          'YouTube bot doğrulaması istedi. Yukarıdaki "YouTube Hesabıyla Giriş Yap" veya "Cookie / cookies.txt" bölümünden oturum bağlayıp tekrar deneyin.',
        );
      }
      throw lastError instanceof Error ? lastError : new Error(msg || 'YouTube ses akışı indirilemedi');
    }
  }

  async function ensureYouTubeAudioCached(videoId, metaHint) {
    if (!isValidYouTubeVideoId(videoId)) {
      throw new Error('Geçersiz YouTube video ID');
    }
    const cached = await readExistingCachedAudio(videoId);
    if (cached) return cached;

    const existingPromise = inFlightDownloads.get(videoId);
    if (existingPromise) return existingPromise;

    const task = performYouTubeAudioDownload(videoId, metaHint).finally(() => {
      inFlightDownloads.delete(videoId);
    });
    inFlightDownloads.set(videoId, task);
    return task;
  }

  function scoreCandidate(candidate, trackName, artistName, targetDurationSec) {
    let score = 0;
    const titleLower = candidate.title.toLowerCase();
    const channelLower = candidate.channelTitle.toLowerCase();
    const queryLower = `${artistName} ${trackName}`.toLowerCase();

    if (titleLower.includes(trackName.toLowerCase())) score += 25;
    if (titleLower.includes(artistName.toLowerCase()) || channelLower.includes(artistName.toLowerCase())) {
      score += 20;
    }
    if (titleLower.includes('official audio') || channelLower.includes('topic')) score += 16;
    if (titleLower.includes('lyrics') || titleLower.includes('audio')) score += 8;
    if (titleLower.includes('1 hour') || titleLower.includes('10 hours') || titleLower.includes('slowed')) {
      if (!queryLower.includes('hour') && !queryLower.includes('slowed')) score -= 60;
    }
    if (targetDurationSec && targetDurationSec > 20 && candidate.durationSec > 0) {
      const diff = Math.abs(candidate.durationSec - targetDurationSec);
      if (diff <= 5) score += 35;
      else if (diff <= 15) score += 20;
      else if (diff <= 35) score += 5;
      else if (diff > 120) score -= 45;
    }
    if (candidate.durationSec > 14 * 60) score -= 100;
    return score;
  }

  async function matchSpotifyTrackToYouTube(params) {
    if (params.videoId && isValidYouTubeVideoId(params.videoId)) {
      const cached = await ensureYouTubeAudioCached(params.videoId, {
        title: params.trackName,
        channelTitle: params.artistName,
        durationSec: params.durationSec,
      });
      return {
        track: {
          videoId: cached.videoId,
          title: cached.title || params.trackName,
          channelTitle: cached.channelTitle || params.artistName || 'YouTube',
          durationSec: cached.durationSec || params.durationSec || 0,
          thumbnailUrl:
            cached.thumbnailUrl || `https://i.ytimg.com/vi/${cached.videoId}/hqdefault.jpg`,
          source: 'youtube-innertube',
        },
        audioUrl: `/api/youtube/audio/${cached.videoId}`,
        contentType: cached.contentType,
        byteLength: cached.byteLength,
      };
    }

    const cleanTrack = params.trackName.trim().slice(0, 120);
    const cleanArtist = params.artistName.trim().slice(0, 120);
    if (!cleanTrack) throw new Error('Şarkı adı gerekli');

    const query = cleanArtist ? `${cleanArtist} ${cleanTrack}` : cleanTrack;
    const candidates = await searchYouTubeTracks(query, 8);
    if (candidates.length === 0) {
      throw new Error('YouTube üzerinde eşleşen parça bulunamadı');
    }

    const ranked = [...candidates].sort(
      (a, b) =>
        scoreCandidate(b, cleanTrack, cleanArtist, params.durationSec) -
        scoreCandidate(a, cleanTrack, cleanArtist, params.durationSec),
    );

    let lastErr = null;
    for (const candidate of ranked.slice(0, 6)) {
      try {
        const cached = await ensureYouTubeAudioCached(candidate.videoId, candidate);
        return {
          track: {
            ...candidate,
            durationSec: cached.durationSec || candidate.durationSec || params.durationSec || 0,
          },
          audioUrl: `/api/youtube/audio/${candidate.videoId}`,
          contentType: cached.contentType,
          byteLength: cached.byteLength,
        };
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error('Eşleşen YouTube videosundan ses alınamadı');
  }

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Spotify endpoints
  app.get('/api/spotify/config', (_req, res) => {
    res.json({
      hasEnvClientId: Boolean(env.SPOTIFY_CLIENT_ID),
      hasEnvClientSecret: Boolean(env.SPOTIFY_CLIENT_SECRET),
      envClientId: env.SPOTIFY_CLIENT_ID || '',
      appRedirectUri: DEFAULT_SPOTIFY_REDIRECT_URI,
    });
  });

  app.post('/api/spotify/auth-url', (req, res) => {
    const body = req.body || {};
    const clientId =
      typeof body.client_id === 'string' && body.client_id.trim()
        ? body.client_id.trim()
        : env.SPOTIFY_CLIENT_ID || '';
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
      res.status(400).json({ error: 'Spotify Client ID eksik' });
      return;
    }
    if (!codeChallenge) {
      res.status(400).json({ error: 'PKCE code challenge eksik' });
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      scope,
    });
    if (state) params.set('state', state);

    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  app.post('/api/spotify/token', async (req, res) => {
    const body = req.body || {};
    const clientId =
      typeof body.client_id === 'string' && body.client_id.trim()
        ? body.client_id.trim()
        : env.SPOTIFY_CLIENT_ID || '';
    const clientSecret =
      typeof body.client_secret === 'string' && body.client_secret.trim()
        ? body.client_secret.trim()
        : env.SPOTIFY_CLIENT_SECRET || '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
    const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier.trim() : '';

    if (!clientId) return res.status(400).json({ error: 'Spotify Client ID eksik' });
    if (!code || !redirectUri) {
      return res.status(400).json({ error: 'OAuth kodu veya Redirect URI eksik' });
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });
    if (codeVerifier) params.set('code_verifier', codeVerifier);

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    try {
      const spotifyRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers,
        body: params.toString(),
      });
      const text = await spotifyRes.text();
      try {
        return res.status(spotifyRes.status).json(JSON.parse(text));
      } catch {
        return res.status(spotifyRes.status).json({ error: text || 'Spotify token yanıtı geçersiz' });
      }
    } catch {
      return res.status(502).json({ error: 'Spotify sunucusuna ulaşılamadı' });
    }
  });

  app.post('/api/spotify/refresh', async (req, res) => {
    const body = req.body || {};
    const clientId =
      typeof body.client_id === 'string' && body.client_id.trim()
        ? body.client_id.trim()
        : env.SPOTIFY_CLIENT_ID || '';
    const clientSecret =
      typeof body.client_secret === 'string' && body.client_secret.trim()
        ? body.client_secret.trim()
        : env.SPOTIFY_CLIENT_SECRET || '';
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';

    if (!clientId) return res.status(400).json({ error: 'Spotify Client ID eksik' });
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token eksik' });

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    try {
      const spotifyRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers,
        body: params.toString(),
      });
      const text = await spotifyRes.text();
      try {
        return res.status(spotifyRes.status).json(JSON.parse(text));
      } catch {
        return res.status(spotifyRes.status).json({ error: text || 'Spotify token yenilenemedi' });
      }
    } catch {
      return res.status(502).json({ error: 'Spotify sunucusuna ulaşılamadı' });
    }
  });

  // YouTube endpoints
  app.get('/api/youtube/config', (_req, res) => {
    res.json(getYouTubeConfig());
  });

  app.post('/api/youtube/auth/start', async (_req, res) => {
    try {
      res.json(await startYouTubeAccountLogin());
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
      res.json(await logoutYouTubeAccount());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'YouTube çıkışı yapılamadı',
      });
    }
  });

  app.post('/api/youtube/cookie', async (req, res) => {
    const rawCookie = typeof req.body?.cookie === 'string' ? req.body.cookie : '';
    try {
      res.json(await setRuntimeYouTubeCookie(rawCookie));
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'YouTube çerezi kaydedilemedi',
      });
    }
  });

  app.delete('/api/youtube/cookie', async (_req, res) => {
    try {
      res.json(await clearRuntimeYouTubeCookie());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'YouTube çerezi silinemedi',
      });
    }
  });

  app.get('/api/youtube/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;
    const limit = Number.isFinite(limitRaw) ? Math.min(15, Math.max(1, limitRaw)) : 10;
    if (!query) return res.json({ tracks: [] });
    try {
      const tracks = await searchYouTubeTracks(query, limit);
      res.json({ tracks });
    } catch (err) {
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
    const body = req.body || {};
    const trackName = typeof body.trackName === 'string' ? body.trackName.trim() : '';
    const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
    const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : undefined;
    const durationSec =
      typeof body.durationSec === 'number' && Number.isFinite(body.durationSec)
        ? body.durationSec
        : undefined;

    if (!trackName && !videoId) {
      return res.status(400).json({ error: 'Şarkı adı veya video ID gerekli' });
    }
    if (videoId && !isValidYouTubeVideoId(videoId)) {
      return res.status(400).json({ error: 'Geçersiz YouTube video ID' });
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
      res.status(502).json({
        error: err instanceof Error ? err.message : 'YouTube üzerinden ses alınamadı',
      });
    }
  });

  app.get('/api/youtube/audio/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!isValidYouTubeVideoId(videoId)) {
      return res.status(400).json({ error: 'Geçersiz YouTube video ID' });
    }
    try {
      const cached = await ensureYouTubeAudioCached(videoId);
      const total = cached.byteLength;
      const rangeHeader = req.headers.range;

      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const normalized = path.resolve(cached.filePath);
      if (!normalized.startsWith(cacheRootDir + path.sep)) {
        throw new Error('Geçersiz ses dosyası yolu');
      }

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
        fs.createReadStream(normalized, { start, end }).pipe(res);
        return;
      }

      res.setHeader('Content-Length', String(total));
      fs.createReadStream(normalized).pipe(res);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'YouTube ses akışı alınamadı',
      });
    }
  });

  httpServer = http.createServer(app);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') {
        serverBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      } else {
        reject(new Error('Yerel API sunucusu portu alınamadı'));
      }
    });
  });

  console.log(`Lir Electron local API listening on ${serverBaseUrl}`);
  return serverBaseUrl;
}

export async function stopLocalApiServer() {
  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
    httpServer = null;
    serverBaseUrl = '';
  }
}
