import { getApiUrl } from './apiBase';

export interface YouTubeTrack {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumbnailUrl: string;
  source: 'youtube-data-api' | 'youtube-innertube' | 'youtube-search';
}

export type YouTubeAuthStatus = 'idle' | 'pending' | 'connected' | 'error';

export interface YouTubePendingAuth {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
}

export interface YouTubeConfig {
  hasApiKey: boolean;
  hasCookie: boolean;
  cookieSource: 'env' | 'runtime' | 'none';
  cookieCount?: number;
  hasOAuth: boolean;
  authStatus: YouTubeAuthStatus;
  pendingAuth: YouTubePendingAuth | null;
  authError: string | null;
}

export interface YouTubeMatchResponse {
  track: YouTubeTrack;
  audioUrl: string;
  contentType: string;
  byteLength: number;
}

export interface CachedYouTubeTrack {
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

const DEFAULT_YT_CONFIG: YouTubeConfig = {
  hasApiKey: false,
  hasCookie: false,
  cookieSource: 'none',
  hasOAuth: false,
  authStatus: 'idle',
  pendingAuth: null,
  authError: null,
};

function normalizeYouTubeConfig(data: Partial<YouTubeConfig> | null | undefined): YouTubeConfig {
  if (!data) return { ...DEFAULT_YT_CONFIG };
  return {
    hasApiKey: Boolean(data.hasApiKey),
    hasCookie: Boolean(data.hasCookie),
    cookieSource: data.cookieSource || 'none',
    cookieCount: data.cookieCount,
    hasOAuth: Boolean(data.hasOAuth),
    authStatus: data.authStatus || (data.hasOAuth ? 'connected' : 'idle'),
    pendingAuth: data.pendingAuth || null,
    authError: data.authError || null,
  };
}

export async function getYouTubeConfig(): Promise<YouTubeConfig> {
  try {
    const res = await fetch(getApiUrl('/api/youtube/config'));
    if (!res.ok) return { ...DEFAULT_YT_CONFIG };
    const data = (await res.json()) as Partial<YouTubeConfig>;
    return normalizeYouTubeConfig(data);
  } catch {
    return { ...DEFAULT_YT_CONFIG };
  }
}

export async function startYouTubeLogin(): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/auth/start'), { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'YouTube giriş başlatılamadı');
  }
  return normalizeYouTubeConfig(data);
}

export async function getYouTubeAuthStatus(): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/auth/status'));
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig>;
  if (!res.ok) return { ...DEFAULT_YT_CONFIG };
  return normalizeYouTubeConfig(data);
}

export async function cancelYouTubeLogin(): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/auth/cancel'), { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig>;
  return normalizeYouTubeConfig(data);
}

export async function logoutYouTubeAccount(): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/auth/logout'), { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'YouTube oturumu kapatılamadı');
  }
  return normalizeYouTubeConfig(data);
}

export async function saveYouTubeCookie(cookie: string): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/cookie'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'YouTube çerezi kaydedilemedi');
  }
  return normalizeYouTubeConfig(data);
}

export async function clearYouTubeCookie(): Promise<YouTubeConfig> {
  const res = await fetch(getApiUrl('/api/youtube/cookie'), { method: 'DELETE' });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeConfig> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'YouTube çerezi kaldırılamadı');
  }
  return normalizeYouTubeConfig(data);
}

export async function searchYouTubeTracks(query: string, limit = 12): Promise<YouTubeTrack[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    getApiUrl(`/api/youtube/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`),
  );
  const data = (await res.json().catch(() => ({}))) as {
    tracks?: YouTubeTrack[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'YouTube araması başarısız oldu');
  }
  return data.tracks || [];
}

export async function matchAndFetchYouTubeAudio(params: {
  trackName: string;
  artistName: string;
  durationSec?: number;
  videoId?: string;
}): Promise<YouTubeMatchResponse> {
  const res = await fetch(getApiUrl('/api/youtube/match'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<YouTubeMatchResponse> & {
    error?: string;
  };
  if (!res.ok || !data.audioUrl || !data.track) {
    throw new Error(data.error || 'YouTube üzerinden ses çekilemedi');
  }
  return data as YouTubeMatchResponse;
}

export async function listCachedYouTubeTracks(): Promise<CachedYouTubeTrack[]> {
  try {
    const res = await fetch(getApiUrl('/api/youtube/cached'));
    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as {
      tracks?: CachedYouTubeTrack[];
    };
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch {
    return [];
  }
}
