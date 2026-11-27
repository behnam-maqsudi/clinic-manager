import React, { useEffect, useState } from 'react';
import { Download, FileText, Sparkles, Trash2 } from 'lucide-react';
import type { Patient } from '../../../shared/types';
import { useAppStore } from '../../store/useAppStore';
import { usePatientsStore } from '../../store/usePatientsStore';
import { useMessagesStore } from '../../store/useMessagesStore';
import { getTodayIso, toPersianDigits } from '../../utils/clinicHelpers';
import { setClientDebugLogging } from '../../utils/debugLogger';

export function DevToolsPanel({ onClose }: { onClose?: () => void }) {
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const devMode = useAppStore((s) => s.devMode);
  const doctorToken = useAppStore((s) => s.doctorToken);
  const setDoctorToken = useAppStore((s) => s.setDoctorToken);
  const setSetupState = useAppStore((s) => s.setSetupState);
  const devNetworkOffline = useAppStore((s) => s.devNetworkOffline);
  const setDevNetworkOffline = useAppStore((s) => s.setDevNetworkOffline);
  const notify = useAppStore((s) => s.notify);
  const triggerCallAlert = useAppStore((s) => s.triggerCallAlert);
  const cycleTheme = useAppStore((s) => s.cycleTheme);

  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const fetchMessages = useMessagesStore((s) => s.fetchMessages);

  const [logStatus, setLogStatus] = useState({ enabled: false, sizeBytes: 0, lineCount: 0 });

  async function refreshLogStatus() {
    try {
      const res = await fetch('/api/dev/logs/status');
      const data = await res.json();
      if (data.ok) {
        setLogStatus({
          enabled: Boolean(data.enabled),
          sizeBytes: Number(data.sizeBytes) || 0,
          lineCount: Number(data.lineCount) || 0,
        });
        setClientDebugLogging(Boolean(data.enabled));
      }
    } catch {}
  }

  useEffect(() => {
    refreshLogStatus();
  }, []);

  async function toggleLogging() {
    try {
      const res = await fetch('/api/dev/logs/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !logStatus.enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setLogStatus({
          enabled: Boolean(data.enabled),
          sizeBytes: Number(data.sizeBytes) || 0,
          lineCount: Number(data.lineCount) || 0,
        });
        setClientDebugLogging(Boolean(data.enabled));
        notify(data.enabled ? 'ثبت لاگ کامل فعال شد.' : 'ثبت لاگ متوقف شد.');
      }
    } catch {
      notify('خطا در تغییر وضعیت لاگ');
    }
  }

  async function clearLogs() {
    try {
      const res = await fetch('/api/dev/logs/clear', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setLogStatus({
          enabled: Boolean(data.enabled),
          sizeBytes: Number(data.sizeBytes) || 0,
          lineCount: Number(data.lineCount) || 0,
        });
        notify('فایل لاگ پاک شد.');
      }
    } catch {
      notify('خطا در پاک کردن لاگ‌ها');
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

  async function resetToDayOne(wipeAllData: boolean) {
    if (wipeAllData && !confirm('کل بیماران، پیام‌ها و تنظیمات پاک می‌شوند و برنامه مثل روز اول می‌شود. مطمئن هستید؟')) {
      return;
    }
    const endpoint = wipeAllData ? '/api/dev/factory-reset' : '/api/dev/reset-setup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-dev-mode': String(devMode),
          ...(doctorToken ? { 'x-doctor-token': doctorToken } : {}),
        },
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.removeItem('clinic_role');
        localStorage.removeItem('clinic_logged_in');
        localStorage.removeItem('clinic_doctor_token');
        setDoctorToken('');
        setSetupState({ setupCompleted: false, hasDoctorPin: false, hasSecretaryPin: false });
        if (wipeAllData) {
          await Promise.all([fetchPatients(), fetchMessages()]);
        }
        onClose?.();
        notify(wipeAllData ? 'برنامه کاملاً به حالت روز اول بازنشانی شد.' : 'راه‌اندازی اولیه بازنشانی شد.');
      } else {
        notify(data.message || 'خطا در بازنشانی');
      }
    } catch {
      notify('خطا در بازنشانی برنامه');
    }
  }

  async function simulateIncomingChat(fromRole: 'doctor' | 'secretary') {
    const body =
      fromRole === 'secretary'
        ? '[تست] بیمار جدید با پرونده ۴۱۲ در سالن انتظار است'
        : '[تست] لطفاً بیمار بعدی را به اتاق پزشک بفرستید';
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_role: fromRole,
          recipient_role: fromRole === 'doctor' ? 'secretary' : 'doctor',
          body,
          kind: 'chat',
        }),
      });
    } catch {
      notify('خطا در شبیه‌سازی پیام');
    }
  }

  async function simulateNetworkInvite() {
    try {
      await fetch('/api/network/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName: 'سیستم مک پزشک (تست)',
          fromUrl: 'http://192.168.8.99:3000',
          fromRole: 'doctor',
          message: 'درخواست اتصال آزمایشی از سیستم مک در شبکه',
        }),
      });
    } catch {
      notify('خطا در شبیه‌سازی درخواست اتصال');
    }
  }

  return (
    <div className="pt-2 border-t border-violet-200/50 space-y-2.5">
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
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
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
        <button
          onClick={() => simulateIncomingChat(role === 'doctor' ? 'secretary' : 'doctor')}
          className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold"
        >
          شبیه‌سازی پیام ورودی
        </button>
        <button
          onClick={simulateNetworkInvite}
          className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border text-xs font-semibold"
        >
          شبیه‌سازی دعوت اتصال شبکه
        </button>
        <button
          onClick={() => {
            const next = !devNetworkOffline;
            setDevNetworkOffline(next);
            notify(next ? 'شبیه‌سازی قطع شبکه فعال شد.' : 'شبکه دوباره وصل شد.');
          }}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            devNetworkOffline ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-800'
          }`}
        >
          {devNetworkOffline ? 'وصل مجدد شبکه' : 'شبیه‌سازی قطع شبکه'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => resetToDayOne(false)} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold">
          شروع از روز اول (فقط Setup)
        </button>
        <button onClick={() => resetToDayOne(true)} className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold">
          ریست کامل کارخانه (پاک کردن همه چیز)
        </button>
      </div>

      {/* Diagnostic File Logger */}
      <div className="pt-2 border-t border-violet-200/50 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-slate-700 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            ثبت لاگ خطاها و شبکه در فایل
          </span>
          <span className="text-slate-500 tabular-nums">
            {toPersianDigits(logStatus.lineCount)} خط
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleLogging}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              logStatus.enabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-white text-slate-800 border'
            }`}
          >
            {logStatus.enabled ? 'ثبت لاگ فعال است (توقف)' : 'شروع ثبت لاگ'}
          </button>
          <a
            href="/api/dev/logs/download"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            دانلود فایل لاگ
          </a>
          <button
            type="button"
            onClick={clearLogs}
            className="px-3 py-1.5 rounded-xl bg-white text-rose-600 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            پاک کردن لاگ‌ها
          </button>
        </div>
      </div>
    </div>
  );
}
