import React, { useMemo, useRef, useState } from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import type { Patient, PatientStatus } from '../shared/types';
import { useAppStore } from './store/useAppStore';
import { usePatientsStore } from './store/usePatientsStore';
import { useMessagesStore } from './store/useMessagesStore';
import { useClinicSync } from './store/useClinicSync';
import { formatShamsiDate, getTodayIso, STATUS_META, toPersianDigits } from './utils/clinicHelpers';
import { MessagesModal } from './components/MessagesModal';
import { SetupWizardModal } from './components/SetupWizardModal';
import { SettingsModal } from './components/SettingsModal';
import { PatientFormModal } from './components/PatientFormModal';
import { BulkImportModal } from './components/BulkImportModal';
import { LabModal } from './components/LabModal';
import { PatientDetailModal } from './components/PatientDetailModal';
import {
  BellRing,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  ListPlus,
  MessageSquare,
  Paperclip,
  Pencil,
  Search,
  Settings,
  Stethoscope,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';

export default function App() {
  useClinicSync();

  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const setDoctorToken = useAppStore((s) => s.setDoctorToken);
  const devMode = useAppStore((s) => s.devMode);
  const setupState = useAppStore((s) => s.setupState);
  const setSetupState = useAppStore((s) => s.setSetupState);
  const sseConnected = useAppStore((s) => s.sseConnected);
  const toast = useAppStore((s) => s.toast);
  const notify = useAppStore((s) => s.notify);
  const callBanner = useAppStore((s) => s.callBanner);
  const setCallBanner = useAppStore((s) => s.setCallBanner);
  const inviteBanner = useAppStore((s) => s.inviteBanner);
  const setInviteBanner = useAppStore((s) => s.setInviteBanner);
  const connectToRemoteUrl = useAppStore((s) => s.connectToRemoteUrl);

  const patients = usePatientsStore((s) => s.patients);
  const query = usePatientsStore((s) => s.query);
  const setQuery = usePatientsStore((s) => s.setQuery);
  const setDebouncedQuery = usePatientsStore((s) => s.setDebouncedQuery);
  const dateFilter = usePatientsStore((s) => s.dateFilter);
  const setDateFilter = usePatientsStore((s) => s.setDateFilter);
  const customRange = usePatientsStore((s) => s.customRange);
  const setCustomRange = usePatientsStore((s) => s.setCustomRange);
  const statusFilter = usePatientsStore((s) => s.statusFilter);
  const setStatusFilter = usePatientsStore((s) => s.setStatusFilter);
  const fetchPatients = usePatientsStore((s) => s.fetchPatients);
  const quickStatus = usePatientsStore((s) => s.quickStatus);

  const messages = useMessagesStore((s) => s.messages);
  const messagesModalOpen = useMessagesStore((s) => s.messagesModalOpen);
  const openMessagesModal = useMessagesStore((s) => s.openMessagesModal);
  const closeMessagesModal = useMessagesStore((s) => s.closeMessagesModal);
  const sendChatMessage = useMessagesStore((s) => s.sendChatMessage);

  const stats = useMemo(
    () => ({
      total: patients.length,
      waiting: patients.filter((p) => p.status === 'waiting').length,
      inProgress: patients.filter((p) => p.status === 'in_progress').length,
      visited: patients.filter((p) => p.status === 'visited').length,
    }),
    [patients]
  );

  const unreadMessagesCount = useMemo(
    () =>
      messages.filter(
        (m) => !m.read_at && m.sender_role !== role && (m.recipient_role === role || m.recipient_role === 'all')
      ).length,
    [messages, role]
  );

  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [labModalPatientId, setLabModalPatientId] = useState<number | null>(null);
  const [detailPatient, setDetailPatient] = useState<Patient | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const detailOpenerRef = useRef<HTMLElement | null>(null);

  function openNewPatientModal() {
    setEditingPatient(null);
    setPatientModalOpen(true);
  }

  function openEditPatientModal(p: Patient) {
    setEditingPatient(p);
    setPatientModalOpen(true);
  }

  function openPatientDetails(p: Patient) {
    detailOpenerRef.current = document.activeElement as HTMLElement | null;
    setDetailPatient(p);
  }

  function closePatientDetails() {
    setDetailPatient(null);
    const opener = detailOpenerRef.current;
    detailOpenerRef.current = null;
    if (opener && typeof opener.focus === 'function') {
      requestAnimationFrame(() => opener.focus());
    }
  }

  async function rebookToday(p: Patient) {
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: p.full_name,
          file_number: p.file_number,
          phone: p.phone,
          national_id: p.national_id,
          visit_date: getTodayIso(),
          status: 'waiting',
          notes: '',
          created_by: role,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        notify(`نوبت امروز برای ${p.full_name} ثبت شد.`);
        setDateFilter('today');
      }
    } catch {
      notify('خطا در ثبت نوبت امروز');
    }
  }

  async function removePatient(id: number) {
    if (!confirm('آیا از حذف این مراجعه‌کننده و مدارکش مطمئن هستید؟')) return;
    try {
      const res = await fetch(`/api/patients/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        notify('مراجعه‌کننده حذف شد.');
        fetchPatients();
      }
    } catch {
      notify('خطا در حذف مراجعه‌کننده');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="border-b sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: 'var(--accent)' }} className="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-sm">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base">مطب دکتر بهامین جهانیان</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${sseConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {sseConnected ? 'همگام‌سازی زنده' : 'در حال اتصال...'}
                </span>
                {devMode && (
                  <button onClick={() => setSettingsModalOpen(true)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
                    <Wrench className="w-3 h-3" />
                    DEV
                  </button>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
                {formatShamsiDate(getTodayIso(), true)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)', color: 'var(--accent)' }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold"
              title="تغییر نقش فقط از تنظیمات و با رمز عبور امکان‌پذیر است"
            >
              {role === 'doctor' ? <Stethoscope className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span>{role === 'doctor' ? 'پنل پزشک' : 'پنل منشی'}</span>
            </div>

            <button
              onClick={openMessagesModal}
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
              className="relative px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5"
              title="پیام‌های دکتر و منشی"
            >
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden md:inline">پیام‌ها</span>
              {unreadMessagesCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {toPersianDigits(unreadMessagesCount)}
                </span>
              )}
            </button>

            <button onClick={() => setBulkModalOpen(true)} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5">
              <ListPlus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden lg:inline">ورود از دفتر</span>
            </button>

            <button onClick={() => setSettingsModalOpen(true)} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5">
              <Settings className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden md:inline">تنظیمات</span>
            </button>

            <button onClick={openNewPatientModal} style={{ backgroundColor: 'var(--accent)' }} className="px-4 py-2 rounded-xl hover:opacity-95 text-white text-xs sm:text-sm font-semibold shadow-sm inline-flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              <span>ثبت مراجعه‌کننده</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        {/* KPI Row */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'کل مراجعه‌کنندگان', value: stats.total, icon: Users, bar: 'bg-slate-400', iconBg: 'bg-slate-100 text-slate-700' },
            { label: 'در انتظار ویزیت', value: stats.waiting, icon: Hourglass, bar: 'bg-amber-500', iconBg: 'bg-amber-50 text-amber-600' },
            { label: 'در حال ویزیت', value: stats.inProgress, icon: Stethoscope, bar: 'bg-teal-600', iconBg: 'bg-teal-50 text-teal-700' },
            { label: 'ویزیت‌شده', value: stats.visited, icon: CheckCircle2, bar: 'bg-emerald-500', iconBg: 'bg-emerald-50 text-emerald-600' },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
                <div className={`absolute inset-y-0 right-0 w-1 ${card.bar}`} />
                <div>
                  <p style={{ color: 'var(--text-muted)' }} className="text-xs font-medium">{card.label}</p>
                  <p className="text-3xl font-extrabold mt-1.5 tabular-nums">{toPersianDigits(card.value)}</p>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.iconBg}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            );
          })}
        </section>

        {/* Search & Filter Toolbar */}
        <section style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-3.5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setDebouncedQuery(query.trim());
              }}
              placeholder="جستجو با نام، شماره پرونده، شماره تماس یا کد ملی..."
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border focus:outline-none text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="flex items-center p-1 rounded-xl border gap-1">
              <button
                onClick={() => { setDateFilter('today'); setCustomRange([]); }}
                style={dateFilter === 'today' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3.5 py-1.5 rounded-lg font-semibold transition-all"
              >
                امروز
              </button>
              <button
                onClick={() => { setDateFilter('all'); setCustomRange([]); }}
                style={dateFilter === 'all' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3.5 py-1.5 rounded-lg font-semibold transition-all"
              >
                همه روزها
              </button>

              <DatePicker
                range
                calendar={persian}
                locale={persian_fa}
                calendarPosition="bottom-center"
                value={customRange}
                onChange={(val) => {
                  const arr = Array.isArray(val) ? val : val ? [val] : [];
                  setCustomRange(arr as DateObject[]);
                  setDateFilter(arr.length > 0 ? 'custom' : 'today');
                }}
                render={(_value, openCalendar) => {
                  const isCustom = dateFilter === 'custom' && customRange.length > 0;
                  const label = isCustom
                    ? customRange.length === 2
                      ? `${customRange[0].format('YYYY/MM/DD')} تا ${customRange[1].format('YYYY/MM/DD')}`
                      : customRange[0].format('YYYY/MM/DD')
                    : 'انتخاب تاریخ شمسی';
                  return (
                    <div
                      style={isCustom ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                      className="inline-flex items-center gap-1 rounded-lg transition-all"
                    >
                      <button type="button" onClick={openCalendar} className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold cursor-pointer">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                      {isCustom && (
                        <button
                          type="button"
                          aria-label="پاک کردن فیلتر تاریخ"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomRange([]);
                            setDateFilter('today');
                          }}
                          className="pl-2 pr-0.5 py-1 hover:opacity-70"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                }}
              />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PatientStatus)}
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                className="appearance-none pr-3.5 pl-8 py-2.5 rounded-xl border text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="waiting">در انتظار</option>
                <option value="in_progress">در حال ویزیت</option>
                <option value="visited">ویزیت‌شده</option>
                <option value="cancelled">لغو شده</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute left-2.5 top-2.5" />
            </div>
          </div>
        </section>

        {/* Patient Table */}
        <section style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border overflow-hidden shadow-sm">
          {patients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)', color: 'var(--text-muted)' }} className="border-b text-[11px] font-bold">
                    <th className="py-3.5 px-4">نوبت</th>
                    <th className="py-3.5 px-4">نام و شماره پرونده</th>
                    <th className="py-3.5 px-4">شماره تماس</th>
                    <th className="py-3.5 px-4">کد ملی</th>
                    <th className="py-3.5 px-4">وضعیت</th>
                    <th className="py-3.5 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 text-sm">
                  {patients.map((p, idx) => {
                    const st = STATUS_META[p.status] || STATUS_META.waiting;
                    const timeLabel = p.visit_time ? toPersianDigits(p.visit_time) : toPersianDigits(idx + 1);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openPatientDetails(p)}
                        className="hover:bg-slate-500/10 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-bold tabular-nums">{timeLabel}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0">
                              {(p.full_name || '?').trim().charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPatientDetails(p);
                                  }}
                                  className="font-semibold text-right hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
                                >
                                  {p.full_name}
                                </button>
                                {p.file_number && (
                                  <span style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums">
                                    پرونده {toPersianDigits(p.file_number)}
                                  </span>
                                )}
                                {(p.attachment_count ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold tabular-nums">
                                    <Paperclip className="w-3 h-3" />
                                    {toPersianDigits(p.attachment_count)}
                                  </span>
                                )}
                              </div>
                              <div style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                                ثبت توسط {p.created_by === 'doctor' ? 'پزشک' : 'منشی'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs tabular-nums" dir="ltr">{p.phone || '—'}</td>
                        <td className="py-3.5 px-4 font-mono text-xs tabular-nums" dir="ltr">{p.national_id || '—'}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          <div className="inline-flex items-center gap-1">
                            {p.status === 'waiting' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickStatus(p.id, 'in_progress');
                                }}
                                style={{ backgroundColor: 'var(--accent)' }}
                                className="px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold"
                              >
                                شروع ویزیت
                              </button>
                            )}
                            {p.status === 'in_progress' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickStatus(p.id, 'visited');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                              >
                                ویزیت شد ✓
                              </button>
                            )}
                            {p.visit_date !== getTodayIso() && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  rebookToday(p);
                                }}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                              >
                                نوبت امروز
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditPatientModal(p);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-500/10"
                              title="ویرایش"
                            >
                              <Pencil className="w-4 h-4 text-slate-400" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removePatient(p.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center px-4">
              <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }} className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold">هنوز مراجعه‌کننده‌ای در این لیست ثبت نشده است</p>
              <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1 mb-4">
                با ثبت اولین مراجعه‌کننده، لیست نوبت‌ها هم‌زمان برای دکتر و منشی نمایش داده می‌شود.
              </p>
              <button onClick={openNewPatientModal} style={{ backgroundColor: 'var(--accent)' }} className="px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                <span>ثبت اولین مراجعه‌کننده</span>
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer style={{ color: 'var(--text-muted)' }} className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 text-[11px] flex items-center justify-between">
        <span>سامانه مدیریت مطب دکتر بهامین جهانیان</span>
        <span>React + Zustand + Tailwind • نسخه ۱.۱.۰</span>
      </footer>

      {/* Modals */}
      <PatientFormModal open={patientModalOpen} editingPatient={editingPatient} onClose={() => setPatientModalOpen(false)} />
      <LabModal patientId={labModalPatientId} onClose={() => setLabModalPatientId(null)} />
      <BulkImportModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} />
      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <PatientDetailModal
        patient={detailPatient}
        onClose={closePatientDetails}
        onEditFull={(p) => openEditPatientModal(p)}
        onOpenLab={(id) => setLabModalPatientId(id)}
      />

      <SetupWizardModal
        open={!setupState.setupCompleted}
        onComplete={(chosenRole, state, token) => {
          setSetupState(state);
          if (token) setDoctorToken(token);
          setRole(chosenRole);
          notify(`راه‌اندازی اولیه تکمیل شد (${chosenRole === 'doctor' ? 'سیستم پزشک' : 'سیستم منشی'}).`);
        }}
      />

      <MessagesModal
        open={messagesModalOpen}
        onClose={closeMessagesModal}
        role={role}
        messages={messages}
        onSendMessage={sendChatMessage}
        onConnectPeer={connectToRemoteUrl}
      />

      {/* Connection Invite Banner */}
      {inviteBanner && (
        <div
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent)' }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl border-2 shadow-2xl flex flex-wrap items-center gap-3 max-w-xl"
        >
          <Wifi className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">درخواست اتصال از {inviteBanner.fromName}</p>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">{inviteBanner.message}</p>
          </div>
          {inviteBanner.fromUrl && (
            <button
              type="button"
              onClick={() => {
                connectToRemoteUrl(inviteBanner.fromUrl);
                setInviteBanner(null);
              }}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold"
            >
              اتصال به این سیستم
            </button>
          )}
          <button
            type="button"
            onClick={() => setInviteBanner(null)}
            className="p-1 rounded-lg hover:bg-slate-500/10"
            aria-label="بستن اعلان اتصال"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Call Alert Banner */}
      {callBanner && (
        <div style={{ backgroundColor: 'var(--accent)' }} className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white shadow-xl flex items-center gap-3">
          <BellRing className="w-5 h-5 animate-bounce" />
          <span className="text-sm font-bold">{callBanner}</span>
          <button onClick={() => setCallBanner('')} className="text-white/80 hover:text-white text-xs">✕</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
