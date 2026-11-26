import { Buffer } from 'node:buffer';
import { env } from 'node:process';

export type SpotifyApiAction = 'token' | 'refresh' | 'config' | 'auth-url';

export interface SpotifyApiResult {
  status: number;
  body: unknown;
}

const DEFAULT_SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'streaming',
].join(' ');

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const DEFAULT_PRODUCTION_REDIRECT_URI = 'https://lir.anticvalley.com.tr/auth/callback';

function resolveSafeRedirectUri(requestedRedirect: string): string {
  if (requestedRedirect) {
    try {
      const parsed = new URL(requestedRedirect);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // fall through to APP_URL / default
    }
  }
  const appUrl = getString(env.APP_URL).replace(/\/+$/, '');
  if (appUrl) {
    return `${appUrl}/auth/callback`;
  }
  return DEFAULT_PRODUCTION_REDIRECT_URI;
}

export async function handleSpotifyApi(
  action: SpotifyApiAction,
  body: Record<string, unknown> = {},
): Promise<SpotifyApiResult> {
  if (action === 'config') {
    const appUrl = getString(env.APP_URL).replace(/\/+$/, '');
    return {
      status: 200,
      body: {
        hasEnvClientId: Boolean(env.SPOTIFY_CLIENT_ID),
        hasEnvClientSecret: Boolean(env.SPOTIFY_CLIENT_SECRET),
        envClientId: env.SPOTIFY_CLIENT_ID || '',
        appRedirectUri: appUrl ? `${appUrl}/auth/callback` : DEFAULT_PRODUCTION_REDIRECT_URI,
      },
    };
  }

  if (action === 'auth-url') {
    const clientId = getString(body.client_id) || getString(env.SPOTIFY_CLIENT_ID);
    const redirectUri = resolveSafeRedirectUri(getString(body.redirect_uri));
    const codeChallenge = getString(body.code_challenge);
    const state = getString(body.state);
    const scope = getString(body.scope) || DEFAULT_SPOTIFY_SCOPES;

    if (!clientId) {
      return { status: 400, body: { error: 'Spotify Client ID eksik' } };
    }
    if (!redirectUri) {
      return { status: 400, body: { error: 'Geçerli Redirect URI sağlanamadı' } };
    }
    if (!codeChallenge || !state) {
      return { status: 400, body: { error: 'PKCE code_challenge veya state eksik' } };
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      scope,
      show_dialog: 'true',
    });

    return {
      status: 200,
      body: {
        url: `https://accounts.spotify.com/authorize?${params.toString()}`,
        redirectUri,
      },
    };
  }

  const clientId = getString(body.client_id) || getString(env.SPOTIFY_CLIENT_ID);
  const clientSecret = getString(env.SPOTIFY_CLIENT_SECRET);

  if (!clientId) {
    return { status: 400, body: { error: 'Spotify Client ID eksik' } };
  }

  const bodyParams = new URLSearchParams();
  bodyParams.set('client_id', clientId);

  if (action === 'token') {
    const code = getString(body.code);
    const redirectUri = resolveSafeRedirectUri(getString(body.redirect_uri));
    if (!code) {
      return { status: 400, body: { error: 'Yetkilendirme kodu (code) eksik' } };
    }
    if (!redirectUri) {
      return { status: 400, body: { error: 'Redirect URI eksik' } };
    }

    bodyParams.set('grant_type', 'authorization_code');
    bodyParams.set('code', code);
    bodyParams.set('redirect_uri', redirectUri);

    const codeVerifier = getString(body.code_verifier);
    if (codeVerifier) bodyParams.set('code_verifier', codeVerifier);
  } else {
    const refreshToken = getString(body.refresh_token);
    if (!refreshToken) {
      return { status: 400, body: { error: 'Refresh token eksik' } };
    }
    bodyParams.set('grant_type', 'refresh_token');
    bodyParams.set('refresh_token', refreshToken);
  }

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
      body: bodyParams.toString(),
    });
    const responseBody: unknown = await spotifyResponse.json();
    return { status: spotifyResponse.status, body: responseBody };
  } catch (error: unknown) {
    console.error(`Spotify ${action} request failed:`, error);
    return {
      status: 502,
      body: { error: 'Spotify sunucusuna ulaşılamadı' },
    };
  }
}
