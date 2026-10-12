interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    hasEnvClientId: Boolean(process.env.SPOTIFY_CLIENT_ID),
    hasEnvClientSecret: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
    envClientId: process.env.SPOTIFY_CLIENT_ID || '',
  });
}
