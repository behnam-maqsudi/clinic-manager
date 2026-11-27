import React, { useState } from 'react';
import { Check, Loader2, Radar, Send, Wifi } from 'lucide-react';
import type { DiscoveredPeer, UserRole } from '../../shared/types';

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
  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<DiscoveredPeer[] | null>(null);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  async function scanNetwork() {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await fetch('/api/network/discover');
      const data = await res.json();
      if (res.ok && data.ok) {
        setPeers(data.peers || []);
        if ((data.peers || []).length === 0) {
          notify('سیستم دیگری روی شبکه پیدا نشد.');
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
          message: inviteNote.trim() || 'لطفاً به سیستم مطب متصل شوید یا پیام را تأیید کنید.',
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        notify('پیام اتصال به سیستم مقصد ارسال شد.');
        setInviteTarget(null);
        setInviteNote('');
      } else {
        notify(data.message || 'خطا در ارسال پیام اتصال');
      }
    } catch {
      notify('عدم دسترسی به سیستم مقصد');
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
          <h4 className="text-sm font-bold">اتصال این برنامه به سیستم سرور مطب</h4>
        </div>
        <div className="flex items-center gap-2">
          {activeRemoteUrl && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              متصل به سرور
            </span>
          )}
          <button
            type="button"
            disabled={scanning}
            onClick={scanNetwork}
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)', color: 'var(--accent)' }}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
            {scanning ? 'در حال جستجو...' : 'جستجو در شبکه'}
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
        اگر این سیستم (مثلاً مک یا اتاق پزشک) باید به دیتابیس سیستم منشی وصل شود، آدرس نمایش‌داده‌شده در سیستم منشی را وارد کنید یا از دکمه جستجو در شبکه استفاده کنید:
      </p>

      {isElectron && (
        <div className="flex flex-wrap gap-2">
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
            اتصال به سرور
          </button>
          {activeRemoteUrl && (
            <button
              type="button"
              onClick={onDisconnectRemote}
              className="px-3 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold"
            >
              بازگشت به دیتابیس محلی
            </button>
          )}
        </div>
      )}

      {peers !== null && (
        <div className="space-y-2 pt-1">
          {peers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
              هیچ سیستم فعالی روی شبکه داخلی پیدا نشد.
            </p>
          ) : (
            peers.map((peer) => (
              <div
                key={peer.url}
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                className="rounded-xl border p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">{peer.hostname}</span>
                      {peer.isSelf && (
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          این سیستم
                        </span>
                      )}
                    </div>
                    <code className="text-[11px] font-mono" style={{ color: 'var(--accent)' }} dir="ltr">
                      {peer.url}
                    </code>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!peer.isSelf && (
                      <>
                        <button
                          type="button"
                          onClick={() => setInviteTarget(inviteTarget === peer.url ? null : peer.url)}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          پیام اتصال
                        </button>
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
                      </>
                    )}
                  </div>
                </div>

                {inviteTarget === peer.url && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={inviteNote}
                      onChange={(e) => setInviteNote(e.target.value)}
                      placeholder="متن پیام اتصال (اختیاری)..."
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
                      {sendingInvite ? '...' : 'ارسال'}
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
