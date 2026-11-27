import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  Attachment,
  ClinicMessage,
  ClinicSetupState,
  MessageKind,
  MessageRecipientRole,
  MessageSenderRole,
  Patient,
  PatientInput,
  PatientStatus,
  ReturningMatch,
  UserRole,
} from './shared/types';

const DATA_DIR = process.env.CLINIC_DATA_DIR
  ? path.resolve(process.env.CLINIC_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'clinic.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function initSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_number TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      national_id TEXT NOT NULL DEFAULT '',
      visit_date TEXT NOT NULL,
      visit_time TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'visited', 'cancelled')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'secretary' CHECK (created_by IN ('secretary', 'doctor')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT 'secretary',
      created_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_patients_visit_date ON patients(visit_date);
    CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
    CREATE INDEX IF NOT EXISTS idx_attachments_patient_id ON attachments(patient_id);

    CREATE TABLE IF NOT EXISTS clinic_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('secretary', 'doctor', 'system')),
      recipient_role TEXT NOT NULL DEFAULT 'all' CHECK (recipient_role IN ('secretary', 'doctor', 'all')),
      body TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'connection_invite')),
      meta_json TEXT NOT NULL DEFAULT '{}',
      read_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clinic_messages_created_at ON clinic_messages(created_at);

    CREATE TABLE IF NOT EXISTS clinic_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const columns = database.prepare('PRAGMA table_info(patients)').all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === 'file_number')) {
    database.exec("ALTER TABLE patients ADD COLUMN file_number TEXT NOT NULL DEFAULT '';");
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_patients_file_number ON patients(file_number);');
}

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(DB_PATH);
  initSchema(database);
  return database;
}

let db = openDatabase();

export function normalizeDigits(value: unknown): string {
  if (!value) return '';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value)
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
    .trim();
}

const VALID_STATUSES: PatientStatus[] = ['waiting', 'in_progress', 'visited', 'cancelled'];

function normalizeStatus(value: unknown, fallback: PatientStatus = 'waiting'): PatientStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as PatientStatus)
    ? (value as PatientStatus)
    : fallback;
}

export function listPatients({
  q = '',
  date = '',
  dateFrom = '',
  dateTo = '',
  status = '',
}: {
  q?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
} = {}): Patient[] {
  const conditions: string[] = [];
  const params: string[] = [];

  if (dateFrom && dateTo) {
    conditions.push('p.visit_date >= ? AND p.visit_date <= ?');
    params.push(dateFrom, dateTo);
  } else if (dateFrom) {
    conditions.push('p.visit_date = ?');
    params.push(dateFrom);
  } else if (date && date !== 'all') {
    conditions.push('p.visit_date = ?');
    params.push(date);
  }

  if (status && status !== 'all') {
    conditions.push('p.status = ?');
    params.push(status);
  }

  const normalizedQuery = normalizeDigits(q);
  if (normalizedQuery) {
    conditions.push('(p.full_name LIKE ? OR p.phone LIKE ? OR p.national_id LIKE ? OR p.file_number LIKE ? OR p.notes LIKE ?)');
    const like = `%${normalizedQuery}%`;
    params.push(like, like, like, like, like);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      p.*,
      (SELECT COUNT(*) FROM attachments a WHERE a.patient_id = p.id) AS attachment_count
    FROM patients p
    ${whereClause}
    ORDER BY
      p.visit_date DESC,
      CASE p.status
        WHEN 'in_progress' THEN 1
        WHEN 'waiting' THEN 2
        WHEN 'visited' THEN 3
        WHEN 'cancelled' THEN 4
      END,
      CASE WHEN p.visit_time = '' THEN 1 ELSE 0 END,
      p.visit_time ASC,
      p.id DESC
  `;

  return db.prepare(sql).all(...params) as unknown as Patient[];
}

export function getPatientById(id: number | string): Patient | undefined {
  return db
    .prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM attachments a WHERE a.patient_id = p.id) AS attachment_count
      FROM patients p
      WHERE p.id = ?
    `)
    .get(Number(id)) as unknown as Patient | undefined;
}

export function createPatient(payload: PatientInput): Patient {
  const now = new Date().toISOString();
  const fullName = String(payload.full_name || '').trim();
  if (!fullName) {
    throw new Error('نام و نام خانوادگی مراجعه‌کننده الزامی است.');
  }

  const fileNumber = normalizeDigits(payload.file_number || '');
  const phone = normalizeDigits(payload.phone || '');
  const nationalId = normalizeDigits(payload.national_id || '');
  const visitDate = String(payload.visit_date || now.slice(0, 10)).trim();
  const visitTime = normalizeDigits(payload.visit_time || '');
  const status = normalizeStatus(payload.status, 'waiting');
  const notes = String(payload.notes || '').trim();
  const createdBy: UserRole = payload.created_by === 'doctor' ? 'doctor' : 'secretary';

  const result = db
    .prepare(`
      INSERT INTO patients (file_number, full_name, phone, national_id, visit_date, visit_time, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(fileNumber, fullName, phone, nationalId, visitDate, visitTime, status, notes, createdBy, now, now);

  return getPatientById(Number(result.lastInsertRowid))!;
}

export function updatePatient(id: number | string, payload: Partial<PatientInput>): Patient | null {
  const existing = getPatientById(id);
  if (!existing) {
    return null;
  }

  if (payload.expected_updated_at && existing.updated_at !== payload.expected_updated_at) {
    const err = new Error('اطلاعات این پرونده هم‌زمان تغییر کرده است. لطفاً پنجره را ببندید و دوباره باز کنید.');
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  const fullName = payload.full_name !== undefined ? String(payload.full_name).trim() : existing.full_name;
  if (!fullName) {
    throw new Error('نام و نام خانوادگی مراجعه‌کننده نمی‌تواند خالی باشد.');
  }

  const fileNumber = payload.file_number !== undefined ? normalizeDigits(payload.file_number) : existing.file_number;
  const phone = payload.phone !== undefined ? normalizeDigits(payload.phone) : existing.phone;
  const nationalId = payload.national_id !== undefined ? normalizeDigits(payload.national_id) : existing.national_id;
  const visitDate = payload.visit_date !== undefined ? String(payload.visit_date).trim() : existing.visit_date;
  const visitTime = payload.visit_time !== undefined ? normalizeDigits(payload.visit_time) : existing.visit_time;
  const status = payload.status !== undefined ? normalizeStatus(payload.status, existing.status) : existing.status;
  const notes = payload.notes !== undefined ? String(payload.notes).trim() : existing.notes;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE patients
    SET file_number = ?, full_name = ?, phone = ?, national_id = ?, visit_date = ?, visit_time = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(fileNumber, fullName, phone, nationalId, visitDate, visitTime, status, notes, updatedAt, Number(id));

  return getPatientById(id)!;
}

export function lookupReturningPatients(q = ''): ReturningMatch[] {
  const normalized = normalizeDigits(q);
  if (!normalized || normalized.length < 2) return [];
  const like = `%${normalized}%`;
  return db
    .prepare(`
      SELECT full_name, phone, national_id, file_number, MAX(id) AS latest_id
      FROM patients
      WHERE full_name LIKE ? OR phone LIKE ? OR national_id LIKE ? OR file_number LIKE ?
      GROUP BY full_name, phone, national_id, file_number
      ORDER BY latest_id DESC
      LIMIT 6
    `)
    .all(like, like, like, like) as unknown as ReturningMatch[];
}

export function createPatientsBulk(
  items: PatientInput[] = [],
  defaultDate = '',
  createdBy: UserRole = 'secretary'
): number[] {
  const now = new Date().toISOString();
  const fallbackDate = defaultDate || now.slice(0, 10);
  const insertStmt = db.prepare(`
    INSERT INTO patients (file_number, full_name, phone, national_id, visit_date, visit_time, status, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const created: number[] = [];
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const fullName = String(item.full_name || '').trim();
      if (!fullName) continue;
      const fileNumber = normalizeDigits(item.file_number || '');
      const phone = normalizeDigits(item.phone || '');
      const nationalId = normalizeDigits(item.national_id || '');
      const visitDate = String(item.visit_date || fallbackDate).trim();
      const visitTime = normalizeDigits(item.visit_time || '');
      const status = normalizeStatus(item.status, 'waiting');
      const notes = String(item.notes || '').trim();
      const role: UserRole = createdBy === 'doctor' ? 'doctor' : 'secretary';

      const res = insertStmt.run(fileNumber, fullName, phone, nationalId, visitDate, visitTime, status, notes, role, now, now);
      created.push(Number(res.lastInsertRowid));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return created;
}

export function deletePatient(id: number | string): boolean {
  const existing = getPatientById(id);
  if (!existing) return false;

  const attachments = listAttachments(id);
  for (const att of attachments) {
    const filePath = path.join(UPLOADS_DIR, String(id), att.stored_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  const patientUploadDir = path.join(UPLOADS_DIR, String(id));
  if (fs.existsSync(patientUploadDir)) {
    fs.rmSync(patientUploadDir, { recursive: true, force: true });
  }

  db.prepare('DELETE FROM patients WHERE id = ?').run(Number(id));
  return true;
}

export function listAttachments(patientId: number | string): Attachment[] {
  return db
    .prepare('SELECT * FROM attachments WHERE patient_id = ? ORDER BY id DESC')
    .all(Number(patientId)) as unknown as Attachment[];
}

export function getAttachmentById(attachmentId: number | string): Attachment | undefined {
  return db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(attachmentId)) as unknown as Attachment | undefined;
}

export function addAttachment(input: {
  patientId: number | string;
  originalName: string;
  storedName: string;
  mimeType?: string;
  sizeBytes?: number;
  title?: string;
  uploadedBy?: string;
}): Attachment {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO attachments (patient_id, original_name, stored_name, mime_type, size_bytes, title, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      Number(input.patientId),
      input.originalName,
      input.storedName,
      input.mimeType || 'application/octet-stream',
      Number(input.sizeBytes) || 0,
      String(input.title || '').trim(),
      String(input.uploadedBy || 'secretary'),
      now
    );

  return getAttachmentById(Number(result.lastInsertRowid))!;
}

export function deleteAttachment(attachmentId: number | string): boolean {
  const att = getAttachmentById(attachmentId);
  if (!att) return false;
  const filePath = path.join(UPLOADS_DIR, String(att.patient_id), att.stored_name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(Number(attachmentId));
  return true;
}

export function createBackup(): string {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `clinic-${stamp}.db`);
  fs.copyFileSync(DB_PATH, backupFile);

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('clinic-') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (const oldFile of files.slice(20)) {
    fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
  }

  return backupFile;
}

export function getDbPath(): string {
  db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  return DB_PATH;
}

export function listBackups(): Array<{ name: string; sizeBytes: number; createdAt: string }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('clinic-') && f.endsWith('.db'))
    .sort()
    .reverse()
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return {
        name,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    });
}

export function restoreDatabaseFromFile(sourcePath: string): { patientCount: number } {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('فایل بکاپ پیدا نشد.');
  }
  const header = Buffer.alloc(16);
  const fd = fs.openSync(sourcePath, 'r');
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.toString('utf8').startsWith('SQLite format 3')) {
    throw new Error('فایل انتخاب‌شده یک دیتابیس معتبر SQLite نیست.');
  }

  // Validate schema before replacing live DB
  const probe = new DatabaseSync(sourcePath, { readOnly: true });
  let patientCount = 0;
  try {
    const tbl = probe
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'")
      .get() as { name?: string } | undefined;
    if (!tbl?.name) {
      throw new Error('این فایل متعلق به سامانه مطب نیست (جدول بیماران یافت نشد).');
    }
    const countRow = probe.prepare('SELECT COUNT(*) AS cnt FROM patients').get() as { cnt: number };
    patientCount = Number(countRow?.cnt || 0);
  } finally {
    probe.close();
  }

  // Save safety backup of current DB first
  createBackup();

  db.close();
  try {
    for (const suffix of ['-wal', '-shm']) {
      const walPath = `${DB_PATH}${suffix}`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    }
    fs.copyFileSync(sourcePath, DB_PATH);
  } finally {
    db = openDatabase();
  }

  return { patientCount };
}

export function getBackupFilePath(fileName: string): string | null {
  const safe = path.basename(fileName);
  if (!safe.startsWith('clinic-') || !safe.endsWith('.db')) return null;
  const full = path.join(BACKUP_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

interface RawMessageRow {
  id: number;
  sender_role: MessageSenderRole;
  recipient_role: MessageRecipientRole;
  body: string;
  kind: MessageKind;
  meta_json: string;
  read_at: string;
  created_at: string;
}

function hydrateMessage(row: RawMessageRow): ClinicMessage {
  let meta: ClinicMessage['meta'] = {};
  try {
    meta = JSON.parse(row.meta_json || '{}');
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    sender_role: row.sender_role,
    recipient_role: row.recipient_role,
    body: row.body,
    kind: row.kind,
    meta,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

export function listMessages(limit = 60): ClinicMessage[] {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
  const rows = db
    .prepare('SELECT * FROM clinic_messages ORDER BY id DESC LIMIT ?')
    .all(safeLimit) as unknown as RawMessageRow[];
  return rows.reverse().map(hydrateMessage);
}

export function createMessage(input: {
  sender_role: MessageSenderRole;
  recipient_role?: MessageRecipientRole;
  body: string;
  kind?: MessageKind;
  meta?: ClinicMessage['meta'];
}): ClinicMessage {
  const body = String(input.body || '').trim();
  if (!body) {
    throw new Error('متن پیام نمی‌تواند خالی باشد.');
  }
  const senderRole: MessageSenderRole =
    input.sender_role === 'doctor' || input.sender_role === 'system' ? input.sender_role : 'secretary';
  const recipientRole: MessageRecipientRole =
    input.recipient_role === 'doctor' || input.recipient_role === 'secretary' ? input.recipient_role : 'all';
  const kind: MessageKind = input.kind === 'connection_invite' ? 'connection_invite' : 'chat';
  const metaJson = JSON.stringify(input.meta || {});
  const now = new Date().toISOString();

  const res = db
    .prepare(
      `INSERT INTO clinic_messages (sender_role, recipient_role, body, kind, meta_json, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?)`
    )
    .run(senderRole, recipientRole, body, kind, metaJson, now);

  const created = db
    .prepare('SELECT * FROM clinic_messages WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as unknown as RawMessageRow;
  return hydrateMessage(created);
}

export function markMessagesRead(role: UserRole): number {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      `UPDATE clinic_messages
       SET read_at = ?
       WHERE read_at = '' AND (recipient_role = ? OR recipient_role = 'all') AND sender_role != ?`
    )
    .run(now, role, role);
  return Number(res.changes || 0);
}

function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM clinic_settings WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value || '';
}

function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO clinic_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function hashPin(pin: string, salt?: string): string {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, useSalt, 32).toString('hex');
  return `${useSalt}:${derived}`;
}

function getAuthSecret(): string {
  let secret = getSetting('auth_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('auth_secret', secret);
  }
  return secret;
}

export function issueDoctorToken(): string {
  const issuedAt = Date.now().toString(36);
  const payload = `doctor.${issuedAt}`;
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyDoctorToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = String(token).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'doctor') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expectedSig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('hex');
  const a = Buffer.from(parts[2], 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function getSetupState(): ClinicSetupState {
  const setupCompleted = getSetting('setup_completed') === 'true';
  const rawRole = getSetting('primary_role');
  const primaryRole: UserRole | null = rawRole === 'doctor' || rawRole === 'secretary' ? rawRole : null;
  const hasDoctorPin = Boolean(getSetting('doctor_pin_hash'));
  return { setupCompleted, primaryRole, hasDoctorPin };
}

export function completeSetup(input: { primaryRole: UserRole; doctorPin?: string }): ClinicSetupState {
  const role: UserRole = input.primaryRole === 'secretary' ? 'secretary' : 'doctor';
  if (role === 'doctor') {
    const pin = String(input.doctorPin || '').trim();
    if (pin.length < 4) {
      throw new Error('رمز عبور پزشک باید حداقل ۴ کاراکتر باشد.');
    }
    setSetting('doctor_pin_hash', hashPin(pin));
  } else {
    db.prepare("DELETE FROM clinic_settings WHERE key = 'doctor_pin_hash'").run();
  }
  setSetting('primary_role', role);
  setSetting('setup_completed', 'true');
  return getSetupState();
}

export function verifyDoctorPin(pin: string): boolean {
  const stored = getSetting('doctor_pin_hash');
  if (!stored) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const actualHex = crypto.scryptSync(String(pin || '').trim(), salt, 32).toString('hex');
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(actualHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function resetSetupState(): ClinicSetupState {
  db.prepare("DELETE FROM clinic_settings WHERE key IN ('setup_completed', 'primary_role', 'doctor_pin_hash')").run();
  return getSetupState();
}
