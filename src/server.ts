import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';

import * as db from './db';
import * as debugLogger from './debug-logger';
import { applyGitUpdate, getGitStatus } from './git-updater';
import type { Attachment, DiscoveredPeer } from './shared/types';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  if (
    !debugLogger.isDebugLoggingEnabled() ||
    req.path.startsWith('/api/dev/logs') ||
    req.path.startsWith('/assets/') ||
    req.path === '/icon.svg' ||
    req.path === '/manifest.webmanifest'
  ) {
    return next();
  }
  const start = Date.now();
  const ip = normalizeRemoteIp(req.ip || req.socket.remoteAddress);
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    debugLogger.appendDebugLog(
      'HTTP',
      `[${ip}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`,
      undefined,
      level
    );
  });
  next();
});
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}
app.use(express.static(PUBLIC_DIR));

const sseClients = new Set<Response>();
const activeSseByIp = new Map<string, number>();
const connectedPeerIps = new Map<string, { hostname: string; connectedAt: string }>();

function normalizeRemoteIp(rawIp: string | undefined): string {
  const ip = String(rawIp || '').replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip;
}

function getRemoteConnectedIps(): string[] {
  const selfIps = new Set(['127.0.0.1', ...getLanIps()]);
  const result = new Set<string>();
  for (const [ip, count] of activeSseByIp.entries()) {
    if (count > 0 && !selfIps.has(ip)) result.add(ip);
  }
  for (const ip of connectedPeerIps.keys()) {
    if (!selfIps.has(ip)) result.add(ip);
  }
  return Array.from(result);
}

function broadcastEvent(event: string, data: Record<string, unknown> = {}) {
  debugLogger.appendDebugLog('SSE_BROADCAST', event, data, 'EVENT');
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function getLanIps(): string[] {
  const interfaces = os.networkInterfaces();
  const preferred: string[] = [];
  const secondary: string[] = [];
  const internalVirtualPattern = /(wsl|docker|vmware|virtualbox|vbox|loopback|default switch|internal|nat)/i;

  for (const name of Object.keys(interfaces)) {
    const isInternalVirtual = internalVirtualPattern.test(name);
    const isExternalVirtual = /vethernet.*external/i.test(name);
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (iface.address.startsWith('169.254.')) continue;
      if ((!isInternalVirtual || isExternalVirtual) && (iface.address.startsWith('192.168.') || iface.address.startsWith('10.'))) {
        preferred.push(iface.address);
      } else if (!isInternalVirtual || isExternalVirtual) {
        secondary.push(iface.address);
      }
    }
  }
  return preferred.length > 0 ? preferred : secondary;
}

function getPrimaryBaseUrl(req: Request): string {
  const ips = getLanIps();
  if (ips.length > 0) {
    return `http://${ips[0]}:${PORT}`;
  }
  const hostHeader = req.get('host');
  if (hostHeader) {
    return `${req.protocol}://${hostHeader}`;
  }
  return `http://localhost:${PORT}`;
}

function parsePositiveId(raw: unknown): number | null {
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function decodeOriginalFilename(rawName: string | undefined): string {
  const name = rawName || 'file';
  if (/[^\u0000-\u00ff]/.test(name)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const numId = parsePositiveId(req.params.id);
    if (!numId) {
      cb(new Error('شناسه مراجعه‌کننده نامعتبر است.'), '');
      return;
    }
    const dir = path.join(db.UPLOADS_DIR, String(numId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 10,
  },
});

const backupUpload = multer({
  dest: path.join(os.tmpdir(), 'clinic-backup-uploads'),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

// --- SSE Endpoint ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientIp = normalizeRemoteIp(req.ip || req.socket.remoteAddress);
  activeSseByIp.set(clientIp, (activeSseByIp.get(clientIp) || 0) + 1);
  debugLogger.appendDebugLog('SSE_CONNECT', `Client connected from ${clientIp}`, { remoteIps: getRemoteConnectedIps() });

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, connectedIps: getRemoteConnectedIps() })}\n\n`);
  sseClients.add(res);
  broadcastEvent('peers_changed', { connectedIps: getRemoteConnectedIps() });

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    const nextCount = Math.max(0, (activeSseByIp.get(clientIp) || 1) - 1);
    if (nextCount === 0) {
      activeSseByIp.delete(clientIp);
    } else {
      activeSseByIp.set(clientIp, nextCount);
    }
    debugLogger.appendDebugLog('SSE_DISCONNECT', `Client disconnected from ${clientIp}`, { remoteIps: getRemoteConnectedIps() });
    broadcastEvent('peers_changed', { connectedIps: getRemoteConnectedIps() });
  });
});

// --- Health & Network Info ---
app.get('/api/health', (_req, res) => {
  const lanIps = getLanIps();
  res.json({
    ok: true,
    clinic: 'مطب دکتر بهامین جهانیان',
    hostname: os.hostname(),
    isSetupCompleted: db.getSetupState().setupCompleted,
    port: PORT,
    lanIps,
    urls: lanIps.map((ip) => `http://${ip}:${PORT}`),
    localUrl: `http://localhost:${PORT}`,
  });
});

// --- LAN Peer Discovery & Connection Invites ---
app.get('/api/network/discover', async (_req, res) => {
  const selfIps = getLanIps();
  const selfIpSet = new Set(selfIps);
  const subnets = Array.from(new Set(selfIps.map((ip) => ip.split('.').slice(0, 3).join('.'))));

  if (subnets.length === 0) {
    return res.json({ ok: true, selfIps, peers: [] });
  }

  const candidateIps: string[] = [];
  for (const subnet of subnets.slice(0, 2)) {
    for (let host = 1; host <= 254; host += 1) {
      candidateIps.push(`${subnet}.${host}`);
    }
  }

  const peers: DiscoveredPeer[] = [];
  const batchSize = 50;

  for (let i = 0; i < candidateIps.length; i += batchSize) {
    const batch = candidateIps.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (ip): Promise<DiscoveredPeer | null> => {
        const url = `http://${ip}:${PORT}`;
        try {
          const resp = await fetch(`${url}/api/health`, {
            signal: AbortSignal.timeout(350),
          });
          if (!resp.ok) return null;
          const data = (await resp.json()) as {
            ok?: boolean;
            clinic?: string;
            hostname?: string;
            isSetupCompleted?: boolean;
            port?: number;
          };
          if (!data?.ok || !data?.clinic) return null;
          return {
            ip,
            url,
            clinic: data.clinic,
            hostname: data.hostname || ip,
            isSetupCompleted: Boolean(data.isSetupCompleted),
            isConnected: connectedPeerIps.has(ip) || (activeSseByIp.get(ip) || 0) > 0,
            port: Number(data.port) || PORT,
            isSelf: selfIpSet.has(ip),
          };
        } catch {
          return null;
        }
      })
    );
    for (const item of results) {
      if (item) peers.push(item);
    }
  }

  peers.sort((a, b) => Number(a.isSelf) - Number(b.isSelf) || a.ip.localeCompare(b.ip));
  return res.json({ ok: true, selfIps, peers });
});

app.post('/api/network/invite', (req, res) => {
  try {
    const {
      fromName = '',
      fromUrl = '',
      fromRole = 'secretary',
      message = '',
      senderClientId = '',
      requestType = 'host_invite',
    } = req.body || {};
    const senderLabel = String(fromName || '').trim() || 'سیستم همکار در شبکه';
    const cleanUrl = String(fromUrl || '').trim();
    const cleanMsg =
      String(message || '').trim() ||
      (requestType === 'join_request'
        ? `دستگاه «${senderLabel}» درخواست اتصال به سیستم اصلی را دارد.`
        : `دعوت اتصال از طرف «${senderLabel}»`);

    const saved = db.createMessage({
      sender_role: fromRole === 'doctor' ? 'doctor' : 'secretary',
      recipient_role: 'all',
      body: cleanMsg,
      kind: 'connection_invite',
      meta: { fromName: senderLabel, fromUrl: cleanUrl, requestType },
    });

    broadcastEvent('new_message', saved as unknown as Record<string, unknown>);
    broadcastEvent('connection_invite', {
      id: saved.id,
      fromName: senderLabel,
      fromUrl: cleanUrl,
      fromRole,
      requestType,
      senderClientId: String(senderClientId || ''),
      message: cleanMsg,
      created_at: saved.created_at,
    });
    return res.status(201).json({ ok: true, message: saved });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/network/send-invite', async (req, res) => {
  try {
    const {
      targetUrl = '',
      fromName = '',
      fromUrl = '',
      fromRole = 'secretary',
      message = '',
      senderClientId = '',
      requestType = 'host_invite',
    } = req.body || {};
    const cleanTarget = String(targetUrl || '').trim().replace(/\/+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(cleanTarget);
    } catch {
      return res.status(400).json({ ok: false, message: 'آدرس سیستم مقصد معتبر نیست.' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ ok: false, message: 'فقط آدرس‌های http/https پشتیبانی می‌شوند.' });
    }

    const lanIps = getLanIps();
    const selfUrl = fromUrl || (lanIps[0] ? `http://${lanIps[0]}:${PORT}` : `http://localhost:${PORT}`);
    const senderName = String(fromName || '').trim() || os.hostname();

    const resp = await fetch(`${cleanTarget}/api/network/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromName: senderName,
        fromUrl: selfUrl,
        fromRole,
        requestType,
        senderClientId: String(senderClientId || ''),
        message: String(message || '').trim(),
      }),
      signal: AbortSignal.timeout(3500),
    });

    if (!resp.ok) {
      return res.status(502).json({ ok: false, message: `سیستم مقصد پاسخ خطا داد (HTTP ${resp.status}).` });
    }
    return res.json({ ok: true, message: 'پیام اتصال به سیستم مقصد ارسال شد.' });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      message: err instanceof Error ? `عدم دسترسی به سیستم مقصد: ${err.message}` : 'عدم دسترسی به سیستم مقصد.',
    });
  }
});

app.post('/api/network/peer-connected', (req, res) => {
  const ip = normalizeRemoteIp(req.ip || req.socket.remoteAddress);
  const hostname = String(req.body?.hostname || '').trim() || ip || 'سیستم فرعی';
  if (ip) {
    connectedPeerIps.set(ip, { hostname, connectedAt: new Date().toISOString() });
  }
  debugLogger.appendDebugLog('PEER_CONNECTED', `${hostname} (${ip})`, { connectedIps: getRemoteConnectedIps() });
  broadcastEvent('peer_connected', { ip, hostname, connectedIps: getRemoteConnectedIps() });
  broadcastEvent('peers_changed', { connectedIps: getRemoteConnectedIps() });
  return res.json({ ok: true });
});

app.post('/api/network/notify-accepted', async (req, res) => {
  const rawTarget = String(req.body?.targetUrl || '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(rawTarget);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ ok: false });
    }
    await fetch(`${rawTarget}/api/network/peer-connected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname: os.hostname() }),
      signal: AbortSignal.timeout(1500),
    });
  } catch { }
  return res.json({ ok: true });
});

// --- Initial Setup & Role PIN Auth ---
app.get('/api/setup', (_req, res) => {
  res.json({ ok: true, ...db.getSetupState() });
});

app.post('/api/setup', (req, res) => {
  try {
    const current = db.getSetupState();
    const { doctorPin = '', secretaryPin = '', currentPin = '' } = req.body || {};
    const headerToken = req.get('x-doctor-token');
    if (
      current.setupCompleted &&
      current.hasDoctorPin &&
      !db.verifyDoctorPin(String(currentPin || '')) &&
      !db.verifyDoctorToken(headerToken)
    ) {
      return res.status(401).json({ ok: false, message: 'برای تغییر تنظیمات اولیه، رمز فعلی پزشک الزامی است.' });
    }
    const state = db.completeSetup({
      doctorPin: String(doctorPin || ''),
      secretaryPin: String(secretaryPin || ''),
    });
    const doctorToken = db.issueDoctorToken();
    broadcastEvent('setup_changed', state as unknown as Record<string, unknown>);
    return res.json({ ok: true, ...state, doctorToken });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/auth/login', (req, res) => {
  const role = req.body?.role === 'doctor' ? 'doctor' : 'secretary';
  const pin = String(req.body?.pin || '');
  if (role === 'doctor') {
    if (!db.verifyDoctorPin(pin)) {
      return res.json({ ok: false, message: 'رمز عبور پزشک اشتباه است.' });
    }
    return res.json({ ok: true, role: 'doctor', doctorToken: db.issueDoctorToken() });
  }
  if (!db.verifySecretaryPin(pin)) {
    return res.json({ ok: false, message: 'رمز عبور منشی اشتباه است.' });
  }
  return res.json({ ok: true, role: 'secretary', doctorToken: '' });
});

app.post('/api/auth/verify-pin', (req, res) => {
  const pin = String(req.body?.pin || '');
  const valid = db.verifyDoctorPin(pin);
  if (!valid) {
    return res.json({ ok: false, valid: false, message: 'رمز عبور پزشک اشتباه است.' });
  }
  return res.json({ ok: true, valid: true, doctorToken: db.issueDoctorToken() });
});

app.get('/api/auth/verify-token', (req, res) => {
  const token = req.get('x-doctor-token');
  const valid = db.verifyDoctorToken(token);
  return res.json({ ok: true, valid });
});

app.post('/api/dev/reset-setup', (req, res) => {
  const current = db.getSetupState();
  const isDevRequest = req.get('x-dev-mode') === 'true';
  const hasValidToken = db.verifyDoctorToken(req.get('x-doctor-token'));
  if (current.hasDoctorPin && !isDevRequest && !hasValidToken) {
    return res.status(403).json({ ok: false, message: 'دسترسی غیرمجاز برای بازنشانی تنظیمات.' });
  }
  const state = db.resetSetupState();
  broadcastEvent('setup_changed', state as unknown as Record<string, unknown>);
  return res.json({ ok: true, ...state });
});

app.post('/api/dev/factory-reset', (req, res) => {
  const current = db.getSetupState();
  const isDevRequest = req.get('x-dev-mode') === 'true';
  const hasValidToken = db.verifyDoctorToken(req.get('x-doctor-token'));
  if (current.hasDoctorPin && !isDevRequest && !hasValidToken) {
    return res.status(403).json({ ok: false, message: 'دسترسی غیرمجاز برای ریست کامل.' });
  }
  const state = db.factoryResetDev();
  broadcastEvent('patients_changed', { action: 'factory_reset' });
  broadcastEvent('setup_changed', state as unknown as Record<string, unknown>);
  return res.json({ ok: true, ...state });
});

// --- Debug File Logging ---
app.get('/api/dev/logs/status', (_req, res) => {
  return res.json({ ok: true, ...debugLogger.getDebugLogStatus() });
});

app.post('/api/dev/logs/toggle', (req, res) => {
  const next = Boolean(req.body?.enabled);
  debugLogger.setDebugLoggingEnabled(next);
  return res.json({ ok: true, ...debugLogger.getDebugLogStatus() });
});

app.post('/api/dev/logs/append', (req, res) => {
  if (Array.isArray(req.body?.entries)) {
    debugLogger.appendDebugBatch(req.body.entries);
    return res.json({ ok: true });
  }
  const source = String(req.body?.source || 'CLIENT');
  const message = String(req.body?.message || '');
  const level = req.body?.level || 'INFO';
  if (message) {
    debugLogger.appendDebugLog(source, message, req.body?.meta, level);
  }
  return res.json({ ok: true });
});

app.post('/api/dev/logs/clear', (_req, res) => {
  debugLogger.clearDebugLogs();
  return res.json({ ok: true, ...debugLogger.getDebugLogStatus() });
});

app.get('/api/dev/logs/download', (_req, res) => {
  const logPath = debugLogger.getDebugLogPath();
  const stamp = new Date().toISOString().slice(0, 10);
  return res.download(logPath, `clinic-debug-${stamp}.log`);
});

// --- Doctor <-> Secretary Messaging ---
app.get('/api/messages', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 60;
    const messages = db.listMessages(limit);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/messages', (req, res) => {
  try {
    const { sender_role = 'secretary', recipient_role = 'all', body = '', kind = 'chat', meta = {} } = req.body || {};
    const saved = db.createMessage({ sender_role, recipient_role, body, kind, meta });
    broadcastEvent('new_message', saved as unknown as Record<string, unknown>);
    res.status(201).json({ ok: true, message: saved });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/messages/read', (req, res) => {
  try {
    const role = req.body?.role === 'doctor' ? 'doctor' : 'secretary';
    const updated = db.markMessagesRead(role);
    if (updated > 0) {
      broadcastEvent('messages_read', { role, updated });
    }
    res.json({ ok: true, updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// --- Patients CRUD ---
app.get('/api/patients', (req, res) => {
  try {
    const q = String(req.query.q || '');
    const date = String(req.query.date || '');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const status = String(req.query.status || '');
    const patients = db.listPatients({ q, date, dateFrom, dateTo, status });
    res.json({ ok: true, patients });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/patients/lookup', (req, res) => {
  try {
    const matches = db.lookupReturningPatients(String(req.query.q || ''));
    res.json({ ok: true, matches });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/patients/bulk', (req, res) => {
  try {
    const { items = [], visit_date = '', created_by = 'secretary' } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: 'لیست مراجعه‌کنندگان خالی است.' });
    }
    const createdIds = db.createPatientsBulk(items, visit_date, created_by);
    broadcastEvent('patients_changed', { action: 'bulk_create', count: createdIds.length });
    return res.status(201).json({ ok: true, count: createdIds.length });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
    return res.status(statusCode).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/patients/:id', (req, res) => {
  const patient = db.getPatientById(String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
  }
  return res.json({ ok: true, patient });
});

app.post('/api/patients', (req, res) => {
  try {
    const patient = db.createPatient(req.body || {});
    broadcastEvent('patients_changed', { action: 'create', id: patient.id });
    res.status(201).json({ ok: true, patient });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/patients/:id', (req, res) => {
  try {
    const id = String(req.params.id);
    const prev = db.getPatientById(id);
    const patient = db.updatePatient(id, req.body || {});
    if (!patient) {
      return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
    }
    broadcastEvent('patients_changed', { action: 'update', id: patient.id });

    if (prev && req.body?.status && prev.status !== patient.status && (patient.status === 'in_progress' || patient.status === 'visited')) {
      broadcastEvent('patient_called', {
        id: patient.id,
        full_name: patient.full_name,
        file_number: patient.file_number,
        status: patient.status,
        by: req.body?.actor_role || 'doctor',
      });
    }

    return res.json({ ok: true, patient });
  } catch (err) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode || 400;
    return res.status(statusCode).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.delete('/api/patients/:id', (req, res) => {
  const id = String(req.params.id);
  const deleted = db.deletePatient(id);
  if (!deleted) {
    return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
  }
  broadcastEvent('patients_changed', { action: 'delete', id: Number(id) });
  return res.json({ ok: true });
});

// --- Patient Attachments ---
app.get('/api/patients/:id/attachments', (req, res) => {
  const id = String(req.params.id);
  const patient = db.getPatientById(id);
  if (!patient) {
    return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
  }
  const attachments = db.listAttachments(id);
  return res.json({ ok: true, patient, attachments });
});

app.post('/api/patients/:id/attachments', (req, res) => {
  const id = String(req.params.id);
  const patient = db.getPatientById(id);
  if (!patient) {
    return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
  }

  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, message: `خطا در آپلود فایل: ${err.message}` });
    }
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ ok: false, message: 'هیچ فایلی انتخاب نشده است.' });
    }

    const title = String(req.body?.title || '').trim();
    const uploadedBy = String(req.body?.uploaded_by || 'secretary').trim();
    const saved: Attachment[] = [];

    for (const file of uploadedFiles) {
      const originalName = decodeOriginalFilename(file.originalname);
      const record = db.addAttachment({
        patientId: patient.id,
        originalName,
        storedName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        title,
        uploadedBy,
      });
      saved.push(record);
    }

    broadcastEvent('attachments_changed', { patientId: patient.id });
    return res.status(201).json({ ok: true, attachments: saved });
  });
});

app.get('/api/attachments/:attachmentId/file', (req, res) => {
  const att = db.getAttachmentById(String(req.params.attachmentId));
  if (!att) {
    return res.status(404).json({ ok: false, message: 'فایل پیدا نشد.' });
  }
  const filePath = path.join(db.UPLOADS_DIR, String(att.patient_id), att.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, message: 'فایل روی دیسک یافت نشد.' });
  }

  if (req.query.download === '1') {
    return res.download(filePath, att.original_name);
  }
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`);
  return res.sendFile(filePath);
});

app.delete('/api/attachments/:attachmentId', (req, res) => {
  const id = String(req.params.attachmentId);
  const att = db.getAttachmentById(id);
  if (!att) {
    return res.status(404).json({ ok: false, message: 'فایل پیدا نشد.' });
  }
  db.deleteAttachment(id);
  broadcastEvent('attachments_changed', { patientId: att.patient_id });
  return res.json({ ok: true });
});

app.get('/api/patients/:id/qr', async (req, res) => {
  const patient = db.getPatientById(String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: 'مراجعه‌کننده پیدا نشد.' });
  }
  try {
    const baseUrl = getPrimaryBaseUrl(req);
    const uploadUrl = `${baseUrl}/upload.html?patientId=${patient.id}`;
    const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    return res.json({ ok: true, uploadUrl, qrDataUrl });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// --- Backup & Restore / Import ---
app.post('/api/backup/create', (_req, res) => {
  try {
    const file = db.createBackup();
    res.json({ ok: true, file: path.basename(file), message: 'نسخه پشتیبان با موفقیت ذخیره شد.' });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/backup/list', (_req, res) => {
  try {
    const backups = db.listBackups();
    res.json({ ok: true, backups });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/backup/download', (_req, res) => {
  try {
    const dbPath = db.getDbPath();
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(dbPath, `clinic-jahanian-backup-${stamp}.db`);
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/backup/restore', (req, res) => {
  backupUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, message: `خطا در آپلود فایل بکاپ: ${err.message}` });
    }
    const uploaded = req.file;
    if (!uploaded) {
      return res.status(400).json({ ok: false, message: 'هیچ فایل بکاپی انتخاب نشده است.' });
    }
    try {
      const result = db.restoreDatabaseFromFile(uploaded.path);
      broadcastEvent('patients_changed', { action: 'restore' });
      broadcastEvent('setup_changed', db.getSetupState() as unknown as Record<string, unknown>);
      return res.json({
        ok: true,
        patientCount: result.patientCount,
        message: `دیتابیس با موفقیت بازیابی شد (${result.patientCount} پرونده بیمار).`,
      });
    } catch (restoreErr) {
      return res.status(400).json({
        ok: false,
        message: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
      });
    } finally {
      if (fs.existsSync(uploaded.path)) {
        fs.unlinkSync(uploaded.path);
      }
    }
  });
});

app.post('/api/backup/restore-server', (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const backupPath = db.getBackupFilePath(fileName);
    if (!backupPath) {
      return res.status(404).json({ ok: false, message: 'فایل بکاپ روی سرور یافت نشد.' });
    }
    const result = db.restoreDatabaseFromFile(backupPath);
    broadcastEvent('patients_changed', { action: 'restore' });
    broadcastEvent('setup_changed', db.getSetupState() as unknown as Record<string, unknown>);
    return res.json({
      ok: true,
      patientCount: result.patientCount,
      message: `بکاپ با موفقیت بازیابی شد (${result.patientCount} پرونده بیمار).`,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

function normalizeExternalDownloadUrl(rawUrl: string): string {
  const clean = rawUrl.trim();
  // Convert Google Drive share URL: https://drive.google.com/file/d/<ID>/view...
  const gdriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }
  const gdriveOpenMatch = clean.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (gdriveOpenMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${gdriveOpenMatch[1]}`;
  }
  return clean;
}

app.post('/api/backup/import-url', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ ok: false, message: 'لینک فایل بکاپ را وارد کنید.' });
  }
  let parsed: URL;
  try {
    parsed = new URL(normalizeExternalDownloadUrl(rawUrl));
  } catch {
    return res.status(400).json({ ok: false, message: 'لینک واردشده معتبر نیست.' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ ok: false, message: 'فقط لینک‌های http/https پشتیبانی می‌شوند.' });
  }

  const tempDir = path.join(os.tmpdir(), 'clinic-backup-uploads');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `import-${Date.now()}.db`);

  try {
    const resp = await fetch(parsed.toString(), { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      return res.status(502).json({ ok: false, message: `خطا در دریافت فایل از لینک (HTTP ${resp.status}).` });
    }
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return res.status(400).json({
        ok: false,
        message: 'لینک Google Drive یا سرور مقصد خصوصی است یا صفحه وب برگرداند. لطفاً دسترسی لینک را عمومی کنید یا فایل را دانلود و از گزینه انتخاب فایل ایمپورت کنید.',
      });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(tempFile, buf);

    const result = db.restoreDatabaseFromFile(tempFile);
    broadcastEvent('patients_changed', { action: 'restore' });
    broadcastEvent('setup_changed', db.getSetupState() as unknown as Record<string, unknown>);
    return res.json({
      ok: true,
      patientCount: result.patientCount,
      message: `دیتابیس از لینک با موفقیت ایمپورت شد (${result.patientCount} پرونده بیمار).`,
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: err instanceof Error ? err.message : 'خطا در ایمپورت دیتابیس از لینک',
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

// --- Git Self-Update ---
app.get('/api/update/status', async (_req, res) => {
  const status = await getGitStatus();
  res.json(status);
});

app.post('/api/update/apply', async (_req, res) => {
  const result = await applyGitUpdate();
  res.json(result);

  if (result.ok && result.updated) {
    setTimeout(() => {
      process.exit(42);
    }, 1000);
  }
});

function openStandaloneWindow(url: string) {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  const exe = candidates.find((p) => fs.existsSync(p));
  if (exe) {
    const child = spawn(
      exe,
      [`--app=${url}`, '--window-size=1280,820', '--disable-features=Translate'],
      {
        detached: true,
        stdio: 'ignore',
      }
    );
    child.unref();
    return;
  }

  const child = spawn('cmd', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export function startServer(port = PORT): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => {
      const ips = getLanIps();
      console.log('====================================================');
      console.log('  Clinic Manager - Dr. Bahamin Jahanian');
      console.log(`  Local:   http://localhost:${port}`);
      for (const ip of ips) {
        console.log(`  Network: http://${ip}:${port}`);
      }
      console.log('====================================================');

      if (process.argv.includes('--open')) {
        openStandaloneWindow(`http://localhost:${port}`);
      }

      resolve({
        port,
        close: () => server.close(),
      });
    });

    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer(PORT).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
