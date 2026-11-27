import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'EVENT' | 'STATE' | 'UI';

export interface DebugLogEntry {
  level?: LogLevel;
  source: string;
  message: string;
  meta?: unknown;
  timestamp?: string;
}

const DATA_DIR = process.env.CLINIC_DATA_DIR
  ? path.resolve(process.env.CLINIC_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const LOG_PATH = path.join(DATA_DIR, 'debug.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotation cap
const KEEP_LOG_BYTES = 2.5 * 1024 * 1024;

let enabled = false;

export function isDebugLoggingEnabled(): boolean {
  return enabled;
}

export function setDebugLoggingEnabled(val: boolean): void {
  enabled = Boolean(val);
  if (enabled) {
    appendDebugLog('SERVER', 'Debug logging enabled', undefined, 'INFO');
  }
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= MAX_LOG_BYTES) return;

    const fd = fs.openSync(LOG_PATH, 'r');
    try {
      const readLen = Math.min(stat.size, KEEP_LOG_BYTES);
      const buf = Buffer.alloc(readLen);
      fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
      const text = buf.toString('utf8');
      const firstNewline = text.indexOf('\n');
      const trimmed = firstNewline >= 0 ? text.slice(firstNewline + 1) : text;
      const notice = `[${new Date().toISOString()}] [INFO] [LOGGER] Log rotated (kept latest ~2.5MB)\n`;
      fs.writeFileSync(LOG_PATH, notice + trimmed, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
}

function formatLine(entry: DebugLogEntry): string {
  const stamp = entry.timestamp || new Date().toISOString();
  const level: LogLevel = entry.level || 'INFO';
  const metaStr = entry.meta !== undefined ? ` | ${JSON.stringify(entry.meta)}` : '';
  return `[${stamp}] [${level}] [${entry.source}] ${entry.message}${metaStr}\n`;
}

export function appendDebugLog(
  source: string,
  message: string,
  meta?: unknown,
  level: LogLevel = 'INFO'
): void {
  if (!enabled) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_PATH, formatLine({ level, source, message, meta }), 'utf8');
  } catch {}
}

export function appendDebugBatch(entries: DebugLogEntry[]): void {
  if (!enabled || !Array.isArray(entries) || entries.length === 0) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    rotateIfNeeded();
    const lines = entries
      .filter((e) => e && e.message)
      .map((e) => formatLine(e))
      .join('');
    if (lines) {
      fs.appendFileSync(LOG_PATH, lines, 'utf8');
    }
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
