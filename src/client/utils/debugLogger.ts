let clientLoggingEnabled = false;
let listenersInstalled = false;
let originalFetch: typeof window.fetch | null = null;

export function sendClientLog(source: string, message: string, meta?: unknown): void {
  if (!clientLoggingEnabled || !originalFetch) return;
  originalFetch('/api/dev/logs/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, message, meta }),
  }).catch(() => {});
}

export function setClientDebugLogging(enabled: boolean): void {
  clientLoggingEnabled = Boolean(enabled);
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isLogEndpoint = url.includes('/api/dev/logs');
    const started = performance.now();
    try {
      const res = await originalFetch!(input, init);
      if (clientLoggingEnabled && !isLogEndpoint && !res.ok) {
        sendClientLog('CLIENT_FETCH', `${init?.method || 'GET'} ${url} -> ${res.status} (${Math.round(performance.now() - started)}ms)`);
      }
      return res;
    } catch (err) {
      if (clientLoggingEnabled && !isLogEndpoint) {
        sendClientLog('CLIENT_FETCH_ERR', `${init?.method || 'GET'} ${url}`, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  };

  window.addEventListener('error', (e) => {
    sendClientLog('CLIENT_ERROR', e.message || 'Unknown error', {
      file: e.filename,
      line: e.lineno,
      col: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    sendClientLog('CLIENT_REJECTION', String(e.reason));
  });
}
