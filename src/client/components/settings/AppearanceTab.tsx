import React, { useState } from 'react';
import { Check, Lock, Palette, Sparkles, Wrench } from 'lucide-react';
import type { Patient, UserRole } from '../../../shared/types';
import { useAppStore } from '../../store/useAppStore';
import { usePatientsStore } from '../../store/usePatientsStore';
import { getTodayIso, THEMES, toPersianDigits } from '../../utils/clinicHelpers';

export function AppearanceTab({ onClose }: { onClose?: () => void }) {
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const doctorToken = useAppStore((s) => s.doctorToken);
  const setDoctorToken = useAppStore((s) => s.setDoctorToken);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const devMode = useAppStore((s) => s.devMode);
  const setDevMode = useAppStore((s) => s.setDevMode);
  const setupState = useAppStore((s) => s.setupState);
  const setSetupState = useAppStore((s) => s.setSetupState);
  const notify = useAppStore((s) => s.notify);
  const triggerCallAlert = useAppStore((s) => s.triggerCallAlert);
  const cycleTheme = useAppStore((s) => s.cycleTheme);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);

  const [roleSwitchPin, setRoleSwitchPin] = useState('');
  const [roleSwitchError, setRoleSwitchError] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  async function handleProtectedRoleSwitch(targetRole: UserRole) {
    if (targetRole === role) return;
    setRoleSwitchError('');
    if (targetRole === 'doctor' && !setupState.hasDoctorPin) {
      setRoleSwitchError('این سیستم فقط برای منشی راه‌اندازی شده و رمز پزشک ندارد.');
      return;
    }
    if (!setupState.hasDoctorPin) {
      setRole(targetRole);
      notify(`نقش سیستم به «${targetRole === 'doctor' ? 'پزشک' : 'منشی'}» تغییر کرد.`);
      return;
    }
    if (!roleSwitchPin.trim()) {
      setRoleSwitchError('ابتدا رمز عبور پزشک را وارد کنید.');
      return;
    }
    setVerifyingPin(true);
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: roleSwitchPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setRoleSwitchError(data.message || 'رمز عبور پزشک اشتباه است.');
        return;
      }
      if (targetRole === 'doctor' && data.doctorToken) {
        setDoctorToken(data.doctorToken);
      }
      setRole(targetRole);
      setRoleSwitchPin('');
      setRoleSwitchError('');
      notify(`نقش سیستم به «${targetRole === 'doctor' ? 'پزشک' : 'منشی'}» تغییر کرد.`);
    } catch {
      setRoleSwitchError('خطا در بررسی رمز عبور');
    } finally {
      setVerifyingPin(false);
    }
  }

  async function seedSamplePatients() {
    const samples = [
      { full_name: 'علی رضایی', file_number: '412', phone: '09123456789', national_id: '0012345678', visit_time: '10:00', status: 'in_progress', notes: '[تست] چکاپ سالانه و فشار خون' },
      { full_name: 'مریم محمدی', file_number: '418', phone: '09358124490', national_id: '0087654321', visit_time: '10:15', status: 'waiting', notes: '[تست] بررسی آزمایش خون' },
      { full_name: 'سارا احمدی', file_number: '390', phone: '09127773344', national_id: '0045612398', visit_time: '10:30', status: 'waiting', notes: '[تست] چکاپ تیروئید' },
      { full_name: 'حسین کریمی', file_number: '275', phone: '09192201188', national_id: '0451239876', visit_time: '09:30', status: 'visited', notes: '[تست] تجدید نسخه - کنترل ۳ ماه دیگر' },
      { full_name: 'زهرا موسوی', file_number: '501', phone: '09105554321', national_id: '0019845623', visit_time: '11:00', status: 'waiting', notes: '[تست] درد معده' },
    ];
    try {
      const res = await fetch('/api/patients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: samples, visit_date: getTodayIso(), created_by: role }),
      });
      const data = await res.json();
      if (data.ok) {
        notify('۵ بیمار نمونه برای تست اضافه شد.');
        fetchPatients();
      }
    } catch {
      notify('خطا در تزریق بیماران تستی');
    }
  }

  async function clearSamplePatients() {
    try {
      const res = await fetch('/api/patients?date=all');
      const data = await res.json();
      const allPatients: Patient[] = data.patients || [];
      const testRows = allPatients.filter((p) => (p.notes || '').includes('[تست]'));
      await Promise.all(testRows.map((p) => fetch(`/api/patients/${p.id}`, { method: 'DELETE' })));
      notify(`${toPersianDigits(testRows.length)} بیمار تستی پاک شد.`);
      fetchPatients();
    } catch {
      notify('خطا در پاک‌سازی بیماران تستی');
    }
  }

  async function resetToDayOne() {
    try {
      const res = await fetch('/api/dev/reset-setup', {
        method: 'POST',
        headers: {
          'x-dev-mode': String(devMode),
          ...(doctorToken ? { 'x-doctor-token': doctorToken } : {}),
        },
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.removeItem('clinic_role');
        localStorage.removeItem('clinic_doctor_token');
        setDoctorToken('');
        setSetupState({
          setupCompleted: false,
          primaryRole: null,
          hasDoctorPin: false,
        });
        onClose?.();
        notify('وضعیت به روز اول (راه‌اندازی اولیه) بازنشانی شد.');
      } else {
        notify(data.message || 'خطا در بازنشانی راه‌اندازی اولیه');
      }
    } catch {
      notify('خطا در بازنشانی راه‌اندازی اولیه');
    }
  }

  return (
    <>
      <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h4 className="text-sm font-bold">انتخاب تم ظاهری برنامه</h4>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: theme === t.id ? 'var(--accent)' : 'var(--border-main)',
              }}
              className="p-3 rounded-xl border-2 text-right flex items-center justify-between text-xs font-semibold transition-all"
            >
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-white/40 shadow-2xs" style={{ backgroundColor: t.swatch }} />
                {t.name}
              </span>
              {theme === t.id && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h4 className="text-sm font-bold">نقش این سیستم و امنیت</h4>
          </div>
          <span style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            نقش فعلی: {role === 'doctor' ? 'پزشک' : 'منشی'}
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
          برای تغییر نقش این سیستم، رمز عبور پزشک را وارد کرده و نقش جدید را انتخاب کنید:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {setupState.hasDoctorPin && (
            <input
              type="password"
              dir="ltr"
              value={roleSwitchPin}
              onChange={(e) => {
                setRoleSwitchPin(e.target.value);
                setRoleSwitchError('');
              }}
              placeholder="رمز عبور پزشک"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
              className="flex-1 min-w-[140px] rounded-xl border px-3 py-2 text-xs font-mono text-left focus:outline-none"
            />
          )}
          {role === 'doctor' ? (
            <button
              type="button"
              disabled={verifyingPin}
              onClick={() => handleProtectedRoleSwitch('secretary')}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
            >
              تغییر به منشی
            </button>
          ) : (
            <button
              type="button"
              disabled={verifyingPin}
              onClick={() => handleProtectedRoleSwitch('doctor')}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
            >
              تغییر به پزشک
            </button>
          )}
        </div>
        {roleSwitchError && <p className="text-xs text-rose-600 font-semibold">{roleSwitchError}</p>}
      </div>

      <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-violet-600" />
            <div>
              <h4 className="text-sm font-bold">حالت توسعه‌دهنده (Developer Mode)</h4>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">ابزارهای تست UI، تزریق دیتای نمونه و بررسی لاجیک‌ها</p>
            </div>
          </div>
          <button
            aria-label="تغییر حالت توسعه‌دهنده"
            onClick={() => setDevMode(!devMode)}
            className={`w-12 h-6 rounded-full transition-colors p-0.5 ${devMode ? 'bg-violet-600' : 'bg-slate-300'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${devMode ? '-translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {devMode && (
          <div className="pt-2 border-t border-violet-200/50 space-y-2">
            <p className="text-[11px] font-bold text-violet-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              ابزارهای تست سریع فعال است:
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={seedSamplePatients} className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">
                + تزریق ۵ بیمار تستی
              </button>
              <button onClick={clearSamplePatients} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold">
                پاک‌سازی بیماران تستی
              </button>
              <button onClick={() => triggerCallAlert('تست فراخوانی بیمار «علی رضایی» (پرونده ۴۱۲)')} className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold">
                تست صدای اعلان منشی
              </button>
              <button onClick={cycleTheme} className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold">
                تغییر سریع تم
              </button>
              <button onClick={resetToDayOne} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold">
                شروع از روز اول (Setup)
              </button>
              <button
                onClick={() => {
                  setRole('doctor');
                  notify('حالت تست: ورود با نقش پزشک');
                }}
                className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold"
              >
                ورود تست پزشک
              </button>
              <button
                onClick={() => {
                  setRole('secretary');
                  notify('حالت تست: ورود با نقش منشی');
                }}
                className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold"
              >
                ورود تست منشی
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
