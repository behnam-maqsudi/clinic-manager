"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDebugLoggingEnabled = isDebugLoggingEnabled;
exports.setDebugLoggingEnabled = setDebugLoggingEnabled;
exports.appendDebugLog = appendDebugLog;
exports.getDebugLogStatus = getDebugLogStatus;
exports.clearDebugLogs = clearDebugLogs;
exports.getDebugLogPath = getDebugLogPath;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DATA_DIR = process.env.CLINIC_DATA_DIR
    ? node_path_1.default.resolve(process.env.CLINIC_DATA_DIR)
    : node_path_1.default.join(__dirname, '..', 'data');
const LOG_PATH = node_path_1.default.join(DATA_DIR, 'debug.log');
let enabled = false;
function isDebugLoggingEnabled() {
    return enabled;
}
function setDebugLoggingEnabled(val) {
    enabled = Boolean(val);
    if (enabled) {
        appendDebugLog('SERVER', 'Debug logging enabled');
    }
}
function appendDebugLog(source, message, meta) {
    if (!enabled)
        return;
    try {
        node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        const stamp = new Date().toISOString();
        const metaStr = meta !== undefined ? ` | ${JSON.stringify(meta)}` : '';
        node_fs_1.default.appendFileSync(LOG_PATH, `[${stamp}] [${source}] ${message}${metaStr}\n`, 'utf8');
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
