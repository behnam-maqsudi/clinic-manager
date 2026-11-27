import React, { useState } from 'react';
import { Loader2, Radar, Send, Wifi, WifiOff } from 'lucide-react';
import type { DiscoveredPeer, UserRole } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { toPersianDigits } from '../utils/clinicHelpers';
import { sendClientLog } from '../utils/debugLogger';

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
  activeRemoteUrl,
  onDisconnectRemote,
  notify,
}: NetworkConnectSectionProps) {
  const devMode = useAppStore((s) => s.devMode);
  const setupState = useAppStore((s) => s.setupState);
  const connectedPeerIps = useAppStore((s) => s.connectedPeerIps);
  const devNetworkOffline = useAppStore((s) => s.devNetworkOffline);
  const setDevNetworkOffline = useAppStore((s) => s.setDevNetworkOffline);

  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<DiscoveredPeer[] | null>(null);
  const [sendingUrl, setSendingUrl] = useState<string | null>(null);

  const isPrimaryHost = !activeRemoteUrl && setupState.setupCompleted;
  const scanButtonLabel = isPrimaryHost ? 'اضافه کردن سیستم منشی' : 'جستجوی سیستم اصلی';

  async function scanNetwork() {
    if (scanning) return;
    if (devNetworkOffline) {
      setPeers([]);
      notify('شبکه در حالت تست DEV قطع است — دستگاهی پیدا نشد.');
      return;
    }
    setScanning(true);
    sendClientLog('NETWORK_UI', 'scanNetwork started', { isPrimaryHost });
    try {
      const res = await fetch('/api/network/discover');
      const data = await res.json();
      if (res.ok && data.ok) {
        setPeers(data.peers || []);
        sendClientLog('NETWORK_UI', 'scanNetwork result', { count: (data.peers || []).length, peers: data.peers });
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

  async function sendConnectionRequest(peerUrl: string) {
    if (sendingUrl) return;
    setSendingUrl(peerUrl);
    const requestType = isPrimaryHost ? 'host_invite' : 'join_request';
    const message = isPrimaryHost
      ? 'دعوت اتصال از طرف سیستم اصلی مطب'
      : 'درخواست اتصال از طرف سیستم منشی';
    try {
      const res = await fetch('/api/network/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: peerUrl,
          fromRole: role,
          senderClientId: clientId,
          requestType,
          message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        notify(isPrimaryHost ? 'دعوت اتصال ارسال شد.' : 'درخواست اتصال به سیستم اصلی ارسال شد. منتظر تأیید بمانید.');
      } else {
        notify(data.message || 'خطا در ارسال درخواست اتصال');
      }
    } catch {
      notify('عدم دسترسی به دستگاه مقصد');
    } finally {
      setSendingUrl(null);
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
        ) : isPrimaryHost ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold" style={{ color: 'var(--accent)' }}>
              این دستگاه سیستم اصلی مطب است
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold tabular-nums">
              {connectedPeerIps.length > 0
                ? `${toPersianDigits(connectedPeerIps.length)} دستگاه متصل`
                : 'بدون دستگاه متصل'}
            </span>
          </div>
        ) : (
          <span className="font-bold" style={{ color: 'var(--accent)' }}>
            آماده اتصال به سیستم اصلی
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)' }} className="text-[11px] leading-5">
        {isPrimaryHost
          ? 'این دستگاه سیستم اصلی مطب است. برای اضافه کردن سیستم منشی یا دستگاه جدید، دکمه «اضافه کردن سیستم منشی» را بزنید.'
          : 'برای وصل شدن به سیستم اصلی مطب، دکمه «جستجوی سیستم اصلی» را بزنید و درخواست اتصال بفرستید تا سیستم پزشک آن را تأیید کند.'}
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

      {peers !== null && (
        <div className="space-y-2 pt-1">
          {peers.filter((p) => !p.isSelf).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
              هیچ دستگاه دیگری در شبکه پیدا نشد. مطمئن شوید هر دو دستگاه به یک وای‌فای وصل هستند.
            </p>
          ) : (
            peers
              .filter((p) => !p.isSelf)
              .map((peer) => {
                const isPeerConnected = Boolean(peer.isConnected || connectedPeerIps.includes(peer.ip));
                const isSending = sendingUrl === peer.url;
                return (
                  <div
                    key={peer.url}
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                    className="rounded-xl border p-2.5 flex items-center justify-between gap-2 flex-wrap"
                  >
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold truncate">{peer.hostname}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                          isPeerConnected
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : peer.isSetupCompleted
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-sky-50 text-sky-700 border border-sky-200'
                        }`}
                      >
                        {isPeerConnected ? 'متصل شد ✓' : peer.isSetupCompleted ? 'سیستم اصلی' : 'آماده اتصال'}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() => sendConnectionRequest(peer.url)}
                      style={{ backgroundColor: 'var(--accent)' }}
                      className="px-3 py-1.5 rounded-lg text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      <Send className="w-3 h-3" />
                      {isSending
                        ? 'در حال ارسال...'
                        : isPrimaryHost
                          ? 'دعوت به اتصال'
                          : 'درخواست اتصال'}
                    </button>
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
