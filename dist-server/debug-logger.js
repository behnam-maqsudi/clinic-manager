"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDebugLoggingEnabled = isDebugLoggingEnabled;
exports.setDebugLoggingEnabled = setDebugLoggingEnabled;
exports.appendDebugLog = appendDebugLog;
exports.appendDebugBatch = appendDebugBatch;
exports.getDebugLogStatus = getDebugLogStatus;
exports.clearDebugLogs = clearDebugLogs;
exports.getDebugLogPath = getDebugLogPath;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DATA_DIR = process.env.CLINIC_DATA_DIR
    ? node_path_1.default.resolve(process.env.CLINIC_DATA_DIR)
    : node_path_1.default.join(__dirname, '..', 'data');
const LOG_PATH = node_path_1.default.join(DATA_DIR, 'debug.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotation cap
const KEEP_LOG_BYTES = 2.5 * 1024 * 1024;
let enabled = false;
function isDebugLoggingEnabled() {
    return enabled;
}
function setDebugLoggingEnabled(val) {
    enabled = Boolean(val);
    if (enabled) {
        appendDebugLog('SERVER', 'Debug logging enabled', undefined, 'INFO');
    }
}
function rotateIfNeeded() {
    try {
        if (!node_fs_1.default.existsSync(LOG_PATH))
            return;
        const stat = node_fs_1.default.statSync(LOG_PATH);
        if (stat.size <= MAX_LOG_BYTES)
            return;
        const fd = node_fs_1.default.openSync(LOG_PATH, 'r');
        try {
            const readLen = Math.min(stat.size, KEEP_LOG_BYTES);
            const buf = Buffer.alloc(readLen);
            node_fs_1.default.readSync(fd, buf, 0, readLen, stat.size - readLen);
            const text = buf.toString('utf8');
            const firstNewline = text.indexOf('\n');
            const trimmed = firstNewline >= 0 ? text.slice(firstNewline + 1) : text;
            const notice = `[${new Date().toISOString()}] [INFO] [LOGGER] Log rotated (kept latest ~2.5MB)\n`;
            node_fs_1.default.writeFileSync(LOG_PATH, notice + trimmed, 'utf8');
        }
        finally {
            node_fs_1.default.closeSync(fd);
        }
    }
    catch { }
}
function formatLine(entry) {
    const stamp = entry.timestamp || new Date().toISOString();
    const level = entry.level || 'INFO';
    const metaStr = entry.meta !== undefined ? ` | ${JSON.stringify(entry.meta)}` : '';
    return `[${stamp}] [${level}] [${entry.source}] ${entry.message}${metaStr}\n`;
}
function appendDebugLog(source, message, meta, level = 'INFO') {
    if (!enabled)
        return;
    try {
        node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        rotateIfNeeded();
        node_fs_1.default.appendFileSync(LOG_PATH, formatLine({ level, source, message, meta }), 'utf8');
    }
    catch { }
}
function appendDebugBatch(entries) {
    if (!enabled || !Array.isArray(entries) || entries.length === 0)
        return;
    try {
        node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        rotateIfNeeded();
        const lines = entries
            .filter((e) => e && e.message)
            .map((e) => formatLine(e))
            .join('');
        if (lines) {
            node_fs_1.default.appendFileSync(LOG_PATH, lines, 'utf8');
        }
    }
    catch { }
}
function getDebugLogStatus() {
    if (!node_fs_1.default.existsSync(LOG_PATH)) {
        return { enabled, sizeBytes: 0, lineCount: 0 };
    }
    const stat = node_fs_1.default.statSync(LOG_PATH);
    const content = node_fs_1.default.readFileSync(LOG_PATH, 'utf8');
    const lineCount = content ? content.split(/\r?\n/).filter(Boolean).length : 0;
    return { enabled, sizeBytes: stat.size, lineCount };
}
function clearDebugLogs() {
    if (node_fs_1.default.existsSync(LOG_PATH)) {
        node_fs_1.default.writeFileSync(LOG_PATH, '', 'utf8');
    }
}
function getDebugLogPath() {
    node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    if (!node_fs_1.default.existsSync(LOG_PATH)) {
        node_fs_1.default.writeFileSync(LOG_PATH, '', 'utf8');
    }
    return LOG_PATH;
}
