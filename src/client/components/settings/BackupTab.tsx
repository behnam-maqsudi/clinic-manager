import React, { useEffect, useState } from 'react';
import { Database, Download, History, Link2, Loader2, RotateCcw, Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { usePatientsStore } from '../../store/usePatientsStore';
import { useMessagesStore } from '../../store/useMessagesStore';
import { toPersianDigits } from '../../utils/clinicHelpers';
import { logUiEvent } from '../../utils/debugLogger';

interface ServerBackupItem {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export function BackupTab() {
  const notify = useAppStore((s) => s.notify);
  const loadSetupState = useAppStore((s) => s.loadSetupState);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const fetchMessages = useMessagesStore((s) => s.fetchMessages);

  const [backupMessage, setBackupMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [serverBackups, setServerBackups] = useState<ServerBackupItem[]>([]);

  async function loadServerBackups() {
    try {
      const res = await fetch('/api/backup/list');
      const data = await res.json();
      if (data.ok) {
        setServerBackups(data.backups || []);
      }
    } catch { }
  }

  useEffect(() => {
    loadServerBackups();
  }, []);

  async function refreshAfterRestore(message: string) {
    setBackupMessage(message);
    setImportError('');
    notify(message);
    await Promise.all([fetchPatients(), fetchMessages(), loadSetupState(), loadServerBackups()]);
  }

  async function createServerBackup() {
    logUiEvent('BackupTab', 'create_server_backup');
    setImportError('');
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' });
      const data = await res.json();
      setBackupMessage(data.message || '');
      loadServerBackups();
    } catch {
      notify('خطا در ایجاد نسخه پشتیبان');
    }
  }

  async function handleFileImport(files: FileList | null) {
    const file = files?.[0];
    if (!file || importing) return;
    if (!confirm('با ایمپورت فایل جدید، یک بکاپ خودکار از دیتابیس فعلی ذخیره شده و اطلاعات جایگزین می‌شود. ادامه می‌دهید؟')) {
      return;
    }

    setImporting(true);
    setImportError('');
    setBackupMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/backup/restore', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImportError(data.message || 'خطا در ایمپورت فایل');
        return;
      }
      await refreshAfterRestore(data.message);
    } catch {
      setImportError('خطا در ارتباط با سرور هنگام ایمپورت فایل');
    } finally {
      setImporting(false);
    }
  }

  async function handleUrlImport(e: React.FormEvent) {
    e.preventDefault();
    const clean = driveUrl.trim();
    if (!clean || importing) return;
    if (!confirm('با ایمپورت از لینک، یک بکاپ خودکار از دیتابیس فعلی ذخیره شده و اطلاعات جایگزین می‌شود. ادامه می‌دهید؟')) {
      return;
    }

    setImporting(true);
    setImportError('');
    setBackupMessage('');
    try {
      const res = await fetch('/api/backup/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImportError(data.message || 'خطا در ایمپورت از لینک');
        return;
      }
      setDriveUrl('');
      await refreshAfterRestore(data.message);
    } catch {
      setImportError('خطا در ارتباط با سرور هنگام دانلود از لینک');
    } finally {
      setImporting(false);
    }
  }

  async function restoreFromServer(fileName: string) {
    if (importing) return;
    if (!confirm(`نسخه «${fileName}» بازیابی شود؟ (از دیتابیس فعلی بکاپ خودکار گرفته می‌شود)`)) return;

    setImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/backup/restore-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setImportError(data.message || 'خطا در بازیابی بکاپ');
        return;
      }
      await refreshAfterRestore(data.message);
    } catch {
      setImportError('خطا در بازیابی بکاپ');
    } finally {
      setImporting(false);
    }
  }

  return (
        <div className="space-y-4">
          {/* Export / Create Backup */}
          <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h4 className="text-sm font-bold">پشتیبان‌گیری از دیتابیس</h4>
            </div>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs">
              می‌توانید یک نسخه پشتیبان روی سرور ذخیره کنید یا فایل دیتابیس را مستقیماً دانلود کنید.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={createServerBackup} className="px-3.5 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold">
                ذخیره بکاپ در سرور
              </button>
              <a href="/api/backup/download" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                دانلود فایل دیتابیس
              </a>
            </div>
          </div>

            {/* Import / Restore from File or Google Drive */}
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h4 className="text-sm font-bold">ایمپورت و بازیابی دیتابیس</h4>
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px] leading-5">
                فایل بکاپ (<code dir="ltr">.db</code>) را از سیستم یا پوشه همگام‌سازی‌شده Google Drive انتخاب کنید، یا لینک مستقیم فایل در Google Drive را وارد کنید.
              </p>

              <label
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-3 px-4 text-xs font-semibold cursor-pointer hover:opacity-90"
              >
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  disabled={importing}
                  className="hidden"
                  onChange={(e) => {
                    handleFileImport(e.target.files);
                    e.target.value = '';
                  }}
                />
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
                <span>{importing ? 'در حال ایمپورت...' : 'انتخاب فایل بکاپ از سیستم یا Google Drive (.db)'}</span>
              </label>

              <form onSubmit={handleUrlImport} className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="url"
                    dir="ltr"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                    className="w-full rounded-xl border pr-8 pl-3 py-2 text-xs font-mono text-left focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!driveUrl.trim() || importing}
                  style={{ backgroundColor: 'var(--accent)' }}
                  className="px-3.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                >
                  ایمپورت از لینک
                </button>
              </form>

              {backupMessage && <p className="text-xs text-emerald-600 font-semibold">{backupMessage}</p>}
              {importError && <p className="text-xs text-rose-600 font-semibold">{importError}</p>}
            </div>

            {/* Server Backups List */}
            {serverBackups.length > 0 && (
              <div style={{ borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h4 className="text-xs font-bold">بکاپ‌های ذخیره‌شده روی سرور ({toPersianDigits(serverBackups.length)})</h4>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {serverBackups.slice(0, 6).map((b) => (
                    <div
                      key={b.name}
                      style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] truncate" dir="ltr">{b.name}</p>
                        <p style={{ color: 'var(--text-muted)' }} className="text-[10px]">
                          {toPersianDigits(Math.max(1, Math.round(b.sizeBytes / 1024)))} کیلوبایت
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() => restoreFromServer(b.name)}
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                        className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-80 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        بازیابی
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
}
