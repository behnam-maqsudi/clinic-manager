import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';

import * as db from './db';
import { applyGitUpdate, getGitStatus } from './git-updater';
import type { Attachment } from './shared/types';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.use(express.json({ limit: '2mb' }));
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}
app.use(express.static(PUBLIC_DIR));

const sseClients = new Set<Response>();

function broadcastEvent(event: string, data: Record<string, unknown> = {}) {
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

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const patientId = String(Number(req.params.id));
    const dir = path.join(db.UPLOADS_DIR, patientId);
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

// --- SSE Endpoint ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);

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
  });
});

// --- Health & Network Info ---
app.get('/api/health', (_req, res) => {
  const lanIps = getLanIps();
  res.json({
    ok: true,
    clinic: 'مطب دکتر بهامین جهانیان',
    port: PORT,
    lanIps,
    urls: lanIps.map((ip) => `http://${ip}:${PORT}`),
    localUrl: `http://localhost:${PORT}`,
  });
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
      const originalName = Buffer.from(file.originalname || 'file', 'latin1').toString('utf8');
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

// --- Backup ---
app.post('/api/backup/create', (_req, res) => {
  try {
    const file = db.createBackup();
    res.json({ ok: true, file: path.basename(file), message: 'نسخه پشتیبان با موفقیت ذخیره شد.' });
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
