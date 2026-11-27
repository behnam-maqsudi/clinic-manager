import React, { useState } from 'react';
import { Check, Loader2, Radar, Send, Wifi, WifiOff } from 'lucide-react';
import type { DiscoveredPeer, UserRole } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';

interface NetworkConnectSectionProps {
  role: UserRole;
  clientId: string;
  isElectron: boolean;
  remoteUrlInput: string;
  setRemoteUrlInput: (val: string) => void;
  activeRemoteUrl: string;
  onConnectUrl: (url: string) => void;
  onDisconnectRemote: () => void;
  notify: (msg: string) => void;
}

export function NetworkConnectSection({
  role,
  clientId,
  isElectron,
  remoteUrlInput,
  setRemoteUrlInput,
  activeRemoteUrl,
  onConnectUrl,
  onDisconnectRemote,
  notify,
}: NetworkConnectSectionProps) {
  const devMode = useAppStore((s) => s.devMode);
  const devNetworkOffline = useAppStore((s) => s.devNetworkOffline);
  const setDevNetworkOffline = useAppStore((s) => s.setDevNetworkOffline);

  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<DiscoveredPeer[] | null>(null);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const isPrimaryHost = !activeRemoteUrl && role === 'doctor';
  const scanButtonLabel = isPrimaryHost ? 'جستجوی دستگاه‌ها' : 'جستجوی سیستم اصلی';

  async function scanNetwork() {
    if (scanning) return;
    if (devNetworkOffline) {
      setPeers([]);
      notify('شبکه در حالت تست DEV قطع است — دستگاهی پیدا نشد.');
      return;
    }
    setScanning(true);
    try {
      const res = await fetch('/api/network/discover');
      const data = await res.json();
      if (res.ok && data.ok) {
        setPeers(data.peers || []);
        if ((data.peers || []).length === 0) {
          notify('دستگاه دیگری روی شبکه پیدا نشد.');
        }
      } else {
        notify(data.message || 'خطا در جستجوی شبکه');
      }
    } catch {
      notify('خطا در ارتباط با سرور هنگام جستجوی شبکه');
    } finally {
      setScanning(false);
    }
  }

  async function sendConnectionInvite(peerUrl: string) {
    if (sendingInvite) return;
    setSendingInvite(true);
    try {
      const res = await fetch('/api/network/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: peerUrl,
          fromRole: role,
          senderClientId: clientId,
          message: inviteNote.trim() || 'دعوت به اتصال به سیستم اصلی مطب',
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        notify('دعوت اتصال ارسال شد.');
        setInviteTarget(null);
        setInviteNote('');
      } else {
        notify(data.message || 'خطا در ارسال دعوت اتصال');
      }
    } catch {
      notify('عدم دسترسی به دستگاه مقصد');
    } finally {
      setSendingInvite(false);
    }
  }

  return (
    <div
      style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
      className="rounded-2xl border p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h4 className="text-sm font-bold">
            {isPrimaryHost ? 'دعوت از منشی و دستگاه‌های مطب' : 'اتصال به سیستم اصلی مطب'}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {devMode && (
            <button
              type="button"
              onClick={() => {
                const next = !devNetworkOffline;
                setDevNetworkOffline(next);
                if (next) setPeers([]);
                notify(next ? 'شبیه‌سازی قطع شبکه فعال شد (DEV).' : 'شبکه دوباره وصل شد (DEV).');
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 ${
                devNetworkOffline
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-violet-50 text-violet-700 border-violet-200'
              }`}
            >
              {devNetworkOffline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {devNetworkOffline ? 'وصل مجدد شبکه (DEV)' : 'قطع شبکه (DEV)'}
            </button>
          )}
          <button
            type="button"
            disabled={scanning}
            onClick={scanNetwork}
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)', color: 'var(--accent)' }}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
            {scanning ? 'در حال جستجو...' : scanButtonLabel}
          </button>
        </div>
      </div>

      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-xl border px-3 py-2 text-[11px] flex items-center justify-between gap-2 flex-wrap"
      >
        <span style={{ color: 'var(--text-muted)' }}>وضعیت فعلی:</span>
        {activeRemoteUrl ? (
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
            متصل به سیستم اصلی مطب
          </span>
        ) : (
          <span className="font-bold" style={{ color: 'var(--accent)' }}>
            {isPrimaryHost ? 'این دستگاه سیستم اصلی مطب است' : 'آماده اتصال به سیستم اصلی'}
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)' }} className="text-[11px] leading-5">
        {isPrimaryHost
          ? 'برای وصل کردن کامپیوتر منشی به این سیستم، دکمه «جستجوی دستگاه‌ها» را بزنید و روی «دعوت به اتصال» کلیک کنید.'
          : 'برای وصل شدن به سیستم اصلی مطب، دکمه «جستجوی سیستم اصلی» را بزنید و دستگاه پزشک را انتخاب کنید.'}
      </p>

      {isElectron && activeRemoteUrl && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDisconnectRemote}
            className="px-3 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold"
          >
            قطع اتصال از سیستم اصلی
          </button>
        </div>
      )}

      {isElectron && !isPrimaryHost && (
        <div>
          <button
            type="button"
            onClick={() => setShowManualInput((v) => !v)}
            style={{ color: 'var(--text-muted)' }}
            className="text-[11px] hover:underline"
          >
            {showManualInput ? 'بستن ورود دستی آدرس' : 'ورود دستی آدرس (پیشرفته)'}
          </button>
          {(showManualInput || devMode) && (
            <div className="flex flex-wrap gap-2 mt-2">
              <input
                type="text"
                dir="ltr"
                value={remoteUrlInput}
                onChange={(e) => setRemoteUrlInput(e.target.value)}
                placeholder="http://192.168.8.7:3000"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                className="flex-1 min-w-[180px] rounded-xl border px-3 py-2 text-xs font-mono text-left focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onConnectUrl(remoteUrlInput)}
                style={{ backgroundColor: 'var(--accent)' }}
                className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
              >
                اتصال به سیستم اصلی
              </button>
            </div>
          )}
        </div>
      )}

      {peers !== null && (
        <div className="space-y-2 pt-1">
          {peers.filter((p) => !p.isSelf || devMode).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
              هیچ دستگاه دیگری در شبکه پیدا نشد. مطمئن شوید هر دو دستگاه به یک وای‌فای وصل هستند.
            </p>
          ) : (
            peers
              .filter((p) => !p.isSelf || devMode)
              .map((peer) => (
                <div
                  key={peer.url}
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                  className="rounded-xl border p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold truncate">{peer.hostname}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            peer.isSetupCompleted
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border border-sky-200'
                          }`}
                        >
                          {peer.isSetupCompleted ? 'سیستم اصلی' : 'آماده اتصال'}
                        </span>
                        {peer.isSelf && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            این دستگاه
                          </span>
                        )}
                      </div>
                      {devMode && (
                        <code className="text-[11px] font-mono" style={{ color: 'var(--accent)' }} dir="ltr">
                          {peer.url}
                        </code>
                      )}
                    </div>

                    {!peer.isSelf && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInviteTarget(inviteTarget === peer.url ? null : peer.url)}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          دعوت به اتصال
                        </button>
                        {!isPrimaryHost && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoteUrlInput(peer.url);
                              onConnectUrl(peer.url);
                            }}
                            style={{ backgroundColor: 'var(--accent)' }}
                            className="px-2.5 py-1.5 rounded-lg text-white text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            اتصال
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {inviteTarget === peer.url && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        value={inviteNote}
                        onChange={(e) => setInviteNote(e.target.value)}
                        placeholder="پیام کوتاه (اختیاری)..."
                        style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                        className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={sendingInvite}
                        onClick={() => sendConnectionInvite(peer.url)}
                        style={{ backgroundColor: 'var(--accent)' }}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {sendingInvite ? '...' : 'ارسال دعوت'}
                      </button>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
