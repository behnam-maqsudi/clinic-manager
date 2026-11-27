import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.CLINIC_DATA_DIR
  ? path.resolve(process.env.CLINIC_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const LOG_PATH = path.join(DATA_DIR, 'debug.log');

let enabled = false;

export function isDebugLoggingEnabled(): boolean {
  return enabled;
}

export function setDebugLoggingEnabled(val: boolean): void {
  enabled = Boolean(val);
  if (enabled) {
    appendDebugLog('SERVER', 'Debug logging enabled');
  }
}

export function appendDebugLog(source: string, message: string, meta?: unknown): void {
  if (!enabled) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const stamp = new Date().toISOString();
    const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : '';
    fs.appendFileSync(LOG_PATH, `[${stamp}] [${source}] ${message}${metaStr}\n`, 'utf8');
  } catch {}
}

export function getDebugLogStatus(): { enabled: boolean; sizeBytes: number; lineCount: number } {
  if (!fs.existsSync(LOG_PATH)) {
    return { enabled, sizeBytes: 0, lineCount: 0 };
  }
  const stat = fs.statSync(LOG_PATH);
  const content = fs.readFileSync(LOG_PATH, 'utf8');
  const lineCount = content ? content.split(/\r?\n/).filter(Boolean).length : 0;
  return { enabled, sizeBytes: stat.size, lineCount };
}

export function clearDebugLogs(): void {
  if (fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, '', 'utf8');
  }
}

export function getDebugLogPath(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, '', 'utf8');
  }
  return LOG_PATH;
}
