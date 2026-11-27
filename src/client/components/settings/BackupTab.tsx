import React, { useState } from 'react';
import { Database, Download } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function BackupTab() {
  const notify = useAppStore((s) => s.notify);
  const [backupMessage, setBackupMessage] = useState('');

  async function createServerBackup() {
    try {
      const res = await fetch('/api/backup/create', { method: 'POST' });
      const data = await res.json();
      setBackupMessage(data.message || '');
    } catch {
      notify('خطا در ایجاد نسخه پشتیبان');
    }
  }

  return (
    <div style={{ borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
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
      {backupMessage && <p className="text-xs text-emerald-600 font-semibold">{backupMessage}</p>}
    </div>
  );
}
