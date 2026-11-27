import React, { useEffect, useState } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { usePatientsStore } from '../store/usePatientsStore';
import {
  getTodayIso,
  isoToPersianDateObj,
  parsePasteLines,
  toIsoDateString,
  toPersianDigits,
} from '../utils/clinicHelpers';
import { logUiEvent } from '../utils/debugLogger';

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
}

export function BulkImportModal({ open, onClose }: BulkImportModalProps) {
  const role = useAppStore((s) => s.role);
  const notify = useAppStore((s) => s.notify);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const [bulkTab, setBulkTab] = useState<'grid' | 'paste'>('grid');
  const [bulkDate, setBulkDate] = useState(getTodayIso());
  const [bulkRows, setBulkRows] = useState<
    Array<{ full_name: string; phone: string; file_number: string; national_id: string }>
  >(() => Array.from({ length: 5 }, () => ({ full_name: '', phone: '', file_number: '', national_id: '' })));
  const [bulkPasteText, setBulkPasteText] = useState('');

  useEffect(() => {
    if (open) setBulkDate(getTodayIso());
  }, [open]);

  if (!open) return null;

  async function submitBulkImport() {
    const items =
      bulkTab === 'grid' ? bulkRows.filter((r) => r.full_name.trim()) : parsePasteLines(bulkPasteText);
    logUiEvent('BulkImportModal', 'submit_bulk', { tab: bulkTab, count: items.length });

    if (items.length === 0) {
      notify('حداقل یک مراجعه‌کننده وارد کنید.');
      return;
    }

    try {
      const res = await fetch('/api/patients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, visit_date: bulkDate || getTodayIso(), created_by: role }),
      });
      const data = await res.json();
      if (data.ok) {
        onClose();
        setBulkPasteText('');
        setBulkRows(Array.from({ length: 5 }, () => ({ full_name: '', phone: '', file_number: '', national_id: '' })));
        notify(`${toPersianDigits(data.count)} مراجعه‌کننده ثبت شدند.`);
        fetchPatients();
      } else {
        notify(data.message || 'خطا در ثبت لیست');
      }
    } catch {
      notify('خطا در ارتباط با سرور');
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
        className="rounded-2xl border max-w-3xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center justify-between"
        >
          <div>
            <h3 className="font-bold text-base">ورود سریع لیست از دفتر کاغذی</h3>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
              ثبت دسته‌جمعی مراجعه‌کنندگان با تایپ سطری یا کپی/پیست
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-3 border-b flex flex-wrap items-center gap-2"
        >
          <button
            onClick={() => setBulkTab('grid')}
            style={bulkTab === 'grid' ? { backgroundColor: 'var(--accent)', color: '#fff' } : { backgroundColor: 'var(--bg-subtle)' }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold"
          >
            تایپ سریع سطری (مثل اکسل)
          </button>
          <button
            onClick={() => setBulkTab('paste')}
            style={bulkTab === 'paste' ? { backgroundColor: 'var(--accent)', color: '#fff' } : { backgroundColor: 'var(--bg-subtle)' }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold"
          >
            کپی / پیست متن لیست
          </button>
          <div className="mr-auto flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>تاریخ نوبت:</span>
            <DatePicker
              calendar={persian}
              locale={persian_fa}
              value={isoToPersianDateObj(bulkDate)}
              onChange={(d) => {
                const iso = toIsoDateString(d as DateObject | null);
                if (iso) setBulkDate(iso);
              }}
              inputClass="rounded-lg border text-xs py-1 px-2 w-28 bg-slate-50 border-slate-200 text-slate-900 text-center"
            />
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {bulkTab === 'grid' ? (
            <>
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderColor: 'var(--border-main)' }} className="border-b">
                    <th className="pb-2 pl-2">نام و نام خانوادگی *</th>
                    <th className="pb-2 px-2">شماره تماس</th>
                    <th className="pb-2 px-2">شماره پرونده</th>
                    <th className="pb-2 pr-2">کد ملی</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 pl-2">
                        <input
                          type="text"
                          placeholder="نام و نام خانوادگی"
                          value={row.full_name}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx].full_name = e.target.value;
                            setBulkRows(next);
                          }}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="w-full rounded-lg border text-xs py-1.5 px-2"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="0912..."
                          value={row.phone}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx].phone = e.target.value;
                            setBulkRows(next);
                          }}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="w-full rounded-lg border text-xs py-1.5 px-2 text-left font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="412"
                          value={row.file_number}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx].file_number = e.target.value;
                            setBulkRows(next);
                          }}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="w-full rounded-lg border text-xs py-1.5 px-2 text-left font-mono"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="کد ملی"
                          value={row.national_id}
                          onChange={(e) => {
                            const next = [...bulkRows];
                            next[idx].national_id = e.target.value;
                            setBulkRows(next);
                          }}
                          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                          className="w-full rounded-lg border text-xs py-1.5 px-2 text-left font-mono"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => setBulkRows([...bulkRows, { full_name: '', phone: '', file_number: '', national_id: '' }])}
                style={{ color: 'var(--accent)' }}
                className="text-xs font-semibold hover:underline"
              >
                + افزودن سطر جدید
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <p style={{ color: 'var(--text-muted)' }} className="text-xs">
                هر خط یک نفر (مثلاً: <code dir="ltr">علی رضایی - 09123456789 - 412</code>):
              </p>
              <textarea
                rows={8}
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="w-full rounded-xl border text-xs p-3 leading-6"
                placeholder="علی رضایی - 09123456789 - 412&#10;مریم محمدی - 09358124490 - 415"
              />
            </div>
          )}
        </div>

        <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} style={{ borderColor: 'var(--border-main)' }} className="px-4 py-2 rounded-xl border text-xs font-semibold">
            انصراف
          </button>
          <button onClick={submitBulkImport} style={{ backgroundColor: 'var(--accent)' }} className="px-5 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold">
            ثبت همه در لیست
          </button>
        </div>
      </div>
    </div>
  );
}
