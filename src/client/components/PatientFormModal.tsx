import React, { useEffect, useRef, useState } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { X } from 'lucide-react';
import type { Patient, PatientStatus, ReturningMatch } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { usePatientsStore } from '../store/usePatientsStore';
import {
  getTodayIso,
  isoToPersianDateObj,
  QUICK_NOTES,
  toIsoDateString,
  toPersianDigits,
} from '../utils/clinicHelpers';

interface PatientFormModalProps {
  open: boolean;
  editingPatient: Patient | null;
  onClose: () => void;
}

export function PatientFormModal({ open, editingPatient, onClose }: PatientFormModalProps) {
  const role = useAppStore((s) => s.role);
  const notify = useAppStore((s) => s.notify);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);

  const [formState, setFormState] = useState<{
    full_name: string;
    file_number: string;
    phone: string;
    national_id: string;
    visit_date: string;
    visit_time: string;
    status: PatientStatus;
    notes: string;
  }>({
    full_name: '',
    file_number: '',
    phone: '',
    national_id: '',
    visit_date: getTodayIso(),
    visit_time: '',
    status: 'waiting',
    notes: '',
  });
  const [returningMatches, setReturningMatches] = useState<ReturningMatch[]>([]);
  const lookupTimerRef = useRef<number | undefined>(undefined);
  const lookupSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setReturningMatches([]);
    if (editingPatient) {
      setFormState({
        full_name: editingPatient.full_name || '',
        file_number: editingPatient.file_number || '',
        phone: editingPatient.phone || '',
        national_id: editingPatient.national_id || '',
        visit_date: editingPatient.visit_date || getTodayIso(),
        visit_time: editingPatient.visit_time || '',
        status: editingPatient.status || 'waiting',
        notes: editingPatient.notes || '',
      });
    } else {
      setFormState({
        full_name: '',
        file_number: '',
        phone: '',
        national_id: '',
        visit_date: getTodayIso(),
        visit_time: '',
        status: 'waiting',
        notes: '',
      });
    }
  }, [open, editingPatient]);

  if (!open) return null;

  function lookupReturning(val: string) {
    window.clearTimeout(lookupTimerRef.current);
    if (editingPatient || !val || val.trim().length < 2) {
      lookupSeqRef.current += 1;
      setReturningMatches([]);
      return;
    }
    const seq = ++lookupSeqRef.current;
    lookupTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/lookup?q=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        if (seq === lookupSeqRef.current) {
          setReturningMatches(data.matches || []);
        }
      } catch {
        if (seq === lookupSeqRef.current) {
          setReturningMatches([]);
        }
      }
    }, 250);
  }

  async function savePatient(e: React.FormEvent) {
    e.preventDefault();
    const url = editingPatient ? `/api/patients/${editingPatient.id}` : '/api/patients';
    const method = editingPatient ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formState,
          created_by: role,
          actor_role: role,
          ...(editingPatient ? { expected_updated_at: editingPatient.updated_at } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onClose();
        notify(editingPatient ? 'اطلاعات مراجعه‌کننده ویرایش شد.' : 'مراجعه‌کننده جدید ثبت شد.');
        fetchPatients();
      } else {
        notify(data.message || 'خطا در ذخیره اطلاعات');
      }
    } catch {
      notify('خطا در ارتباط با سرور هنگام ذخیره اطلاعات');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-2xl border max-w-lg w-full shadow-2xl overflow-hidden"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center justify-between"
        >
          <h3 className="font-bold text-base">
            {editingPatient ? 'ویرایش اطلاعات مراجعه‌کننده' : 'ثبت مراجعه‌کننده جدید'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={savePatient} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1.5">نام و نام خانوادگی *</label>
              <input
                type="text"
                required
                value={formState.full_name}
                onChange={(e) => {
                  setFormState({ ...formState, full_name: e.target.value });
                  lookupReturning(e.target.value);
                }}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
                placeholder="مثلاً علی رضایی"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">شماره پرونده</label>
              <input
                type="text"
                dir="ltr"
                value={formState.file_number}
                onChange={(e) => {
                  setFormState({ ...formState, file_number: e.target.value });
                  lookupReturning(e.target.value);
                }}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
                placeholder="412"
              />
            </div>
          </div>

          {returningMatches.length > 0 && (
            <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="rounded-xl p-2.5 space-y-1.5">
              <p className="text-[11px] font-bold">بیمار قبلی پیدا شد (برای پر کردن خودکار کلیک کنید):</p>
              <div className="flex flex-wrap gap-1.5">
                {returningMatches.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setFormState((s) => ({
                        ...s,
                        full_name: m.full_name || s.full_name,
                        file_number: m.file_number || s.file_number,
                        phone: m.phone || s.phone,
                        national_id: m.national_id || s.national_id,
                      }));
                      setReturningMatches([]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white text-slate-800 text-xs font-medium shadow-2xs"
                  >
                    {m.full_name} {m.file_number ? `(پرونده ${toPersianDigits(m.file_number)})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">شماره تماس</label>
              <input
                type="text"
                dir="ltr"
                value={formState.phone}
                onChange={(e) => {
                  setFormState({ ...formState, phone: e.target.value });
                  lookupReturning(e.target.value);
                }}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
                placeholder="09123456789"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">کد ملی</label>
              <input
                type="text"
                dir="ltr"
                value={formState.national_id}
                onChange={(e) => setFormState({ ...formState, national_id: e.target.value })}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm text-left font-mono focus:outline-none"
                placeholder="0012345678"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">تاریخ مراجعه</label>
              <DatePicker
                calendar={persian}
                locale={persian_fa}
                value={isoToPersianDateObj(formState.visit_date)}
                onChange={(d) => {
                  const iso = toIsoDateString(d as DateObject | null);
                  if (iso) setFormState({ ...formState, visit_date: iso });
                }}
                inputClass="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none bg-slate-50 border-slate-200 text-slate-900"
                containerClassName="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">ساعت نوبت</label>
              <input
                type="text"
                dir="ltr"
                value={formState.visit_time}
                onChange={(e) => setFormState({ ...formState, visit_time: e.target.value })}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm text-left focus:outline-none"
                placeholder="10:30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5">وضعیت</label>
              <select
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value as PatientStatus })}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              >
                <option value="waiting">در انتظار</option>
                <option value="in_progress">در حال ویزیت</option>
                <option value="visited">ویزیت‌شده</option>
                <option value="cancelled">لغو شده</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">یادداشت پزشک / منشی</label>
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
              placeholder="توضیحات ویزیت یا پیگیری..."
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_NOTES.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    setFormState((s) => ({
                      ...s,
                      notes: s.notes.trim() ? `${s.notes.trim()} • ${chip}` : chip,
                    }))
                  }
                  style={{ backgroundColor: 'var(--bg-subtle)' }}
                  className="px-2.5 py-1 rounded-full text-[11px] hover:opacity-80"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              style={{ borderColor: 'var(--border-main)' }}
              className="px-4 py-2 rounded-xl border text-xs font-semibold"
            >
              انصراف
            </button>
            <button
              type="submit"
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-5 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold"
            >
              ذخیره اطلاعات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
