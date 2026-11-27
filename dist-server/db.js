"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOADS_DIR = void 0;
exports.normalizeDigits = normalizeDigits;
exports.listPatients = listPatients;
exports.getPatientById = getPatientById;
exports.createPatient = createPatient;
exports.updatePatient = updatePatient;
exports.lookupReturningPatients = lookupReturningPatients;
exports.createPatientsBulk = createPatientsBulk;
exports.deletePatient = deletePatient;
exports.listAttachments = listAttachments;
exports.getAttachmentById = getAttachmentById;
exports.addAttachment = addAttachment;
exports.deleteAttachment = deleteAttachment;
exports.createBackup = createBackup;
exports.getDbPath = getDbPath;
exports.listBackups = listBackups;
exports.restoreDatabaseFromFile = restoreDatabaseFromFile;
exports.getBackupFilePath = getBackupFilePath;
exports.listMessages = listMessages;
exports.createMessage = createMessage;
exports.markMessagesRead = markMessagesRead;
exports.getSetupState = getSetupState;
exports.completeSetup = completeSetup;
exports.verifyDoctorPin = verifyDoctorPin;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_sqlite_1 = require("node:sqlite");
const DATA_DIR = process.env.CLINIC_DATA_DIR
    ? node_path_1.default.resolve(process.env.CLINIC_DATA_DIR)
    : node_path_1.default.join(__dirname, '..', 'data');
const BACKUP_DIR = node_path_1.default.join(DATA_DIR, 'backups');
exports.UPLOADS_DIR = node_path_1.default.join(DATA_DIR, 'uploads');
const DB_PATH = node_path_1.default.join(DATA_DIR, 'clinic.db');
node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
node_fs_1.default.mkdirSync(BACKUP_DIR, { recursive: true });
node_fs_1.default.mkdirSync(exports.UPLOADS_DIR, { recursive: true });
function initSchema(database) {
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
    const columns = database.prepare('PRAGMA table_info(patients)').all();
    if (!columns.some((col) => col.name === 'file_number')) {
        database.exec("ALTER TABLE patients ADD COLUMN file_number TEXT NOT NULL DEFAULT '';");
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_patients_file_number ON patients(file_number);');
}
function openDatabase() {
    const database = new node_sqlite_1.DatabaseSync(DB_PATH);
    initSchema(database);
    return database;
}
let db = openDatabase();
function normalizeDigits(value) {
    if (!value)
        return '';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    return String(value)
        .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
        .trim();
}
const VALID_STATUSES = ['waiting', 'in_progress', 'visited', 'cancelled'];
function normalizeStatus(value, fallback = 'waiting') {
    return typeof value === 'string' && VALID_STATUSES.includes(value)
        ? value
        : fallback;
}
function listPatients({ q = '', date = '', dateFrom = '', dateTo = '', status = '', } = {}) {
    const conditions = [];
    const params = [];
    if (dateFrom && dateTo) {
        conditions.push('p.visit_date >= ? AND p.visit_date <= ?');
        params.push(dateFrom, dateTo);
    }
    else if (dateFrom) {
        conditions.push('p.visit_date = ?');
        params.push(dateFrom);
    }
    else if (date && date !== 'all') {
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
    return db.prepare(sql).all(...params);
}
function getPatientById(id) {
    return db
        .prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM attachments a WHERE a.patient_id = p.id) AS attachment_count
      FROM patients p
      WHERE p.id = ?
    `)
        .get(Number(id));
}
function createPatient(payload) {
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
    const createdBy = payload.created_by === 'doctor' ? 'doctor' : 'secretary';
    const result = db
        .prepare(`
      INSERT INTO patients (file_number, full_name, phone, national_id, visit_date, visit_time, status, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(fileNumber, fullName, phone, nationalId, visitDate, visitTime, status, notes, createdBy, now, now);
    return getPatientById(Number(result.lastInsertRowid));
}
function updatePatient(id, payload) {
    const existing = getPatientById(id);
    if (!existing) {
        return null;
    }
    if (payload.expected_updated_at && existing.updated_at !== payload.expected_updated_at) {
        const err = new Error('اطلاعات این پرونده هم‌زمان تغییر کرده است. لطفاً پنجره را ببندید و دوباره باز کنید.');
        err.statusCode = 409;
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
    return getPatientById(id);
}
function lookupReturningPatients(q = '') {
    const normalized = normalizeDigits(q);
    if (!normalized || normalized.length < 2)
        return [];
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
        .all(like, like, like, like);
}
function createPatientsBulk(items = [], defaultDate = '', createdBy = 'secretary') {
    const now = new Date().toISOString();
    const fallbackDate = defaultDate || now.slice(0, 10);
    const insertStmt = db.prepare(`
    INSERT INTO patients (file_number, full_name, phone, national_id, visit_date, visit_time, status, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const created = [];
    db.exec('BEGIN');
    try {
        for (const item of items) {
            const fullName = String(item.full_name || '').trim();
            if (!fullName)
                continue;
            const fileNumber = normalizeDigits(item.file_number || '');
            const phone = normalizeDigits(item.phone || '');
            const nationalId = normalizeDigits(item.national_id || '');
            const visitDate = String(item.visit_date || fallbackDate).trim();
            const visitTime = normalizeDigits(item.visit_time || '');
            const status = normalizeStatus(item.status, 'waiting');
            const notes = String(item.notes || '').trim();
            const role = createdBy === 'doctor' ? 'doctor' : 'secretary';
            const res = insertStmt.run(fileNumber, fullName, phone, nationalId, visitDate, visitTime, status, notes, role, now, now);
            created.push(Number(res.lastInsertRowid));
        }
        db.exec('COMMIT');
    }
    catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
    return created;
}
function deletePatient(id) {
    const existing = getPatientById(id);
    if (!existing)
        return false;
    const attachments = listAttachments(id);
    for (const att of attachments) {
        const filePath = node_path_1.default.join(exports.UPLOADS_DIR, String(id), att.stored_name);
        if (node_fs_1.default.existsSync(filePath)) {
            node_fs_1.default.unlinkSync(filePath);
        }
    }
    const patientUploadDir = node_path_1.default.join(exports.UPLOADS_DIR, String(id));
    if (node_fs_1.default.existsSync(patientUploadDir)) {
        node_fs_1.default.rmSync(patientUploadDir, { recursive: true, force: true });
    }
    db.prepare('DELETE FROM patients WHERE id = ?').run(Number(id));
    return true;
}
function listAttachments(patientId) {
    return db
        .prepare('SELECT * FROM attachments WHERE patient_id = ? ORDER BY id DESC')
        .all(Number(patientId));
}
function getAttachmentById(attachmentId) {
    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(attachmentId));
}
function addAttachment(input) {
    const now = new Date().toISOString();
    const result = db
        .prepare(`
      INSERT INTO attachments (patient_id, original_name, stored_name, mime_type, size_bytes, title, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(Number(input.patientId), input.originalName, input.storedName, input.mimeType || 'application/octet-stream', Number(input.sizeBytes) || 0, String(input.title || '').trim(), String(input.uploadedBy || 'secretary'), now);
    return getAttachmentById(Number(result.lastInsertRowid));
}
function deleteAttachment(attachmentId) {
    const att = getAttachmentById(attachmentId);
    if (!att)
        return false;
    const filePath = node_path_1.default.join(exports.UPLOADS_DIR, String(att.patient_id), att.stored_name);
    if (node_fs_1.default.existsSync(filePath)) {
        node_fs_1.default.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM attachments WHERE id = ?').run(Number(attachmentId));
    return true;
}
function createBackup() {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = node_path_1.default.join(BACKUP_DIR, `clinic-${stamp}.db`);
    node_fs_1.default.copyFileSync(DB_PATH, backupFile);
    const files = node_fs_1.default
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('clinic-') && f.endsWith('.db'))
        .sort()
        .reverse();
    for (const oldFile of files.slice(20)) {
        node_fs_1.default.unlinkSync(node_path_1.default.join(BACKUP_DIR, oldFile));
    }
    return backupFile;
}
function getDbPath() {
    db.exec('PRAGMA wal_checkpoint(PASSIVE);');
    return DB_PATH;
}
function listBackups() {
    if (!node_fs_1.default.existsSync(BACKUP_DIR))
        return [];
    return node_fs_1.default
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('clinic-') && f.endsWith('.db'))
        .sort()
        .reverse()
        .map((name) => {
        const stat = node_fs_1.default.statSync(node_path_1.default.join(BACKUP_DIR, name));
        return {
            name,
            sizeBytes: stat.size,
            createdAt: stat.mtime.toISOString(),
        };
    });
}
function restoreDatabaseFromFile(sourcePath) {
    if (!node_fs_1.default.existsSync(sourcePath)) {
        throw new Error('فایل بکاپ پیدا نشد.');
    }
    const header = Buffer.alloc(16);
    const fd = node_fs_1.default.openSync(sourcePath, 'r');
    try {
        node_fs_1.default.readSync(fd, header, 0, 16, 0);
    }
    finally {
        node_fs_1.default.closeSync(fd);
    }
    if (!header.toString('utf8').startsWith('SQLite format 3')) {
        throw new Error('فایل انتخاب‌شده یک دیتابیس معتبر SQLite نیست.');
    }
    // Validate schema before replacing live DB
    const probe = new node_sqlite_1.DatabaseSync(sourcePath, { readOnly: true });
    let patientCount = 0;
    try {
        const tbl = probe
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'")
            .get();
        if (!tbl?.name) {
            throw new Error('این فایل متعلق به سامانه مطب نیست (جدول بیماران یافت نشد).');
        }
        const countRow = probe.prepare('SELECT COUNT(*) AS cnt FROM patients').get();
        patientCount = Number(countRow?.cnt || 0);
    }
    finally {
        probe.close();
    }
    // Save safety backup of current DB first
    createBackup();
    db.close();
    try {
        for (const suffix of ['-wal', '-shm']) {
            const walPath = `${DB_PATH}${suffix}`;
            if (node_fs_1.default.existsSync(walPath))
                node_fs_1.default.unlinkSync(walPath);
        }
        node_fs_1.default.copyFileSync(sourcePath, DB_PATH);
    }
    finally {
        db = openDatabase();
    }
    return { patientCount };
}
function getBackupFilePath(fileName) {
    const safe = node_path_1.default.basename(fileName);
    if (!safe.startsWith('clinic-') || !safe.endsWith('.db'))
        return null;
    const full = node_path_1.default.join(BACKUP_DIR, safe);
    return node_fs_1.default.existsSync(full) ? full : null;
}
function hydrateMessage(row) {
    let meta = {};
    try {
        meta = JSON.parse(row.meta_json || '{}');
    }
    catch {
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
function listMessages(limit = 60) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
    const rows = db
        .prepare('SELECT * FROM clinic_messages ORDER BY id DESC LIMIT ?')
        .all(safeLimit);
    return rows.reverse().map(hydrateMessage);
}
function createMessage(input) {
    const body = String(input.body || '').trim();
    if (!body) {
        throw new Error('متن پیام نمی‌تواند خالی باشد.');
    }
    const senderRole = input.sender_role === 'doctor' || input.sender_role === 'system' ? input.sender_role : 'secretary';
    const recipientRole = input.recipient_role === 'doctor' || input.recipient_role === 'secretary' ? input.recipient_role : 'all';
    const kind = input.kind === 'connection_invite' ? 'connection_invite' : 'chat';
    const metaJson = JSON.stringify(input.meta || {});
    const now = new Date().toISOString();
    const res = db
        .prepare(`INSERT INTO clinic_messages (sender_role, recipient_role, body, kind, meta_json, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?)`)
        .run(senderRole, recipientRole, body, kind, metaJson, now);
    const created = db
        .prepare('SELECT * FROM clinic_messages WHERE id = ?')
        .get(Number(res.lastInsertRowid));
    return hydrateMessage(created);
}
function markMessagesRead(role) {
    const now = new Date().toISOString();
    const res = db
        .prepare(`UPDATE clinic_messages
       SET read_at = ?
       WHERE read_at = '' AND (recipient_role = ? OR recipient_role = 'all') AND sender_role != ?`)
        .run(now, role, role);
    return Number(res.changes || 0);
}
function getSetting(key) {
    const row = db.prepare('SELECT value FROM clinic_settings WHERE key = ?').get(key);
    return row?.value || '';
}
function setSetting(key, value) {
    db.prepare('INSERT INTO clinic_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
function hashPin(pin, salt) {
    const useSalt = salt || node_crypto_1.default.randomBytes(16).toString('hex');
    const derived = node_crypto_1.default.scryptSync(pin, useSalt, 32).toString('hex');
    return `${useSalt}:${derived}`;
}
function getSetupState() {
    const setupCompleted = getSetting('setup_completed') === 'true';
    const rawRole = getSetting('primary_role');
    const primaryRole = rawRole === 'doctor' || rawRole === 'secretary' ? rawRole : null;
    const hasDoctorPin = Boolean(getSetting('doctor_pin_hash'));
    return { setupCompleted, primaryRole, hasDoctorPin };
}
function completeSetup(input) {
    const pin = String(input.doctorPin || '').trim();
    if (pin.length < 4) {
        throw new Error('رمز عبور پزشک باید حداقل ۴ کاراکتر باشد.');
    }
    const role = input.primaryRole === 'secretary' ? 'secretary' : 'doctor';
    setSetting('primary_role', role);
    setSetting('doctor_pin_hash', hashPin(pin));
    setSetting('setup_completed', 'true');
    return getSetupState();
}
function verifyDoctorPin(pin) {
    const stored = getSetting('doctor_pin_hash');
    if (!stored)
        return false;
    const [salt, expectedHex] = stored.split(':');
    if (!salt || !expectedHex)
        return false;
    const actualHex = node_crypto_1.default.scryptSync(String(pin || '').trim(), salt, 32).toString('hex');
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(actualHex, 'hex');
    return a.length === b.length && node_crypto_1.default.timingSafeEqual(a, b);
}
