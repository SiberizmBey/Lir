import { getApiUrl } from './apiBase';
import { getPersistentItem, setPersistentItem } from './persistentStore';

export interface SpotifyUser {
  id?: string;
  display_name?: string;
  email?: string;
  images?: Array<{ url: string }>;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  preview_url?: string | null;
  duration_ms?: number;
  artists?: Array<{ name: string }>;
  album?: {
    name?: string;
    images?: Array<{ url: string }>;
  };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  images?: Array<{ url: string }>;
  tracks?: { total: number };
  items?: { total: number };
  owner?: { display_name?: string };
}

export interface SpotifyAuthState {
  isConnected: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  user: SpotifyUser | null;
  clientId: string;
  hasEnvClientId: boolean;
  hasEnvClientSecret: boolean;
  redirectUri: string;
  error: string | null;
}

const STORAGE_KEY_SPOTIFY = 'lir_spotify_auth_v2';
const VERIFIER_STORAGE_KEY = 'lir_spotify_code_verifier';
const STATE_STORAGE_KEY = 'lir_spotify_oauth_state';
export const DEFAULT_SPOTIFY_REDIRECT_URI = 'https://lir.anticvalley.com.tr/auth/callback';

function computeDefaultRedirectUri(): string {
  return DEFAULT_SPOTIFY_REDIRECT_URI;
}

async function readJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${endpoint} boş yanıt verdi (HTTP ${response.status}).`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const isHtml = /<\/?(?:!doctype|html)\b/i.test(text);
    throw new Error(
      isHtml
        ? `${endpoint} JSON yerine HTML döndürdü (HTTP ${response.status}).`
        : `${endpoint} geçersiz JSON yanıtı verdi (HTTP ${response.status}).`,
    );
  }
}

const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

class SpotifyService {
  private state: SpotifyAuthState = {
    isConnected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    clientId: '',
    hasEnvClientId: false,
    hasEnvClientSecret: false,
    redirectUri: computeDefaultRedirectUri(),
    error: null,
  };

  private listeners: Set<(state: SpotifyAuthState) => void> = new Set();
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.loadState();
    this.initMessageListener();
    void this.initializeSession();
  }

  private async initializeSession() {
    await this.fetchEnvConfig();
    if (this.state.accessToken || this.state.refreshToken) {
      await this.refreshUserData();
    }
  }

  private loadState() {
    try {
      const saved =
        getPersistentItem(STORAGE_KEY_SPOTIFY) ||
        getPersistentItem('lir_spotify_auth_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SpotifyAuthState> & {
          customRedirectUri?: boolean;
        };
        const defaultRedirect = computeDefaultRedirectUri();
        const savedRedirect = parsed.redirectUri?.trim();
        const loadedRedirect =
          savedRedirect &&
          (!savedRedirect.includes('.run.app') || parsed.customRedirectUri)
            ? savedRedirect
            : defaultRedirect;

        this.state = {
          ...this.state,
          isConnected: Boolean(parsed.accessToken || parsed.refreshToken),
          accessToken: parsed.accessToken || null,
          refreshToken: parsed.refreshToken || null,
          expiresAt: parsed.expiresAt || null,
          user: parsed.user || null,
          clientId: parsed.clientId || '',
          redirectUri: loadedRedirect,
          error: null,
        };
      }
    } catch (e) {
      console.warn('Failed to load Spotify state:', e);
    }
  }

  public async fetchEnvConfig() {
    try {
      const res = await fetch(this.getApiUrl('/api/spotify/config'));
      if (res.ok) {
        const data = (await res.json()) as {
          hasEnvClientId?: boolean;
          hasEnvClientSecret?: boolean;
          envClientId?: string;
          appRedirectUri?: string;
        };
        const nextHasEnvId = Boolean(data.hasEnvClientId);
        const nextHasEnvSecret = Boolean(data.hasEnvClientSecret);
        const nextClientId = this.state.clientId || data.envClientId || '';
        const nextRedirectUri =
          this.state.redirectUri || data.appRedirectUri || computeDefaultRedirectUri();
        if (
          nextHasEnvId !== this.state.hasEnvClientId ||
          nextHasEnvSecret !== this.state.hasEnvClientSecret ||
          nextClientId !== this.state.clientId ||
          nextRedirectUri !== this.state.redirectUri
        ) {
          this.updateState({
            hasEnvClientId: nextHasEnvId,
            hasEnvClientSecret: nextHasEnvSecret,
            clientId: nextClientId,
            redirectUri: nextRedirectUri,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private saveState() {
    try {
      const {
        isConnected,
        accessToken,
        refreshToken,
        expiresAt,
        user,
        clientId,
        redirectUri,
      } = this.state;
      setPersistentItem(
        STORAGE_KEY_SPOTIFY,
        JSON.stringify({
          isConnected: Boolean(isConnected && (accessToken || refreshToken)),
          accessToken,
          refreshToken,
          expiresAt,
          user,
          clientId,
          redirectUri,
          customRedirectUri: Boolean(
            redirectUri && redirectUri !== DEFAULT_SPOTIFY_REDIRECT_URI,
          ),
        }),
      );
    } catch (e) {
      console.warn('Failed to save Spotify state:', e);
    }
  }

  public getState(): SpotifyAuthState {
    return { ...this.state };
  }

  public subscribe(listener: (state: SpotifyAuthState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  public updateState(partial: Partial<SpotifyAuthState>) {
    this.state = { ...this.state, ...partial };
    this.saveState();
    this.notify();
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(digest);
  }

  private generateRandomString(length: number): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], '');
  }

  public getRedirectUri(): string {
    if (this.state.redirectUri?.trim()) {
      return this.state.redirectUri.trim();
    }
    return computeDefaultRedirectUri();
  }

  private getApiUrl(path: string): string {
    return getApiUrl(path);
  }

  public async initiateLogin(): Promise<void> {
    const effectiveClientId = this.state.clientId?.trim();
    if (!effectiveClientId && !this.state.hasEnvClientId) {
      throw new Error(
        'Spotify Client ID gerekli. Spotify Developer Dashboard üzerinden oluşturduğunuz Client ID değerini girin veya sunucuda SPOTIFY_CLIENT_ID tanımlayın.',
      );
    }

    this.updateState({ error: null });
    const redirectUri = this.getRedirectUri();
    const verifier = this.generateRandomString(64);
    const state = this.generateRandomString(24);
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(STATE_STORAGE_KEY, state);

    const challenge = await this.generateCodeChallenge(verifier);

    let authorizeUrl = '';
    if (effectiveClientId) {
      const params = new URLSearchParams({
        client_id: effectiveClientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
        scope: SPOTIFY_SCOPES,
      });
      authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    } else {
      const urlRes = await fetch(this.getApiUrl('/api/spotify/auth-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uri: redirectUri,
          code_challenge: challenge,
          state,
          scope: SPOTIFY_SCOPES,
        }),
      });

      const urlPayload = await readJsonResponse<{ url?: string; error?: string }>(
        urlRes,
        'Spotify OAuth URL API',
      );

      if (!urlRes.ok || !urlPayload.url) {
        throw new Error(urlPayload.error || 'Spotify yetkilendirme adresi oluşturulamadı');
      }
      authorizeUrl = urlPayload.url;
    }

    const popup = window.open(
      authorizeUrl,
      'spotify_oauth_popup',
      'width=580,height=740,menubar=no,toolbar=no,location=no,status=no',
    );

    if (!popup) {
      throw new Error(
        'Tarayıcı açılır pencereyi engelledi. Lütfen bu sayfa için pop-up izni verin.',
      );
    }
  }

  private initMessageListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', async (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        !origin.includes('127.0.0.1') &&
        !origin.includes('anticvalley.com.tr') &&
        origin !== window.location.origin
      ) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const expectedState = sessionStorage.getItem(STATE_STORAGE_KEY);
        const incomingState = typeof event.data.state === 'string' ? event.data.state : '';
        if (expectedState && incomingState && expectedState !== incomingState) {
          this.updateState({ error: 'OAuth güvenlik doğrulaması (state) eşleşmedi.' });
          return;
        }
        const code = event.data.code;
        if (code) {
          await this.handleAuthCallback(code);
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        this.updateState({
          error: event.data.error || 'Spotify yetkilendirmesi iptal edildi veya başarısız oldu',
        });
      }
    });
  }

  private async handleAuthCallback(code: string) {
    const codeVerifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY) || undefined;
    const redirectUri = this.getRedirectUri();
    const clientId = this.state.clientId?.trim() || undefined;

    try {
      const res = await fetch(this.getApiUrl('/api/spotify/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      });

      const data = await readJsonResponse<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      }>(res, 'Spotify token API');

      if (!res.ok) {
        throw new Error(data.error_description || data.error || 'Token alınamadı');
      }
      if (!data.access_token) {
        throw new Error('Spotify token API erişim anahtarı döndürmedi.');
      }

      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      this.updateState({
        isConnected: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.state.refreshToken,
        expiresAt,
        error: null,
      });

      await this.refreshUserData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateState({ error: msg });
    }
  }

  public async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.state.refreshToken) {
      this.updateState({ isConnected: false, accessToken: null });
      return null;
    }

    const task = (async (): Promise<string | null> => {
      try {
        const res = await fetch(this.getApiUrl('/api/spotify/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refresh_token: this.state.refreshToken,
            client_id: this.state.clientId?.trim() || undefined,
          }),
        });

        const data = await readJsonResponse<{
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        }>(res, 'Spotify token yenileme API');

        if (!res.ok || !data.access_token) {
          const oauthErr = (data.error || '').toLowerCase();
          const isPermanentRevocation =
            res.status === 400 &&
            (oauthErr === 'invalid_grant' ||
              oauthErr === 'invalid_client' ||
              oauthErr === 'unauthorized_client');

          if (isPermanentRevocation) {
            this.updateState({
              isConnected: false,
              accessToken: null,
              refreshToken: null,
              expiresAt: null,
              user: null,
              error: data.error_description || 'Spotify oturumu sona erdi, lütfen tekrar bağlanın.',
            });
          }
          return null;
        }

        const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        const newToken = data.access_token;
        this.updateState({
          isConnected: true,
          accessToken: newToken,
          refreshToken: data.refresh_token || this.state.refreshToken,
          expiresAt,
          error: null,
        });

        return newToken;
      } catch (e) {
        // Keep refreshToken intact on transient network/startup failures
        console.warn('Refresh token failed (transient):', e);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    this.refreshPromise = task;
    return task;
  }

  private async getValidToken(): Promise<string | null> {
    if (!this.state.accessToken && !this.state.refreshToken) return null;
    if (
      !this.state.accessToken ||
      (this.state.expiresAt && Date.now() > this.state.expiresAt - 60000)
    ) {
      return await this.refreshAccessToken();
    }
    return this.state.accessToken;
  }

  private async spotifyGet<T>(url: string): Promise<T> {
    const token = await this.getValidToken();
    if (!token) {
      throw new Error(
        this.state.refreshToken
          ? 'Spotify oturumu yenilenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.'
          : 'Spotify hesabı bağlı değil.',
      );
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        throw new Error(
          this.state.isConnected
            ? 'Spotify oturumu yenilenemedi. Lütfen tekrar deneyin.'
            : 'Spotify oturumu sona erdi, lütfen tekrar bağlanın.',
        );
      }
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${refreshed}` },
      });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({}));
        throw new Error(err.error?.message || `Spotify API hatası (${retry.status})`);
      }
      return (await retry.json()) as T;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Spotify API hatası (${res.status})`);
    }

    return (await res.json()) as T;
  }

  public async refreshUserData(): Promise<void> {
    const token = await this.getValidToken();
    if (!token) return;

    try {
      const user = await this.spotifyGet<SpotifyUser>('https://api.spotify.com/v1/me');
      this.updateState({
        isConnected: true,
        user,
        error: null,
      });
    } catch (e) {
      console.warn('Failed to refresh Spotify user:', e);
    }
  }

  public async searchTracks(query: string): Promise<SpotifyTrack[]> {
    if (!query.trim()) return [];
    // Spotify 2026 Development Mode caps GET /v1/search at limit=10 max
    const data = await this.spotifyGet<{ tracks?: { items?: SpotifyTrack[] } }>(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query.trim())}&type=track&limit=10`,
    );
    return data.tracks?.items || [];
  }

  public async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
    const data = await this.spotifyGet<{ items?: SpotifyPlaylist[] }>(
      'https://api.spotify.com/v1/me/playlists?limit=30',
    );
    return (data.items || []).filter(Boolean);
  }

  public async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    type PlaylistTrackEntry = { track?: SpotifyTrack | null; item?: SpotifyTrack | null };
    let data: { items?: PlaylistTrackEntry[] };
    try {
      data = await this.spotifyGet<{ items?: PlaylistTrackEntry[] }>(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50`,
      );
    } catch {
      data = await this.spotifyGet<{ items?: PlaylistTrackEntry[] }>(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`,
      );
    }
    return (data.items || [])
      .map((entry) => entry.track || entry.item)
      .filter((t): t is SpotifyTrack => Boolean(t && t.id && t.name));
  }

  public async getSavedTracks(): Promise<SpotifyTrack[]> {
    const data = await this.spotifyGet<{
      items?: Array<{ track?: SpotifyTrack | null; item?: SpotifyTrack | null }>;
    }>('https://api.spotify.com/v1/me/tracks?limit=30');
    return (data.items || [])
      .map((entry) => entry.track || entry.item)
      .filter((t): t is SpotifyTrack => Boolean(t && t.id && t.name));
  }

  public logout() {
    this.state = {
      ...this.state,
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      error: null,
    };
    this.saveState();
    this.notify();
  }
}

export const spotifyService = new SpotifyService();
