import React, { useEffect, useState } from 'react';
import { Download, GitBranch, RefreshCw } from 'lucide-react';
import type { GitUpdateStatus } from '../../../shared/types';
import { useAppStore } from '../../store/useAppStore';
import { toPersianDigits } from '../../utils/clinicHelpers';

export function UpdateTab() {
  const notify = useAppStore((s) => s.notify);
  const [gitStatus, setGitStatus] = useState<GitUpdateStatus>({
    ok: true,
    hasRemote: false,
    commit: '...',
    branch: 'main',
    message: 'در حال بررسی...',
    behind: 0,
  });
  const [downloadState, setDownloadState] = useState<{
    status: 'idle' | 'downloading' | 'done' | 'error';
    percent: number;
    filePath?: string;
    message?: string;
  }>({ status: 'idle', percent: 0 });

  useEffect(() => {
    refreshGitStatus();
    if (!window.clinicDesktop?.onDownloadProgress) return;
    return window.clinicDesktop.onDownloadProgress((payload) => {
      setDownloadState({
        status: payload.status,
        percent: payload.percent,
        filePath: payload.filePath,
        message: payload.message,
      });
    });
  }, []);

  async function refreshGitStatus() {
    try {
      const res = await fetch('/api/update/status');
      const data = await res.json();
      setGitStatus(data);
    } catch {
      notify('خطا در بررسی وضعیت بروزرسانی');
    }
  }

  async function applyGitUpdate() {
    setGitStatus((s) => ({ ...s, message: 'در حال دریافت بروزرسانی از گیت‌هاب...' }));
    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      setGitStatus((s) => ({ ...s, message: data.message }));
      if (data.ok && data.updated) {
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch {
      notify('خطا در دریافت بروزرسانی');
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h4 className="text-sm font-bold">بروزرسانی برنامه از GitHub</h4>
        </div>
        <span className="text-[11px] font-mono bg-white text-slate-700 px-2 py-0.5 rounded-lg border">
          {gitStatus.commit ? `${gitStatus.branch || 'main'} @ ${gitStatus.commit}` : 'local'}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)' }} className="text-xs">{gitStatus.message}</p>

      {downloadState.status === 'downloading' && (
        <div className="space-y-1.5">
          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
            <div style={{ width: `${downloadState.percent}%`, backgroundColor: 'var(--accent)' }} className="h-full transition-all" />
          </div>
          <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
            در حال دانلود مستقیم نسخه جدید: {toPersianDigits(downloadState.percent)}٪
          </p>
        </div>
      )}

      {downloadState.status === 'error' && (
        <p className="text-xs text-rose-600 font-medium">خطا در دانلود: {downloadState.message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={refreshGitStatus} className="px-3.5 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" />
          بررسی مجدد
        </button>
        {gitStatus.isPackagedApp && gitStatus.downloadUrl && window.clinicDesktop?.downloadUpdate ? (
          downloadState.status === 'done' && downloadState.filePath ? (
            <button
              onClick={() => window.clinicDesktop?.installDownloadedUpdate(downloadState.filePath!)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              نصب نسخه جدید ({gitStatus.latestTag})
            </button>
          ) : (
            <button
              disabled={downloadState.status === 'downloading'}
              onClick={() => {
                setDownloadState({ status: 'downloading', percent: 1 });
                window.clinicDesktop?.downloadUpdate(gitStatus.downloadUrl!, gitStatus.assetName || 'Clinic-Manager-Update');
              }}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadState.status === 'downloading'
                ? 'در حال دانلود...'
                : `دانلود مستقیم ${gitStatus.latestTag || 'نسخه جدید'}`}
            </button>
          )
        ) : gitStatus.isPackagedApp && gitStatus.releaseUrl ? (
          <a
            href={gitStatus.releaseUrl}
            target="_blank"
            rel="noreferrer"
            style={{ backgroundColor: 'var(--accent)' }}
            className="px-4 py-2 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            صفحه دانلود نسخه جدید
          </a>
        ) : (
          gitStatus.ok &&
          gitStatus.behind > 0 && (
            <button onClick={applyGitUpdate} style={{ backgroundColor: 'var(--accent)' }} className="px-4 py-2 rounded-xl text-white text-xs font-semibold">
              دریافت و نصب بروزرسانی
            </button>
          )
        )}
      </div>
    </div>
  );
}
