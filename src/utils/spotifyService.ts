import { SpotifyTrack, SpotifyUser, SpotifyDevice, SpotifyAuthState } from '../types/sound';

const STORAGE_KEY_SPOTIFY = 'lir_spotify_auth_v1';
const VERIFIER_STORAGE_KEY = 'lir_spotify_code_verifier';

async function readJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      `${endpoint} boş yanıt verdi (HTTP ${response.status}). Sunucudaki Spotify API uçlarını kontrol edip yeniden dağıtın.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const isHtml = /<\/?(?:!doctype|html)\b/i.test(text);
    throw new Error(
      isHtml
        ? `${endpoint} JSON yerine web sayfası döndürdü (HTTP ${response.status}). Spotify API uçları dağıtımda bulunamadı; Vercel dağıtımını kontrol edin.`
        : `${endpoint} geçersiz JSON yanıtı verdi (HTTP ${response.status}).`
    );
  }
}

// Default default scopes for full player control and library search
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'user-library-read',
  'streaming',
].join(' ');

class SpotifyService {
  private state: SpotifyAuthState = {
    isConnected: false,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    user: null,
    devices: [],
    activeDeviceId: null,
    clientId: '',
    clientSecret: '',
    redirectUri: 'https://lir.anticvalley.com.tr/auth/callback',
    preferConnect: true,
    error: null,
  };

  private listeners: Set<(state: SpotifyAuthState) => void> = new Set();
  private previewAudio: HTMLAudioElement | null = null;
  private currentPlayingTrackUri: string | null = null;

  constructor() {
    this.loadState();
    this.initMessageListener();
    this.fetchEnvConfig();
  }

  private loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SPOTIFY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = {
          ...this.state,
          ...parsed,
          error: null,
        };
        // If we have an existing token, refresh or validate user profile
        if (this.state.accessToken) {
          this.refreshUserData();
        }
      }
    } catch (e) {
      console.warn('Failed to load Spotify state from localStorage:', e);
    }
  }

  private async fetchEnvConfig() {
    try {
      const res = await fetch(this.getApiUrl('/api/spotify/config'));
      if (res.ok) {
        const data = await res.json();
        if (data.envClientId && !this.state.clientId) {
          this.updateState({ clientId: data.envClientId });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  private saveState() {
    try {
      const { accessToken, refreshToken, expiresAt, user, activeDeviceId, clientId, clientSecret, redirectUri, preferConnect } = this.state;
      localStorage.setItem(
        STORAGE_KEY_SPOTIFY,
        JSON.stringify({
          isConnected: Boolean(accessToken),
          accessToken,
          refreshToken,
          expiresAt,
          user,
          activeDeviceId,
          clientId,
          clientSecret,
          redirectUri,
          preferConnect,
        })
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

  // Base64URL encoding without padding
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
    if (typeof window !== 'undefined' && window.location.hostname.includes('anticvalley.com.tr')) {
      return `${window.location.origin}/auth/callback`;
    }
    return 'https://lir.anticvalley.com.tr/auth/callback';
  }

  private getApiUrl(path: string): string {
    const baseUrl = window.location.protocol === 'file:'
      ? new URL(this.getRedirectUri()).origin
      : window.location.origin;
    return `${baseUrl}${path}`;
  }

  public async initiateLogin(): Promise<void> {
    const clientId = this.state.clientId?.trim();
    if (!clientId) {
      throw new Error('Spotify Client ID girilmelidir. Lütfen Ayarlar sekmesinden Client ID kaydedin.');
    }

    this.updateState({ error: null });
    const redirectUri = this.getRedirectUri();
    const verifier = this.generateRandomString(64);
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);

    const challenge = await this.generateCodeChallenge(verifier);
    const state = this.generateRandomString(16);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SPOTIFY_SCOPES,
      show_dialog: 'true',
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    // Open popup directly to the OAuth provider URL
    const popup = window.open(
      authUrl,
      'spotify_oauth_popup',
      'width=600,height=750,menubar=no,toolbar=no,location=no,status=no'
    );

    if (!popup) {
      throw new Error('Tarayıcı açılır pencereyi engelledi. Lütfen bu site için pop-up izinlerini açın.');
    }
  }

  private initMessageListener() {
    window.addEventListener('message', async (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        !origin.includes('anticvalley.com.tr') &&
        origin !== window.location.origin
      ) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const code = event.data.code;
        if (code) {
          await this.handleAuthCallback(code);
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        this.updateState({ error: event.data.error || 'Spotify yetkilendirmesi iptal edildi veya başarısız oldu' });
      }
    });
  }

  private async handleAuthCallback(code: string) {
    const codeVerifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY) || undefined;
    const redirectUri = this.getRedirectUri();
    const clientId = this.state.clientId?.trim();
    const clientSecret = this.state.clientSecret?.trim() || undefined;

    try {
      const res = await fetch(this.getApiUrl('/api/spotify/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
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
    if (!this.state.refreshToken) {
      this.updateState({ isConnected: false, accessToken: null });
      return null;
    }

    try {
      const res = await fetch(this.getApiUrl('/api/spotify/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: this.state.refreshToken,
          client_id: this.state.clientId?.trim(),
          client_secret: this.state.clientSecret?.trim() || undefined,
        }),
      });

      const data = await readJsonResponse<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      }>(res, 'Spotify token yenileme API');
      if (!res.ok) {
        throw new Error(data.error_description || data.error || 'Token yenilenemedi');
      }
      if (!data.access_token) {
        throw new Error('Spotify token yenileme API erişim anahtarı döndürmedi.');
      }

      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      const newToken = data.access_token;
      this.updateState({
        accessToken: newToken,
        refreshToken: data.refresh_token || this.state.refreshToken,
        expiresAt,
        error: null,
      });

      return newToken;
    } catch (e) {
      console.error('Refresh token failed:', e);
      return null;
    }
  }

  private async getValidToken(): Promise<string | null> {
    if (!this.state.accessToken) return null;
    if (this.state.expiresAt && Date.now() > this.state.expiresAt - 60000) {
      return await this.refreshAccessToken();
    }
    return this.state.accessToken;
  }

  public async refreshUserData(): Promise<void> {
    const token = await this.getValidToken();
    if (!token) return;

    try {
      const [userRes, devRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('https://api.spotify.com/v1/me/player/devices', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      let user: SpotifyUser | null = null;
      if (userRes.ok) {
        user = await userRes.json();
      }

      let devices: SpotifyDevice[] = [];
      let activeDeviceId = this.state.activeDeviceId;
      if (devRes.ok) {
        const devData = await devRes.json();
        devices = devData.devices || [];
        const active = devices.find((d) => d.is_active);
        if (active) {
          activeDeviceId = active.id;
        } else if (!activeDeviceId && devices.length > 0) {
          activeDeviceId = devices[0].id;
        }
      }

      this.updateState({
        isConnected: true,
        user: user || this.state.user,
        devices,
        activeDeviceId,
        error: null,
      });
    } catch (e) {
      console.warn('Failed to refresh user data:', e);
    }
  }

  public async searchTracks(query: string): Promise<SpotifyTrack[]> {
    if (!query.trim()) return [];
    const token = await this.getValidToken();
    if (!token) {
      throw new Error('Spotify hesabı bağlı değil. Lütfen önce Spotify bağlantısını kurun.');
    }

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query.trim())}&type=track&limit=10`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Şarkı araması başarısız oldu');
    }

    const data = await res.json();
    return data.tracks?.items || [];
  }

  public async playTrack(
    trackUri: string,
    previewUrl?: string,
    onStateChange?: (playing: boolean) => void
  ): Promise<{ success: boolean; mode: 'connect' | 'preview'; message?: string }> {
    const token = await this.getValidToken();
    this.currentPlayingTrackUri = trackUri;

    // 1. Try Spotify Connect player if connected
    if (token && this.state.preferConnect) {
      try {
        const devices = this.state.devices;
        const targetDeviceId = this.state.activeDeviceId || devices[0]?.id;

        const url = targetDeviceId
          ? `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(targetDeviceId)}`
          : 'https://api.spotify.com/v1/me/player/play';

        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uris: [trackUri],
          }),
        });

        if (res.status === 204 || res.status === 200) {
          if (onStateChange) onStateChange(true);
          return { success: true, mode: 'connect' };
        }

        // If no active device or 404 / 403, we fall through to preview or prompt
        const errJson = await res.json().catch(() => null);
        console.warn('Spotify Connect play response not 204:', res.status, errJson);
      } catch (err) {
        console.warn('Spotify Connect API error:', err);
      }
    }

    // 2. Fallback: Audio preview playback if available
    if (previewUrl) {
      this.stopPreview();
      this.previewAudio = new Audio(previewUrl);
      this.previewAudio.volume = 0.9;
      this.previewAudio.onended = () => {
        this.currentPlayingTrackUri = null;
        if (onStateChange) onStateChange(false);
      };
      await this.previewAudio.play();
      if (onStateChange) onStateChange(true);
      return { success: true, mode: 'preview', message: 'Şarkı önizlemesi çalınıyor' };
    }

    // 3. Fallback: If no preview and Connect failed, open spotify URI or web player
    window.open(trackUri, '_blank');
    return {
      success: true,
      mode: 'connect',
      message: 'Spotify uygulamasına yönlendirildi (Aktif Spotify cihazı açık değilse uygulamayı açın)',
    };
  }

  public async pauseTrack(): Promise<void> {
    this.stopPreview();
    this.currentPlayingTrackUri = null;

    const token = await this.getValidToken();
    if (!token) return;

    try {
      await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  }

  public stopPreview() {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.currentTime = 0;
      this.previewAudio = null;
    }
  }

  public isTrackPlaying(trackUri: string): boolean {
    return this.currentPlayingTrackUri === trackUri;
  }

  public logout() {
    this.stopPreview();
    this.state = {
      ...this.state,
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      devices: [],
      activeDeviceId: null,
      error: null,
    };
    localStorage.removeItem(STORAGE_KEY_SPOTIFY);
    this.notify();
  }
}

export const spotifyService = new SpotifyService();
