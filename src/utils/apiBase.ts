export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  try {
    const electronBase = window.electronAPI?.getApiBaseUrl?.();
    if (electronBase && /^https?:\/\//i.test(electronBase)) {
      return electronBase.replace(/\/+$/, '');
    }
  } catch {
    // ignore IPC lookup failure
  }

  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }

  return window.location.origin;
}

export function getApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^(https?:|data:|blob:|file:)/i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}
