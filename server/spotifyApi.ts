import { Buffer } from 'node:buffer';
import { env } from 'node:process';

export type SpotifyApiAction = 'token' | 'refresh' | 'config';

export interface SpotifyApiResult {
  status: number;
  body: unknown;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function handleSpotifyApi(
  action: SpotifyApiAction,
  body: Record<string, unknown> = {},
): Promise<SpotifyApiResult> {
  if (action === 'config') {
    return {
      status: 200,
      body: {
        hasEnvClientId: Boolean(env.SPOTIFY_CLIENT_ID),
        hasEnvClientSecret: Boolean(env.SPOTIFY_CLIENT_SECRET),
        envClientId: env.SPOTIFY_CLIENT_ID || '',
      },
    };
  }

  const clientId = getString(body.client_id) || env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = getString(body.client_secret) || env.SPOTIFY_CLIENT_SECRET || '';

  if (!clientId) {
    return { status: 400, body: { error: 'Spotify Client ID eksik' } };
  }

  const bodyParams = new URLSearchParams();
  bodyParams.set('client_id', clientId);

  if (action === 'token') {
    const code = getString(body.code);
    const redirectUri = getString(body.redirect_uri);
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
