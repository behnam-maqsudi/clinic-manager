import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, FileText, FolderOpen, QrCode, Trash2, Upload, X } from 'lucide-react';
import type { Attachment, Patient } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';
import { usePatientsStore } from '../store/usePatientsStore';
import { subscribeAttachmentsSse } from '../store/useClinicSync';
import { toPersianDigits } from '../utils/clinicHelpers';

interface LabModalProps {
  patientId: number | null;
  onClose: () => void;
}

export function LabModal({ patientId, onClose }: LabModalProps) {
  const role = useAppStore((s) => s.role);
  const notify = useAppStore((s) => s.notify);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const [labPatient, setLabPatient] = useState<Patient | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [qrInfo, setQrInfo] = useState({ qrDataUrl: '', uploadUrl: '' });
  const [pcUploadTitle, setPcUploadTitle] = useState('');

  const loadAttachments = useCallback(async (pid: number) => {
    try {
      const res = await fetch(`/api/patients/${pid}/attachments`);
      const data = await res.json();
      if (data.ok) {
        setLabPatient(data.patient);
        setAttachments(data.attachments || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!patientId) return;
    loadAttachments(patientId);
    fetch(`/api/patients/${patientId}/qr`)
      .then((r) => r.json())
      .then((qrData) => {
        if (qrData.ok) {
          setQrInfo({ qrDataUrl: qrData.qrDataUrl, uploadUrl: qrData.uploadUrl });
        }
      })
      .catch(() => {});

    return subscribeAttachmentsSse((changedPatientId: number) => {
      if (changedPatientId === patientId) {
        loadAttachments(patientId);
      }
    });
  }, [patientId, loadAttachments]);

  if (!patientId) return null;

  async function uploadFilesFromPc(files: FileList | null) {
    if (!patientId || !files || files.length === 0) return;
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    formData.append('title', pcUploadTitle.trim());
    formData.append('uploaded_by', role);

    try {
      const res = await fetch(`/api/patients/${patientId}/attachments`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        setPcUploadTitle('');
        notify('فایل آزمایش با موفقیت آپلود شد.');
        loadAttachments(patientId);
        fetchPatients();
      } else {
        notify(data.message || 'خطا در آپلود فایل');
      }
    } catch {
      notify('خطا در ارتباط با سرور هنگام آپلود');
    }
  }

  async function removeAttachment(attId: number) {
    if (!confirm('این مدرک حذف شود؟')) return;
    try {
      const res = await fetch(`/api/attachments/${attId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok && patientId !== null) {
        notify('مدرک حذف شد.');
        loadAttachments(patientId);
        fetchPatients();
      }
    } catch {
      notify('خطا در حذف مدرک');
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
        className="rounded-2xl border max-w-4xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }} className="w-10 h-10 rounded-xl flex items-center justify-center">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">مدارک و آزمایش‌های {labPatient?.full_name}</h3>
              <p style={{ color: 'var(--text-muted)' }} className="text-xs">
                کد ملی: {labPatient?.national_id || '—'} • شماره تماس: {labPatient?.phone || '—'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid md:grid-cols-5 gap-6 overflow-y-auto">
          <div className="md:col-span-3 space-y-4">
            <input
              type="text"
              value={pcUploadTitle}
              onChange={(e) => setPcUploadTitle(e.target.value)}
              placeholder="عنوان مدرک (اختیاری، مثلاً آزمایش خون یا سونوگرافی)"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="w-full rounded-xl border text-xs px-3 py-2 focus:outline-none"
            />
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                uploadFilesFromPc(e.dataTransfer.files);
              }}
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="block border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer hover:opacity-90"
            >
              <input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => uploadFilesFromPc(e.target.files)} />
              <Upload className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-semibold">فایل آزمایش را اینجا بکشید یا کلیک کنید</p>
              <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1">JPG, PNG, PDF تا ۲۰ مگابایت</p>
            </label>

            <div className="space-y-2">
              <h4 className="text-xs font-bold">مدارک ذخیره‌شده ({toPersianDigits(attachments.length)} مورد)</h4>
              {attachments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', borderColor: 'var(--border-main)' }} className="text-xs py-4 text-center border border-dashed rounded-xl">
                  هنوز مدرکی ثبت نشده است.
                </p>
              ) : (
                attachments.map((att) => (
                  <div key={att.id} style={{ borderColor: 'var(--border-main)' }} className="flex items-center justify-between p-3 rounded-xl border">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-sky-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{att.title || att.original_name}</p>
                        <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                          آپلود توسط {att.uploaded_by === 'mobile' ? 'موبایل' : att.uploaded_by === 'doctor' ? 'پزشک' : 'منشی'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`/api/attachments/${att.id}/file`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-slate-500/10" title="مشاهده">
                        <Eye className="w-4 h-4" />
                      </a>
                      <a href={`/api/attachments/${att.id}/file?download=1`} className="p-1.5 rounded-lg hover:bg-slate-500/10" title="دانلود">
                        <Download className="w-4 h-4" />
                      </a>
                      <button onClick={() => removeAttachment(att.id)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500" title="حذف">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="md:col-span-2 border rounded-2xl p-5 flex flex-col items-center justify-center text-center">
            <span style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold mb-3">
              <QrCode className="w-3.5 h-3.5" />
              آپلود سریع با دوربین گوشی
            </span>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs leading-5 mb-4">
              با دوربین گوشی اسکن کنید و از برگه آزمایش عکس بگیرید.
            </p>
            {qrInfo.qrDataUrl && (
              <div className="w-44 h-44 bg-white rounded-2xl border p-2.5 mb-4">
                <img src={qrInfo.qrDataUrl} alt="QR Code" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="w-full flex items-center gap-1.5 bg-white text-slate-700 border rounded-xl p-1.5">
              <input type="text" readOnly dir="ltr" value={qrInfo.uploadUrl} className="flex-1 text-[11px] font-mono bg-transparent border-none focus:outline-none p-1" />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(qrInfo.uploadUrl);
                  notify('آدرس آپلود موبایل کپی شد.');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold"
              >
                کپی
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
