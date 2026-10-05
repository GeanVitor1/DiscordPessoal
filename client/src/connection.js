export const DEFAULT_SERVER = 'https://discordpessoal.onrender.com';

export function serverOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.origin;
  } catch { /* Invalid values never become credential destinations. */ }
  return null;
}

export function resolveServer({ desktop, development, pageOrigin, configured, saved, mode }) {
  // A previous development IP must not strand an installed application.
  // Explicit custom servers remain available; sessions stay scoped to that origin.
  const custom = mode === 'custom' && serverOrigin(saved);
  if (custom) return custom;
  if (!desktop) return serverOrigin(pageOrigin);
  if (development) return serverOrigin(configured) || serverOrigin(pageOrigin);
  return serverOrigin(configured) || DEFAULT_SERVER;
}

export async function probeServer(base, { fetcher = fetch, signal, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (!base) return { status: 'offline' };
    const response = await fetcher(`${base}/api/health`, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) return { status: 'offline' };
    let data;
    try { data = await response.json(); } catch { return { status: 'incompatible' }; }
    if (data.authentication !== 'sessions-v1') return { status: 'incompatible' };
    return { status: data.status === 'ok' ? 'ready' : 'offline' };
  } catch { return { status: 'offline' }; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
