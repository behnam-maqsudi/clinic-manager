import React, { useEffect, useState } from 'react';
import { Copy, Wifi } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { NetworkConnectSection } from '../NetworkConnectSection';

export function NetworkTab() {
  const role = useAppStore((s) => s.role);
  const clientId = useAppStore((s) => s.clientId);
  const notify = useAppStore((s) => s.notify);
  const connectToRemoteUrl = useAppStore((s) => s.connectToRemoteUrl);

  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [activeRemoteUrl, setActiveRemoteUrl] = useState('');

  useEffect(() => {
    if (window.clinicDesktop?.isElectron) {
      window.clinicDesktop
        .getRemoteUrl()
        .then((u) => {
          setActiveRemoteUrl(u || '');
          setRemoteUrlInput(u || '');
        })
        .catch(() => {});
    }
    fetch('/api/health')
      .then((r) => r.json())
      .then((healthData) => {
        setLanUrls(healthData.urls?.length ? healthData.urls : [healthData.localUrl]);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <NetworkConnectSection
        role={role}
        clientId={clientId}
        isElectron={Boolean(window.clinicDesktop?.isElectron)}
        remoteUrlInput={remoteUrlInput}
        setRemoteUrlInput={setRemoteUrlInput}
        activeRemoteUrl={activeRemoteUrl}
        onConnectUrl={connectToRemoteUrl}
        onDisconnectRemote={() => window.clinicDesktop?.setRemoteUrl('')}
        notify={notify}
      />

      {lanUrls.length > 0 && (
        <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h4 className="text-sm font-bold">آدرس این سیستم برای اتصال سایر دستگاه‌ها</h4>
          </div>
          <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
            اگر سیستم دیگری می‌خواهد به دیتابیس این سیستم متصل شود، این آدرس را در آن وارد کنید:
          </p>
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="flex items-center justify-between p-2.5 rounded-xl border">
            <code className="text-xs font-mono font-bold" style={{ color: 'var(--accent)' }} dir="ltr">
              {lanUrls[0]}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(lanUrls[0]);
                notify('آدرس کپی شد.');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              کپی
            </button>
          </div>
        </div>
      )}
    </>
  );
}
