import React, { useEffect, useRef, useState } from 'react';
import { Eye, Pencil, QrCode, X } from 'lucide-react';
import type { Attachment, Patient, PatientStatus } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { usePatientsStore } from '../store/usePatientsStore';
import { subscribeAttachmentsSse, subscribePatientsSse } from '../store/useClinicSync';
import { formatShamsiDate, QUICK_NOTES, STATUS_META, toPersianDigits } from '../utils/clinicHelpers';

interface PatientDetailModalProps {
  patient: Patient | null;
  onClose: () => void;
  onEditFull: (p: Patient) => void;
  onOpenLab: (patientId: number) => void;
}

export function PatientDetailModal({ patient, onClose, onEditFull, onOpenLab }: PatientDetailModalProps) {
  const role = useAppStore((s) => s.role);
  const notify = useAppStore((s) => s.notify);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const quickStatus = usePatientsStore((s) => s.quickStatus);
  const [detailPatient, setDetailPatient] = useState<Patient | null>(patient);
  const [detailNotes, setDetailNotes] = useState(patient?.notes || '');
  const [detailAttachments, setDetailAttachments] = useState<Attachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const sessionRef = useRef(0);
  const dirtyRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    sessionRef.current += 1;
    const sessionId = sessionRef.current;
    dirtyRef.current = false;
    setDetailPatient(patient);
    setDetailNotes(patient?.notes || '');
    setDetailAttachments([]);

    if (!patient) return;
    requestAnimationFrame(() => closeBtnRef.current?.focus());

    fetch(`/api/patients/${patient.id}/attachments`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && sessionRef.current === sessionId) {
          setDetailPatient(data.patient);
          if (!dirtyRef.current) {
            setDetailNotes(data.patient.notes || '');
          }
          setDetailAttachments(data.attachments || []);
        }
      })
      .catch(() => {});

    const unsubPatients = subscribePatientsSse(() => {
      fetch(`/api/patients/${patient.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.ok && data.patient && sessionRef.current === sessionId) {
            setDetailPatient(data.patient);
            if (!dirtyRef.current) {
              setDetailNotes(data.patient.notes || '');
            }
          }
        })
        .catch(() => {});
    });

    const unsubAttachments = subscribeAttachmentsSse((changedId: number) => {
      if (changedId === patient.id) {
        fetch(`/api/patients/${patient.id}/attachments`)
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && sessionRef.current === sessionId) {
              setDetailAttachments(data.attachments || []);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      unsubPatients();
      unsubAttachments();
    };
  }, [patient]);

  if (!detailPatient) return null;

  async function saveDetailNotes() {
    if (!detailPatient || isSaving) return;
    const sessionId = sessionRef.current;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/patients/${detailPatient.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: detailNotes,
          actor_role: role,
          expected_updated_at: detailPatient.updated_at,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify(data.message || 'خطا در ذخیره یادداشت');
        return;
      }
      if (sessionRef.current === sessionId) {
        dirtyRef.current = false;
        setDetailPatient(data.patient);
      }
      notify('یادداشت پرونده ذخیره شد.');
      fetchPatients();
    } catch {
      notify('خطا در ارتباط با سرور هنگام ذخیره یادداشت');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-2xl border max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="w-11 h-11 rounded-full font-bold text-base flex items-center justify-center shrink-0">
              {(detailPatient.full_name || '?').trim().charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="detail-modal-title" className="font-bold text-base">{detailPatient.full_name}</h3>
                {detailPatient.file_number && (
                  <span style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="px-2.5 py-0.5 rounded-lg border text-xs font-bold tabular-nums">
                    پرونده {toPersianDigits(detailPatient.file_number)}
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
                ثبت توسط {detailPatient.created_by === 'doctor' ? 'پزشک' : 'منشی'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              disabled={isSaving}
              onClick={() => {
                const p = { ...detailPatient, notes: detailNotes };
                onClose();
                onEditFull(p);
              }}
              style={{ borderColor: 'var(--border-main)' }}
              className="px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Pencil className="w-3.5 h-3.5" />
              ویرایش کامل
            </button>
            <button
              ref={closeBtnRef}
              aria-label="بستن جزئیات"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-500/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="p-3 rounded-xl border">
              <p style={{ color: 'var(--text-muted)' }}>شماره تماس</p>
              <p className="font-mono font-bold mt-1" dir="ltr">{detailPatient.phone || '—'}</p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="p-3 rounded-xl border">
              <p style={{ color: 'var(--text-muted)' }}>کد ملی</p>
              <p className="font-mono font-bold mt-1" dir="ltr">{detailPatient.national_id || '—'}</p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="p-3 rounded-xl border">
              <p style={{ color: 'var(--text-muted)' }}>تاریخ شمسی</p>
              <p className="font-bold mt-1 tabular-nums">{formatShamsiDate(detailPatient.visit_date)}</p>
            </div>
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="p-3 rounded-xl border">
              <p style={{ color: 'var(--text-muted)' }}>ساعت نوبت</p>
              <p className="font-bold mt-1 tabular-nums">{detailPatient.visit_time ? toPersianDigits(detailPatient.visit_time) : '—'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold">وضعیت ویزیت</p>
            <div className="flex flex-wrap gap-2">
              {(['waiting', 'in_progress', 'visited', 'cancelled'] as PatientStatus[]).map((stKey) => {
                const meta = STATUS_META[stKey];
                const active = detailPatient.status === stKey;
                return (
                  <button
                    key={stKey}
                    onClick={async () => {
                      const updated = await quickStatus(detailPatient.id, stKey);
                      if (updated) setDetailPatient(updated);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all inline-flex items-center gap-1.5 ${
                      active ? `${meta.badge} border-current shadow-2xs` : 'bg-transparent border-slate-300/60 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold">یادداشت کامل پزشک / منشی</label>
            <textarea
              rows={4}
              value={detailNotes}
              onChange={(e) => {
                dirtyRef.current = true;
                setDetailNotes(e.target.value);
              }}
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="w-full rounded-xl border p-3 text-sm leading-6 focus:outline-none"
              placeholder="یادداشتی ثبت نشده است..."
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_NOTES.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      dirtyRef.current = true;
                      setDetailNotes((n) => (n.trim() ? `${n.trim()} • ${chip}` : chip));
                    }}
                    style={{ backgroundColor: 'var(--bg-subtle)' }}
                    className="px-2.5 py-1 rounded-full text-[11px] hover:opacity-80"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <button
                disabled={isSaving}
                onClick={saveDetailNotes}
                style={{ backgroundColor: 'var(--accent)' }}
                className="px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
              >
                {isSaving ? 'در حال ذخیره...' : 'ذخیره یادداشت'}
              </button>
            </div>
          </div>

          <div style={{ borderColor: 'var(--border-main)' }} className="border-t pt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold">مدارک و آزمایش‌ها ({toPersianDigits(detailAttachments.length)} مورد)</h4>
              <button
                onClick={() => {
                  const id = detailPatient.id;
                  onClose();
                  onOpenLab(id);
                }}
                style={{ color: 'var(--accent)' }}
                className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
              >
                <QrCode className="w-3.5 h-3.5" />
                مدیریت فایل‌ها / اسکن QR موبایل
              </button>
            </div>
            {detailAttachments.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {detailAttachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/attachments/${att.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                    className="flex items-center justify-between p-2.5 rounded-xl border text-xs hover:opacity-90"
                  >
                    <span className="truncate font-semibold">{att.title || att.original_name}</span>
                    <Eye className="w-4 h-4 shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }} className="text-xs">مدرکی پیوست نشده است.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
