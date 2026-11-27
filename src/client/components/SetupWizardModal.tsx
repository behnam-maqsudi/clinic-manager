import React, { useState } from 'react';
import { Lock, ShieldCheck, Stethoscope, UserCheck } from 'lucide-react';
import type { ClinicSetupState, UserRole } from '../../shared/types';

interface SetupWizardModalProps {
  open: boolean;
  onComplete: (chosenRole: UserRole, state: ClinicSetupState, doctorToken?: string) => void;
}

export function SetupWizardModal({ open, onComplete }: SetupWizardModalProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('doctor');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (selectedRole === 'doctor') {
      const cleanPin = pin.trim();
      if (cleanPin.length < 4) {
        setError('رمز عبور پزشک باید حداقل ۴ کاراکتر باشد.');
        return;
      }
      if (cleanPin !== confirmPin.trim()) {
        setError('رمز عبور و تکرار آن یکسان نیستند.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryRole: selectedRole,
          ...(selectedRole === 'doctor' ? { doctorPin: pin.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || 'خطا در ذخیره تنظیمات اولیه');
        return;
      }
      onComplete(
        selectedRole,
        {
          setupCompleted: Boolean(data.setupCompleted),
          primaryRole: data.primaryRole || selectedRole,
          hasDoctorPin: Boolean(data.hasDoctorPin),
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
        className="rounded-2xl border max-w-md w-full shadow-2xl overflow-hidden"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center gap-3"
        >
          <div
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 id="setup-wizard-title" className="font-bold text-base">
              راه‌اندازی اولیه سامانه مطب
            </h3>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
              نقش این سیستم را مشخص کنید
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold">۱. نقش این سیستم چیست؟</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole('doctor');
                  setError('');
                }}
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: selectedRole === 'doctor' ? 'var(--accent)' : 'var(--border-main)',
                }}
                className="p-3 rounded-xl border-2 text-right space-y-1 transition-all"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Stethoscope className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>سیستم پزشک</span>
                </div>
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                  سرور اصلی مطب (پیشنهادی)
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole('secretary');
                  setError('');
                }}
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: selectedRole === 'secretary' ? 'var(--accent)' : 'var(--border-main)',
                }}
                className="p-3 rounded-xl border-2 text-right space-y-1 transition-all"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <UserCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>سیستم منشی</span>
                </div>
                <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                  پذیرش و مدیریت نوبت‌ها
                </p>
              </button>
            </div>
          </div>

          {selectedRole === 'doctor' ? (
            <div className="space-y-2.5">
              <label className="block text-xs font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                ۲. تعیین رمز عبور پنل پزشک (حداقل ۴ کاراکتر)
              </label>
              <input
                type="password"
                dir="ltr"
                required
                minLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
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
                placeholder="تکرار رمز عبور"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
              />
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                از این به بعد ورود یا تغییر به نقش پزشک فقط با همین رمز امکان‌پذیر است.
              </p>
            </div>
          ) : (
            <div
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="rounded-xl border p-3 text-[11px] leading-5 space-y-1"
            >
              <p className="font-bold">دسترسی این سیستم فقط در سطح منشی قفل می‌شود.</p>
              <p style={{ color: 'var(--text-muted)' }}>
                در سیستم منشی امکان ساخت رمز پزشک یا ورود به پنل پزشک وجود ندارد. پس از ورود می‌توانید از «تنظیمات ← شبکه و اتصال» به سیستم پزشک متصل شوید.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{ backgroundColor: 'var(--accent)' }}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
          >
            {submitting ? 'در حال ذخیره...' : 'تأیید و شروع کار'}
          </button>
        </form>
      </div>
    </div>
  );
}
