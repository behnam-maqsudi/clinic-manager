import React, { useEffect, useState } from 'react';
import { Lock, LogIn, Stethoscope, UserCheck } from 'lucide-react';
import type { UserRole } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';

export function LoginModal() {
  const setupState = useAppStore((s) => s.setupState);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const loginSuccess = useAppStore((s) => s.loginSuccess);
  const notify = useAppStore((s) => s.notify);

  const [selectedRole, setSelectedRole] = useState<UserRole>('secretary');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedRole('secretary');
      setPin('');
      setError('');
    }
  }, [isAuthenticated]);

  if (!setupState.setupCompleted || isAuthenticated) return null;

  const needsPin = selectedRole === 'doctor' || setupState.hasSecretaryPin;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || 'رمز عبور اشتباه است.');
        return;
      }
      setPin('');
      loginSuccess(selectedRole, data.doctorToken || '');
      notify(`خوش آمدید (${selectedRole === 'doctor' ? 'پزشک' : 'منشی'})`);
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-2xl border max-w-md w-full shadow-2xl overflow-hidden"
      >
        <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center gap-3">
          <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
            <LogIn className="w-5 h-5" />
          </div>
          <div>
            <h3 id="login-modal-title" className="font-bold text-base">ورود به سامانه مطب</h3>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">کاربر خود را انتخاب و وارد شوید</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSelectedRole('secretary');
                setPin('');
                setError('');
              }}
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: selectedRole === 'secretary' ? 'var(--accent)' : 'var(--border-main)',
              }}
              className="p-3.5 rounded-xl border-2 text-right space-y-1 transition-all"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <UserCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>منشی</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">پذیرش و نوبت‌دهی</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('doctor');
                setPin('');
                setError('');
              }}
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: selectedRole === 'doctor' ? 'var(--accent)' : 'var(--border-main)',
              }}
              className="p-3.5 rounded-xl border-2 text-right space-y-1 transition-all"
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Stethoscope className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>پزشک (مدیر)</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">ویزیت و مدیریت کل</p>
            </button>
          </div>

          {needsPin && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                {selectedRole === 'doctor' ? 'رمز عبور پزشک' : 'رمز عبور منشی'}
              </label>
              <input
                type="password"
                dir="ltr"
                required
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="رمز عبور را وارد کنید..."
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2.5 text-sm text-left font-mono focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: 'var(--accent)' }}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
          >
            {loading ? 'در حال ورود...' : `ورود به‌عنوان ${selectedRole === 'doctor' ? 'پزشک' : 'منشی'}`}
          </button>
        </form>
      </div>
    </div>
  );
}
