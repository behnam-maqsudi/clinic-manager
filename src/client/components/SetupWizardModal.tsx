import React, { useState } from 'react';
import { Lock, Server, ShieldCheck, Wifi } from 'lucide-react';
import type { ClinicSetupState } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { NetworkConnectSection } from './NetworkConnectSection';

interface SetupWizardModalProps {
  open: boolean;
  onComplete: (state: ClinicSetupState, doctorToken: string) => void;
}

export function SetupWizardModal({ open, onComplete }: SetupWizardModalProps) {
  const clientId = useAppStore((s) => s.clientId);
  const notify = useAppStore((s) => s.notify);
  const connectToRemoteUrl = useAppStore((s) => s.connectToRemoteUrl);

  const [mode, setMode] = useState<'server' | 'client'>('server');
  const [doctorPin, setDoctorPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [secretaryPin, setSecretaryPin] = useState('');
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleServerSetup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const cleanPin = doctorPin.trim();
    if (cleanPin.length < 4) {
      setError('رمز عبور پزشک باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (cleanPin !== confirmPin.trim()) {
      setError('رمز عبور پزشک و تکرار آن یکسان نیستند.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorPin: cleanPin,
          secretaryPin: secretaryPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || 'خطا در راه‌اندازی سرور مطب');
        return;
      }
      onComplete(
        {
          setupCompleted: Boolean(data.setupCompleted),
          hasDoctorPin: Boolean(data.hasDoctorPin),
          hasSecretaryPin: Boolean(data.hasSecretaryPin),
        },
        data.doctorToken || ''
      );
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-wizard-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-2xl border max-w-lg w-full shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center gap-3">
          <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 id="setup-wizard-title" className="font-bold text-base">راه‌اندازی اولیه سامانه مطب</h3>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
              مشخص کنید این دستگاه سیستم اصلی است یا سیستم فرعی
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMode('server');
                setError('');
              }}
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: mode === 'server' ? 'var(--accent)' : 'var(--border-main)',
              }}
              className="p-3 rounded-xl border-2 text-right space-y-1 transition-all"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>این سیستم اصلی است (میزبان مطب)</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                دیتابیس مطب روی این دستگاه ذخیره می‌شود
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('client');
                setError('');
              }}
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: mode === 'client' ? 'var(--accent)' : 'var(--border-main)',
              }}
              className="p-3 rounded-xl border-2 text-right space-y-1 transition-all"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Wifi className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>سیستم فرعی (اتصال به سیستم اصلی)</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                وصل شدن به سیستم اصلی در شبکه
              </p>
            </button>
          </div>

          {mode === 'server' ? (
            <form onSubmit={handleServerSetup} className="space-y-3.5">
              <div className="space-y-2">
                <label className="block text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  رمز عبور پزشک / مدیر (حداقل ۴ کاراکتر) *
                </label>
                <input
                  type="password"
                  dir="ltr"
                  required
                  minLength={4}
                  value={doctorPin}
                  onChange={(e) => setDoctorPin(e.target.value)}
                  placeholder="مثلاً 1234"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                  className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
                />
                <input
                  type="password"
                  dir="ltr"
                  required
                  minLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="تکرار رمز عبور پزشک"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                  className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold">رمز عبور منشی (اختیاری)</label>
                <input
                  type="password"
                  dir="ltr"
                  value={secretaryPin}
                  onChange={(e) => setSecretaryPin(e.target.value)}
                  placeholder="خالی بگذارید اگر منشی بدون رمز وارد شود"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                  className="w-full rounded-xl border px-3 py-2 text-xs text-left font-mono focus:outline-none"
                />
              </div>

              {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: 'var(--accent)' }}
                className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
              >
                {submitting ? 'در حال راه‌اندازی...' : 'راه‌اندازی سیستم اصلی'}
              </button>
            </form>
          ) : (
            <NetworkConnectSection
              role="secretary"
              clientId={clientId}
              isElectron={Boolean(window.clinicDesktop?.isElectron)}
              remoteUrlInput={remoteUrlInput}
              setRemoteUrlInput={setRemoteUrlInput}
              activeRemoteUrl=""
              onConnectUrl={connectToRemoteUrl}
              onDisconnectRemote={() => { }}
              notify={notify}
            />
          )}
        </div>
      </div>
    </div>
  );
}
