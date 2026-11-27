export type ClientLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'EVENT' | 'STATE' | 'UI';

interface QueuedEntry {
  level: ClientLogLevel;
  source: string;
  message: string;
  meta?: unknown;
  timestamp: string;
}

let clientLoggingEnabled = false;
let listenersInstalled = false;
let originalFetch: typeof window.fetch | null = null;
let flushTimer: number | undefined;
const queue: QueuedEntry[] = [];

function flushQueue(): void {
  if (!clientLoggingEnabled || !originalFetch || queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  originalFetch('/api/dev/logs/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: batch }),
    keepalive: true,
  }).catch(() => {});
}

export function sendClientLog(
  source: string,
  message: string,
  meta?: unknown,
  level: ClientLogLevel = 'INFO'
): void {
  if (!clientLoggingEnabled) return;
  queue.push({
    level,
    source,
    message,
    meta,
    timestamp: new Date().toISOString(),
  });
  if (queue.length >= 15) {
    window.clearTimeout(flushTimer);
    flushQueue();
  } else if (!flushTimer) {
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      flushQueue();
    }, 600);
  }
}

export function logUiEvent(component: string, action: string, meta?: unknown): void {
  sendClientLog(`UI:${component}`, action, meta, 'UI');
}

export function setClientDebugLogging(enabled: boolean): void {
  const next = Boolean(enabled);
  if (!next && clientLoggingEnabled) {
    flushQueue();
  }
  clientLoggingEnabled = next;
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isLogEndpoint = url.includes('/api/dev/logs');
    const started = performance.now();
    try {
      const res = await originalFetch!(input, init);
      if (clientLoggingEnabled && !isLogEndpoint) {
        const ms = Math.round(performance.now() - started);
        const level: ClientLogLevel = res.status >= 500 ? 'ERROR' : res.status >= 400 ? 'WARN' : 'INFO';
        sendClientLog('CLIENT_FETCH', `${init?.method || 'GET'} ${url} -> ${res.status} (${ms}ms)`, undefined, level);
      }
      return res;
    } catch (err) {
      if (clientLoggingEnabled && !isLogEndpoint) {
        sendClientLog('CLIENT_FETCH', `${init?.method || 'GET'} ${url} FAILED`, err instanceof Error ? err.message : String(err), 'ERROR');
      }
      throw err;
    }
  };

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    sendClientLog('CONSOLE', args.map((a) => String(a)).join(' '), undefined, 'ERROR');
    origError(...args);
  };

  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    sendClientLog('CONSOLE', args.map((a) => String(a)).join(' '), undefined, 'WARN');
    origWarn(...args);
  };

  window.addEventListener('error', (e) => {
    sendClientLog('WINDOW_ERROR', e.message || 'Unknown error', {
      file: e.filename,
      line: e.lineno,
      col: e.colno,
    }, 'ERROR');
  });

  window.addEventListener('unhandledrejection', (e) => {
    sendClientLog('UNHANDLED_REJECTION', String(e.reason), undefined, 'ERROR');
  });

  window.addEventListener('pagehide', flushQueue);
}
