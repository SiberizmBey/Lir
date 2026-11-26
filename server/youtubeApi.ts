import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { ClientType, Constants, Innertube, Log, Platform } from 'youtubei.js';
import yts from 'yt-search';

const execFileAsync = promisify(execFile);
Log.setLevel(Log.Level.ERROR);

// Provide JS evaluator so Innertube can decipher signature/n-param URLs cleanly
Platform.shim.eval = async (data, evalEnv) => {
  const properties: string[] = [];
  if (evalEnv.n) properties.push(`n: exportedVars.nFunction(${JSON.stringify(evalEnv.n)})`);
  if (evalEnv.sig) properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(evalEnv.sig)})`);
  const code = `${data.output}\nreturn {${properties.join(',')}}`;
  return new Function(code)();
};

export interface YouTubeTrackResult {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumbnailUrl: string;
  source: 'youtube-data-api' | 'youtube-innertube' | 'youtube-search';
}

export interface CachedYouTubeAudio {
  videoId: string;
  filePath: string;
  contentType: string;
  byteLength: number;
  title?: string;
  channelTitle?: string;
  durationSec?: number;
  thumbnailUrl?: string;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const CACHE_BASE_DIR = path.resolve(process.cwd(), '.lir-cache');
const CACHE_ROOT_DIR = path.resolve(CACHE_BASE_DIR, 'youtube-audio');
const RUNTIME_COOKIE_FILE = path.resolve(CACHE_BASE_DIR, 'youtube-cookie.txt');
const RUNTIME_OAUTH_FILE = path.resolve(CACHE_BASE_DIR, 'youtube-oauth.json');
const MAX_AUDIO_BYTES = 28 * 1024 * 1024; // 28 MB hard safety cap per track
const MAX_CACHED_FILES = 60;
const MAX_COOKIE_INPUT_BYTES = 48 * 1024;
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

export interface StoredYouTubeOAuthTokens {
  access_token: string;
  expiry_date: string;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  client?: {
    client_id: string;
    client_secret: string;
  };
}

export type YouTubeAuthStatus = 'idle' | 'pending' | 'connected' | 'error';

interface PendingAuthState {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
}

let anonymousInnertubePromise: Promise<Innertube> | null = null;
let cookieInnertubePromise: Promise<Innertube> | null = null;
let oauthInnertubePromise: Promise<Innertube> | null = null;
let runtimeCookieLoaded = false;
let runtimeCookieValue = '';
let runtimeOAuthLoaded = false;
let runtimeOAuthTokens: StoredYouTubeOAuthTokens | null = null;
let authState: {
  status: YouTubeAuthStatus;
  pendingAuth: PendingAuthState | null;
  error: string | null;
} = {
  status: 'idle',
  pendingAuth: null,
  error: null,
};
let activeLoginAbort: AbortController | null = null;
const inFlightDownloads = new Map<string, Promise<CachedYouTubeAudio>>();

function loadRuntimeCookieSync(): string {
  if (runtimeCookieLoaded) return runtimeCookieValue;
  runtimeCookieLoaded = true;
  try {
    if (fs.existsSync(RUNTIME_COOKIE_FILE)) {
      const content = fs.readFileSync(RUNTIME_COOKIE_FILE, 'utf8').trim();
      runtimeCookieValue = content;
    }
  } catch {
    runtimeCookieValue = '';
  }
  return runtimeCookieValue;
}

function loadRuntimeOAuthSync(): StoredYouTubeOAuthTokens | null {
  if (runtimeOAuthLoaded) return runtimeOAuthTokens;
  runtimeOAuthLoaded = true;
  try {
    if (fs.existsSync(RUNTIME_OAUTH_FILE)) {
      const raw = fs.readFileSync(RUNTIME_OAUTH_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredYouTubeOAuthTokens>;
      if (parsed?.access_token && parsed?.refresh_token && parsed?.expiry_date) {
        runtimeOAuthTokens = parsed as StoredYouTubeOAuthTokens;
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

async function persistRuntimeOAuth(tokens: StoredYouTubeOAuthTokens): Promise<void> {
  runtimeOAuthTokens = tokens;
  runtimeOAuthLoaded = true;
  await fsp.mkdir(CACHE_BASE_DIR, { recursive: true });
  await fsp.writeFile(RUNTIME_OAUTH_FILE, JSON.stringify(tokens), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function deleteRuntimeOAuth(): Promise<void> {
  runtimeOAuthTokens = null;
  runtimeOAuthLoaded = true;
  await fsp.unlink(RUNTIME_OAUTH_FILE).catch(() => {});
}

function getEffectiveYouTubeCookie(): { cookie: string; source: 'env' | 'runtime' | 'none' } {
  const runtime = loadRuntimeCookieSync();
  if (runtime) return { cookie: runtime, source: 'runtime' };
  const envCookie = env.YOUTUBE_COOKIE?.trim() || '';
  if (envCookie) return { cookie: envCookie, source: 'env' };
  return { cookie: '', source: 'none' };
}

export function isValidYouTubeVideoId(videoId: unknown): videoId is string {
  return typeof videoId === 'string' && YOUTUBE_ID_REGEX.test(videoId.trim());
}

export function getYouTubeConfig() {
  const { cookie, source } = getEffectiveYouTubeCookie();
  const oauth = loadRuntimeOAuthSync();
  const resolvedAuthStatus: YouTubeAuthStatus =
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

function sanitizeCookiePair(name: string, value: string): string | null {
  const cleanName = name.replace(/[\r\n\0;\s]/g, '').trim();
  const cleanVal = value.replace(/[\r\n\0;]/g, '').trim();
  if (!cleanName || !cleanVal) return null;
  if (/[\u0000-\u001f\u007f]/.test(cleanName) || /[\u0000-\u001f\u007f]/.test(cleanVal)) {
    return null;
  }
  return `${cleanName}=${cleanVal}`;
}

export function parseAndSanitizeYouTubeCookie(rawInput: string): {
  header: string;
  cookieCount: number;
} {
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

  const pairs = new Map<string, string>();

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
        const eqIdx = pair.indexOf('=');
        pairs.set(pair.slice(0, eqIdx), pair);
      }
    }
  } else {
    const withoutPrefix = trimmed.replace(/^cookie\s*:\s*/i, '');
    const rawParts = withoutPrefix.split(';');
    for (const part of rawParts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = part.slice(0, eqIdx);
      const val = part.slice(eqIdx + 1);
      const pair = sanitizeCookiePair(name, val);
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

export async function setRuntimeYouTubeCookie(rawInput: string) {
  const { header, cookieCount } = parseAndSanitizeYouTubeCookie(rawInput);
  await fsp.mkdir(CACHE_BASE_DIR, { recursive: true });
  await fsp.writeFile(RUNTIME_COOKIE_FILE, header, { encoding: 'utf8', mode: 0o600 });
  runtimeCookieValue = header;
  runtimeCookieLoaded = true;
  cookieInnertubePromise = null;
  return {
    ...getYouTubeConfig(),
    cookieCount,
  };
}

export async function clearRuntimeYouTubeCookie() {
  runtimeCookieValue = '';
  runtimeCookieLoaded = true;
  cookieInnertubePromise = null;
  await fsp.unlink(RUNTIME_COOKIE_FILE).catch(() => {});
  return getYouTubeConfig();
}

async function getAnonymousInnertube(): Promise<Innertube> {
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

async function getCookieInnertube(): Promise<Innertube | null> {
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

async function getOAuthInnertube(allowAnonymous = false): Promise<Innertube> {
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
          console.warn('Stored YouTube OAuth session invalid/expired:', err);
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

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
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

export async function startYouTubeAccountLogin() {
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
  const pendingAuth: PendingAuthState = {
    userCode: deviceCodeData.user_code,
    verificationUrl: deviceCodeData.verification_url || 'https://www.google.com/device',
    expiresAt,
  };

  authState = {
    status: 'pending',
    pendingAuth,
    error: null,
  };

  let pollIntervalMs = Math.max(5, Number(deviceCodeData.interval || 5)) * 1000;
  const tokenUrl = yt.session.oauth.AUTH_SERVER_TOKEN_URL.toString();

  // Controlled background poll loop until confirmed, denied, expired, or cancelled
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

        const data = (await tokenRes.json().catch(() => ({}))) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
          token_type?: string;
          error?: string;
        };

        if (data.error) {
          if (data.error === 'authorization_pending') {
            continue;
          }
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
          const tokens: StoredYouTubeOAuthTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expiry_date: new Date(Date.now() + Number(data.expires_in || 3600) * 1000).toISOString(),
            scope: data.scope,
            token_type: data.token_type,
            client: clientId,
          };
          await persistRuntimeOAuth(tokens);
          oauthInnertubePromise = null;
          authState = {
            status: 'connected',
            pendingAuth: null,
            error: null,
          };
          // Warm up signed-in Innertube instance immediately
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

export function cancelYouTubeAccountLogin() {
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

export async function logoutYouTubeAccount() {
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
    // ignore signOut errors
  }
  await deleteRuntimeOAuth();
  oauthInnertubePromise = null;
  authState = {
    status: 'idle',
    pendingAuth: null,
    error: null,
  };
  return getYouTubeConfig();
}

function parseIsoDurationToSeconds(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso.trim());
  if (!match) return 0;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function isAllowedGoogleVideoUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
  } catch {
    return false;
  }
}

function resolveConfinedCachePath(fileName: string): string {
  const target = path.resolve(CACHE_ROOT_DIR, fileName);
  if (!target.startsWith(CACHE_ROOT_DIR + path.sep)) {
    throw new Error('Geçersiz önbellek dosya yolu');
  }
  return target;
}

async function ensureCacheDir() {
  await fsp.mkdir(CACHE_ROOT_DIR, { recursive: true });
}

const AUDIO_EXT_MIME: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
};

async function pruneCacheIfNeeded() {
  try {
    const entries = await fsp.readdir(CACHE_ROOT_DIR, { withFileTypes: true });
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
    const excess = withStats.slice(0, withStats.length - MAX_CACHED_FILES);
    for (const item of excess) {
      const id = item.name.replace(/\.(m4a|mp4|webm|opus|ogg|mp3)$/i, '');
      await fsp.unlink(item.full).catch(() => {});
      await fsp.unlink(resolveConfinedCachePath(`${id}.json`)).catch(() => {});
    }
  } catch {
    // Non-fatal cache pruning
  }
}

async function searchViaYouTubeDataApi(
  query: string,
  limit: number,
): Promise<YouTubeTrackResult[] | null> {
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10', // Music category preference
      maxResults: String(Math.min(15, Math.max(1, limit))),
      q: query,
      key: apiKey,
    });

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
    );
    if (!searchRes.ok) {
      console.warn(`YouTube Data API v3 search status: ${searchRes.status}`);
      return null;
    }

    const searchData = (await searchRes.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };

    const rawItems = (searchData.items || []).filter((item) =>
      isValidYouTubeVideoId(item.id?.videoId),
    );
    if (rawItems.length === 0) return [];

    const ids = rawItems.map((i) => i.id!.videoId!).join(',');
    const detailsParams = new URLSearchParams({
      part: 'contentDetails,snippet',
      id: ids,
      key: apiKey,
    });

    const durationMap = new Map<string, number>();
    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detailsParams.toString()}`,
    );
    if (detailsRes.ok) {
      const detailsData = (await detailsRes.json()) as {
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
        }>;
      };
      for (const vid of detailsData.items || []) {
        if (vid.id && vid.contentDetails?.duration) {
          durationMap.set(vid.id, parseIsoDurationToSeconds(vid.contentDetails.duration));
        }
      }
    }

    return rawItems.map((item) => {
      const videoId = item.id!.videoId!;
      const thumb =
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return {
        videoId,
        title: item.snippet?.title || 'YouTube Müzik',
        channelTitle: item.snippet?.channelTitle || 'YouTube',
        durationSec: durationMap.get(videoId) || 0,
        thumbnailUrl: thumb,
        source: 'youtube-data-api',
      };
    });
  } catch (err) {
    console.warn('YouTube Data API v3 fallback:', err);
    return null;
  }
}

export async function searchYouTubeTracks(
  rawQuery: string,
  limit: number = 10,
): Promise<YouTubeTrackResult[]> {
  const query = rawQuery.trim().slice(0, 160);
  if (!query) return [];

  const clampedLimit = Math.min(15, Math.max(1, limit));

  // 1. Official YouTube Data API v3 (when YOUTUBE_API_KEY is configured)
  const official = await searchViaYouTubeDataApi(query, clampedLimit);
  if (official && official.length > 0) {
    return official;
  }

  // 2. Innertube pure-JS search fallback (clean anonymous instance avoids TV OAuth 400 on WEB search)
  try {
    const yt = await getAnonymousInnertube();
    const res = await yt.search(query, { type: 'video' });
    const videos = (res.videos || []).slice(0, clampedLimit);
    const mapped: YouTubeTrackResult[] = [];

    for (const entry of videos) {
      const item = entry as unknown as {
        id?: string;
        title?: { text?: string; toString?: () => string };
        author?: { name?: string };
        duration?: { seconds?: number };
        thumbnails?: Array<{ url?: string }>;
      };
      if (!isValidYouTubeVideoId(item.id)) continue;
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

    if (mapped.length > 0) {
      return mapped;
    }
  } catch (err) {
    console.warn('Innertube search error, trying yt-search:', err);
  }

  // 3. yt-search final fallback
  try {
    const fallback = await yts(query);
    return (fallback.videos || [])
      .filter((v): v is { videoId: string; title: string; author?: { name?: string }; seconds?: number; thumbnail?: string } =>
        isValidYouTubeVideoId(v.videoId),
      )
      .slice(0, clampedLimit)
      .map((v) => ({
        videoId: v.videoId,
        title: v.title || 'YouTube Müzik',
        channelTitle: v.author?.name || 'YouTube',
        durationSec: Number(v.seconds || 0),
        thumbnailUrl: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        source: 'youtube-search' as const,
      }));
  } catch (err) {
    console.warn('yt-search fallback failed:', err);
    return [];
  }
}

async function readExistingCachedAudio(videoId: string): Promise<CachedYouTubeAudio | null> {
  await ensureCacheDir();
  for (const ext of Object.keys(AUDIO_EXT_MIME)) {
    const audioPath = resolveConfinedCachePath(`${videoId}.${ext}`);
    try {
      const stat = await fsp.stat(audioPath);
      if (stat.isFile() && stat.size > 1024) {
        let meta: {
          title?: string;
          channelTitle?: string;
          durationSec?: number;
          thumbnailUrl?: string;
        } = {};
        try {
          const rawMeta = await fsp.readFile(resolveConfinedCachePath(`${videoId}.json`), 'utf8');
          meta = JSON.parse(rawMeta);
        } catch {
          // metadata sidecar optional
        }
        return {
          videoId,
          filePath: audioPath,
          contentType: AUDIO_EXT_MIME[ext] || 'audio/mp4',
          byteLength: stat.size,
          ...meta,
        };
      }
    } catch {
      // not cached under this extension
    }
  }
  return null;
}

type InnertubeClientName = 'TV' | 'TV_SIMPLY' | 'IOS' | 'ANDROID_VR' | 'VISIONOS' | 'WEB';

function getClientUserAgent(client: InnertubeClientName): string | undefined {
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

function pickBestPlayableAudioFormat(info: Awaited<ReturnType<Innertube['getBasicInfo']>>) {
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
  streamUrl: string,
  expectedLength: number | undefined,
  clientUserAgent?: string,
  isMobileClient = false,
): Promise<Buffer> {
  if (!isAllowedGoogleVideoUrl(streamUrl)) {
    throw new Error('Güvenlik doğrulaması: Geçersiz ses akışı adresi');
  }

  if (expectedLength && expectedLength > MAX_AUDIO_BYTES) {
    throw new Error('Ses dosyası 28 MB güvenlik sınırını aşıyor');
  }

  const baseHeaders: Record<string, string> = isMobileClient
    ? {
        Accept: '*/*',
        ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
      }
    : {
        ...Constants.STREAM_HEADERS,
        ...(clientUserAgent ? { 'User-Agent': clientUserAgent } : {}),
      };

  // If we know Content-Length, download cleanly in 2 MB range chunks so GoogleVideo does not throttle
  if (expectedLength && expectedLength > CHUNK_SIZE_BYTES) {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < expectedLength) {
      const end = Math.min(expectedLength - 1, offset + CHUNK_SIZE_BYTES - 1);
      const sep = streamUrl.includes('?') ? '&' : '?';
      const chunkUrl = isMobileClient ? `${streamUrl}${sep}range=${offset}-${end}` : streamUrl;
      const headers = isMobileClient ? baseHeaders : { ...baseHeaders, Range: `bytes=${offset}-${end}` };
      const res = await fetch(chunkUrl, { headers });
      if (!res.ok) {
        throw new Error(`Ses akışı indirilemedi (HTTP ${res.status})`);
      }
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      if (buf.byteLength === 0) break;
      chunks.push(buf);
      offset += buf.byteLength;

      if (offset > MAX_AUDIO_BYTES) {
        throw new Error('Ses dosyası 28 MB sınırını aştı');
      }
    }

    return Buffer.concat(chunks);
  }

  // Single request stream with hard byte limit
  const res = await fetch(streamUrl, { headers: baseHeaders });
  if (!res.ok || !res.body) {
    throw new Error(`Ses akışı indirilemedi (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const parts: Buffer[] = [];
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

async function trySystemYtDlpFallback(
  videoId: string,
  metaHint?: Partial<YouTubeTrackResult>,
): Promise<CachedYouTubeAudio | null> {
  const systemCmd = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  try {
    await execFileAsync(systemCmd, ['--version'], { timeout: 3000, windowsHide: true });
  } catch {
    return null;
  }

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

  await execFileAsync(systemCmd, args, {
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });

  const entries = await fsp.readdir(CACHE_ROOT_DIR, { withFileTypes: true });
  const downloadedEntry = entries.find(
    (e) => e.isFile() && e.name.startsWith(`${tempPrefix}.`) && !e.name.endsWith('.part'),
  );
  if (!downloadedEntry) return null;

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

async function performYouTubeAudioDownload(
  videoId: string,
  metaHint?: Partial<YouTubeTrackResult>,
): Promise<CachedYouTubeAudio> {
  const existing = await readExistingCachedAudio(videoId);
  if (existing) return existing;

  const hasOAuth = Boolean(loadRuntimeOAuthSync());
  const { cookie } = getEffectiveYouTubeCookie();

  type DownloadAttempt = {
    getYt: () => Promise<Innertube | null>;
    client: InnertubeClientName;
    isMobile: boolean;
  };

  const attempts: DownloadAttempt[] = [];
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

  let lastError: unknown = null;
  let sawBotCheck = false;

  for (const { getYt, client, isMobile } of attempts) {
    try {
      const yt = await getYt();
      if (!yt) continue;
      const info = await yt.getBasicInfo(videoId, { client });
      const status = info.playability_status?.status;
      const reason = info.playability_status?.reason || '';
      if (
        status === 'LOGIN_REQUIRED' ||
        /bot|sign in|confirm you/i.test(reason)
      ) {
        sawBotCheck = true;
        continue;
      }

      const durationFromInfo = Number(info.basic_info?.duration || 0);
      if (durationFromInfo > 15 * 60) {
        throw new Error('15 dakikadan uzun videolar Soundpad için desteklenmiyor');
      }

      const fmt = pickBestPlayableAudioFormat(info);
      if (!fmt) {
        lastError = new Error(`${client}: Oynatılabilir ses formatı bulunamadı`);
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
      if (!isAllowedGoogleVideoUrl(rawUrl)) {
        continue;
      }

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

      if (audioBuffer.byteLength < 2048) {
        continue;
      }

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
      lastError = err;
    }
  }

  try {
    const ytDlpRes = await trySystemYtDlpFallback(videoId, metaHint);
    if (ytDlpRes) return ytDlpRes;
  } catch {
    // ignore optional server yt-dlp fallback failure
  }

  if (sawBotCheck) {
    throw new Error(
      'YouTube bu sunucu IP adresinden bot doğrulaması istedi. Yukarıdaki "YouTube Hesabıyla Giriş Yap" veya "Cookie / cookies.txt" bölümünden oturum bağlayıp tekrar deneyin.',
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('YouTube ses akışı indirilemedi');
}

export async function ensureYouTubeAudioCached(
  videoId: string,
  metaHint?: Partial<YouTubeTrackResult>,
): Promise<CachedYouTubeAudio> {
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

function scoreCandidate(
  candidate: YouTubeTrackResult,
  trackName: string,
  artistName: string,
  targetDurationSec?: number,
): number {
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
  if ((titleLower.includes('live') || titleLower.includes('cover')) && !queryLower.includes('live') && !queryLower.includes('cover')) {
    score -= 18;
  }

  if (targetDurationSec && targetDurationSec > 20 && candidate.durationSec > 0) {
    const diff = Math.abs(candidate.durationSec - targetDurationSec);
    if (diff <= 5) score += 35;
    else if (diff <= 15) score += 20;
    else if (diff <= 35) score += 5;
    else if (diff > 120) score -= 45;
  }

  if (candidate.durationSec > 14 * 60) score -= 100;
  if (candidate.durationSec > 0 && candidate.durationSec < 25 && (targetDurationSec || 0) > 60) {
    score -= 50;
  }

  return score;
}

export async function matchSpotifyTrackToYouTube(params: {
  trackName: string;
  artistName: string;
  durationSec?: number;
  videoId?: string;
}): Promise<{
  track: YouTubeTrackResult;
  audioUrl: string;
  contentType: string;
  byteLength: number;
}> {
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
        source: env.YOUTUBE_API_KEY?.trim() ? 'youtube-data-api' : 'youtube-innertube',
      },
      audioUrl: `/api/youtube/audio/${cached.videoId}`,
      contentType: cached.contentType,
      byteLength: cached.byteLength,
    };
  }

  const cleanTrack = params.trackName.trim().slice(0, 120);
  const cleanArtist = params.artistName.trim().slice(0, 120);
  if (!cleanTrack) {
    throw new Error('Şarkı adı gerekli');
  }

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

  // Try top 6 ranked candidates in case earlier ones are age-restricted or bot-gated
  let lastErr: unknown = null;
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

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Eşleşen YouTube videosundan ses alınamadı');
}

export interface CachedYouTubeTrackInfo {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumbnailUrl: string;
  audioUrl: string;
  contentType: string;
  byteLength: number;
  cachedAt: number;
}

export async function listCachedYouTubeTracks(): Promise<CachedYouTubeTrackInfo[]> {
  await ensureCacheDir();
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(CACHE_ROOT_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const tracksById = new Map<string, CachedYouTubeTrackInfo>();
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

      let meta: Partial<CachedYouTubeAudio> = {};
      try {
        const rawMeta = await fsp.readFile(resolveConfinedCachePath(`${videoId}.json`), 'utf8');
        meta = JSON.parse(rawMeta) as Partial<CachedYouTubeAudio>;
      } catch {
        // ignore missing metadata
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

export function createAudioReadStream(
  filePath: string,
  start?: number,
  end?: number,
): fs.ReadStream {
  const normalized = path.resolve(filePath);
  if (!normalized.startsWith(CACHE_ROOT_DIR + path.sep)) {
    throw new Error('Güvenlik doğrulaması: Geçersiz ses dosyası yolu');
  }
  return fs.createReadStream(normalized, start !== undefined ? { start, end } : undefined);
}
