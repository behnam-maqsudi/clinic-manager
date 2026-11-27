import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  GitBranch,
  Hourglass,
  ListPlus,
  Palette,
  Paperclip,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wifi,
  Wrench,
  X,
} from 'lucide-react';

const STATUS_META = {
  waiting: { label: 'در انتظار', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  in_progress: { label: 'در حال ویزیت', badge: 'bg-teal-100 text-teal-800', dot: 'bg-teal-600' },
  visited: { label: 'ویزیت‌شده', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  cancelled: { label: 'لغو شده', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
};

const THEMES = [
  { id: 'teal', name: 'سبزآبی طبی (پیش‌فرض)', swatch: '#00685f' },
  { id: 'sky', name: 'آبی آرامش', swatch: '#0284c7' },
  { id: 'emerald', name: 'زمردی مدرن', swatch: '#059669' },
  { id: 'dark', name: 'تیره شبانه (Dark)', swatch: '#0f172a' },
];

const QUICK_NOTES = ['چکاپ سالانه', 'بررسی آزمایش خون', 'تجدید نسخه', 'کنترل ۳ ماه دیگر'];

function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toPersianDigits(str) {
  return String(str ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function formatShamsiDate(isoDate, withWeekday = false) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const options = withWeekday
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(dateObj);
}

function playGentleChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {}
}

function parsePasteLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\t,\-|،]+/).map((s) => s.trim()).filter(Boolean);
      let fullName = '';
      let phone = '';
      let fileNumber = '';
      let nationalId = '';

      for (const part of parts) {
        const cleanDigits = part.replace(/[^\d۰-۹]/g, '');
        if (!phone && /^09\d{9}$/.test(cleanDigits)) {
          phone = cleanDigits;
        } else if (!nationalId && /^\d{10}$/.test(cleanDigits)) {
          nationalId = cleanDigits;
        } else if (!fileNumber && /^\d{1,7}$/.test(cleanDigits) && part.length <= 15) {
          fileNumber = cleanDigits;
        } else if (!fullName) {
          fullName = part;
        }
      }
      if (!fullName && parts[0]) fullName = parts[0];
      return { full_name: fullName, phone, file_number: fileNumber, national_id: nationalId };
    })
    .filter((item) => item.full_name);
}

export default function App() {
  const [role, setRole] = useState(() => localStorage.getItem('clinic_role') || 'secretary');
  const [theme, setTheme] = useState(() => localStorage.getItem('clinic_theme') || 'teal');
  const [devMode, setDevMode] = useState(() => localStorage.getItem('clinic_dev_mode') === 'true');

  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sseConnected, setSseConnected] = useState(true);

  const [toast, setToast] = useState('');
  const [callBanner, setCallBanner] = useState('');

  // Modals
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [formState, setFormState] = useState({
    full_name: '',
    file_number: '',
    phone: '',
    national_id: '',
    visit_date: getTodayIso(),
    visit_time: '',
    status: 'waiting',
    notes: '',
  });
  const [returningMatches, setReturningMatches] = useState([]);

  const [labModalPatientId, setLabModalPatientId] = useState(null);
  const [labPatient, setLabPatient] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [qrInfo, setQrInfo] = useState({ qrDataUrl: '', uploadUrl: '' });
  const [pcUploadTitle, setPcUploadTitle] = useState('');

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState('grid');
  const [bulkDate, setBulkDate] = useState(getTodayIso());
  const [bulkRows, setBulkRows] = useState(() =>
    Array.from({ length: 5 }, () => ({ full_name: '', phone: '', file_number: '', national_id: '' }))
  );
  const [bulkPasteText, setBulkPasteText] = useState('');

  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [lanUrls, setLanUrls] = useState([]);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [gitStatus, setGitStatus] = useState({ commit: '...', branch: 'main', message: 'در حال بررسی...', behind: 0 });
  const [backupMessage, setBackupMessage] = useState('');

  const activeLabIdRef = useRef(null);
  activeLabIdRef.current = labModalPatientId;
  const roleRef = useRef(role);
  roleRef.current = role;

  function notify(msg) {
    setToast(msg);
    clearTimeout(notify._t);
    notify._t = setTimeout(() => setToast(''), 3200);
  }

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('clinic_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('clinic_role', role);
  }, [role]);

  useEffect(() => {
    localStorage.setItem('clinic_dev_mode', String(devMode));
  }, [devMode]);

  async function fetchPatients() {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFilter === 'today') params.set('date', getTodayIso());
    else if (dateFilter === 'custom' && customDate) params.set('date', customDate);
    else params.set('date', 'all');

    const res = await fetch(`/api/patients?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      setPatients(data.patients || []);
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchPatients, 120);
    return () => clearTimeout(t);
  }, [query, dateFilter, customDate, statusFilter]);

  // SSE Live Sync
  useEffect(() => {
    const evtSource = new EventSource('/api/events');
    evtSource.addEventListener('connected', () => setSseConnected(true));
    evtSource.addEventListener('patients_changed', () => fetchPatients());
    evtSource.addEventListener('attachments_changed', (e) => {
      fetchPatients();
      try {
        const payload = JSON.parse(e.data);
        if (activeLabIdRef.current === payload.patientId) {
          loadAttachments(payload.patientId);
        }
      } catch {}
    });
    evtSource.addEventListener('patient_called', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (roleRef.current === 'secretary' && payload.by === 'doctor') {
          triggerCallAlert(
            payload.status === 'in_progress'
              ? `دکتر جهانیان بیمار «${payload.full_name}»${payload.file_number ? ` (پرونده ${toPersianDigits(payload.file_number)})` : ''} را فراخوانی کرد`
              : `ویزیت «${payload.full_name}» به پایان رسید`
          );
        }
      } catch {}
    });
    evtSource.onerror = () => setSseConnected(false);
    return () => evtSource.close();
  }, []);

  function triggerCallAlert(msg) {
    playGentleChime();
    setCallBanner(msg);
    clearTimeout(triggerCallAlert._t);
    triggerCallAlert._t = setTimeout(() => setCallBanner(''), 6000);
  }

  const stats = useMemo(() => {
    return {
      total: patients.length,
      waiting: patients.filter((p) => p.status === 'waiting').length,
      inProgress: patients.filter((p) => p.status === 'in_progress').length,
      visited: patients.filter((p) => p.status === 'visited').length,
    };
  }, [patients]);

  // Patient Modal
  function openNewPatientModal() {
    setEditingPatient(null);
    setReturningMatches([]);
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
    setPatientModalOpen(true);
  }

  function openEditPatientModal(p) {
    setEditingPatient(p);
    setReturningMatches([]);
    setFormState({
      full_name: p.full_name || '',
      file_number: p.file_number || '',
      phone: p.phone || '',
      national_id: p.national_id || '',
      visit_date: p.visit_date || getTodayIso(),
      visit_time: p.visit_time || '',
      status: p.status || 'waiting',
      notes: p.notes || '',
    });
    setPatientModalOpen(true);
  }

  async function lookupReturning(val) {
    if (editingPatient || !val || val.trim().length < 2) {
      setReturningMatches([]);
      return;
    }
    const res = await fetch(`/api/patients/lookup?q=${encodeURIComponent(val.trim())}`);
    const data = await res.json();
    setReturningMatches(data.matches || []);
  }

  async function savePatient(e) {
    e.preventDefault();
    const url = editingPatient ? `/api/patients/${editingPatient.id}` : '/api/patients';
    const method = editingPatient ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formState, created_by: role }),
    });
    const data = await res.json();
    if (data.ok) {
      setPatientModalOpen(false);
      notify(editingPatient ? 'اطلاعات مراجعه‌کننده ویرایش شد.' : 'مراجعه‌کننده جدید ثبت شد.');
      fetchPatients();
    } else {
      alert(data.message || 'خطا در ذخیره اطلاعات');
    }
  }

  async function quickStatus(id, status) {
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, actor_role: role }),
    });
    const data = await res.json();
    if (data.ok) {
      notify('وضعیت مراجعه‌کننده بروزرسانی شد.');
      fetchPatients();
    }
  }

  async function rebookToday(p) {
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
  }

  async function removePatient(id) {
    if (!confirm('آیا از حذف این مراجعه‌کننده و مدارکش مطمئن هستید؟')) return;
    const res = await fetch(`/api/patients/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      notify('مراجعه‌کننده حذف شد.');
      fetchPatients();
    }
  }

  // Lab Modal
  async function loadAttachments(pid) {
    const res = await fetch(`/api/patients/${pid}/attachments`);
    const data = await res.json();
    if (data.ok) {
      setLabPatient(data.patient);
      setAttachments(data.attachments || []);
    }
  }

  async function openLabModal(pid) {
    setLabModalPatientId(pid);
    await loadAttachments(pid);
    const qrRes = await fetch(`/api/patients/${pid}/qr`);
    const qrData = await qrRes.json();
    if (qrData.ok) {
      setQrInfo({ qrDataUrl: qrData.qrDataUrl, uploadUrl: qrData.uploadUrl });
    }
  }

  async function uploadFilesFromPc(files) {
    if (!labModalPatientId || !files || files.length === 0) return;
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    formData.append('title', pcUploadTitle.trim());
    formData.append('uploaded_by', role);

    const res = await fetch(`/api/patients/${labModalPatientId}/attachments`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      setPcUploadTitle('');
      notify('فایل آزمایش با موفقیت آپلود شد.');
      loadAttachments(labModalPatientId);
      fetchPatients();
    } else {
      alert(data.message || 'خطا در آپلود فایل');
    }
  }

  async function removeAttachment(attId) {
    if (!confirm('این مدرک حذف شود؟')) return;
    const res = await fetch(`/api/attachments/${attId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      notify('مدرک حذف شد.');
      loadAttachments(labModalPatientId);
      fetchPatients();
    }
  }

  // Bulk Import
  async function submitBulkImport() {
    const items =
      bulkTab === 'grid'
        ? bulkRows.filter((r) => r.full_name.trim())
        : parsePasteLines(bulkPasteText);

    if (items.length === 0) {
      alert('حداقل یک مراجعه‌کننده وارد کنید.');
      return;
    }

    const res = await fetch('/api/patients/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, visit_date: bulkDate || getTodayIso(), created_by: role }),
    });
    const data = await res.json();
    if (data.ok) {
      setBulkModalOpen(false);
      setBulkPasteText('');
      setBulkRows(Array.from({ length: 5 }, () => ({ full_name: '', phone: '', file_number: '', national_id: '' })));
      notify(`${toPersianDigits(data.count)} مراجعه‌کننده ثبت شدند.`);
      fetchPatients();
    }
  }

  // Network & Settings
  async function openNetworkModal() {
    setNetworkModalOpen(true);
    const res = await fetch('/api/health');
    const data = await res.json();
    setLanUrls(data.urls?.length ? data.urls : [data.localUrl]);
  }

  async function openSettingsModal() {
    setSettingsModalOpen(true);
    setBackupMessage('');
    const res = await fetch('/api/update/status');
    const data = await res.json();
    setGitStatus(data);
  }

  async function applyGitUpdate() {
    setGitStatus((s) => ({ ...s, message: 'در حال دریافت بروزرسانی از گیت‌هاب...' }));
    const res = await fetch('/api/update/apply', { method: 'POST' });
    const data = await res.json();
    setGitStatus((s) => ({ ...s, message: data.message }));
    if (data.ok && data.updated) {
      setTimeout(() => window.location.reload(), 3000);
    }
  }

  async function createServerBackup() {
    const res = await fetch('/api/backup/create', { method: 'POST' });
    const data = await res.json();
    setBackupMessage(data.message || '');
  }

  // Dev Mode Test Actions
  async function seedSamplePatients() {
    const samples = [
      { full_name: 'علی رضایی', file_number: '412', phone: '09123456789', national_id: '0012345678', visit_time: '10:00', status: 'in_progress', notes: '[تست] چکاپ سالانه و فشار خون' },
      { full_name: 'مریم محمدی', file_number: '418', phone: '09358124490', national_id: '0087654321', visit_time: '10:15', status: 'waiting', notes: '[تست] بررسی آزمایش خون' },
      { full_name: 'سارا احمدی', file_number: '390', phone: '09127773344', national_id: '0045612398', visit_time: '10:30', status: 'waiting', notes: '[تست] چکاپ تیروئید' },
      { full_name: 'حسین کریمی', file_number: '275', phone: '09192201188', national_id: '0451239876', visit_time: '09:30', status: 'visited', notes: '[تست] تجدید نسخه - کنترل ۳ ماه دیگر' },
      { full_name: 'زهرا موسوی', file_number: '501', phone: '09105554321', national_id: '0019845623', visit_time: '11:00', status: 'waiting', notes: '[تست] درد معده' },
    ];
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
  }

  async function clearSamplePatients() {
    const testRows = patients.filter((p) => (p.notes || '').includes('[تست]'));
    for (const p of testRows) {
      await fetch(`/api/patients/${p.id}`, { method: 'DELETE' });
    }
    notify(`${toPersianDigits(testRows.length)} بیمار تستی پاک شد.`);
    fetchPatients();
  }

  function cycleTheme() {
    const idx = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
    notify(`تم تغییر کرد: ${next.name}`);
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
            {/* Role Switcher */}
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="hidden sm:flex p-1 rounded-xl border text-xs">
              <button
                onClick={() => setRole('secretary')}
                style={role === 'secretary' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3 py-1.5 rounded-lg font-semibold transition-all"
              >
                منشی
              </button>
              <button
                onClick={() => setRole('doctor')}
                style={role === 'doctor' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3 py-1.5 rounded-lg font-semibold transition-all"
              >
                پزشک
              </button>
            </div>

            <button onClick={() => { setBulkDate(getTodayIso()); setBulkModalOpen(true); }} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5">
              <ListPlus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden lg:inline">ورود از دفتر</span>
            </button>

            <button onClick={openNetworkModal} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5">
              <Wifi className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="hidden md:inline">شبکه مطب</span>
            </button>

            <button onClick={openSettingsModal} style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="px-3 py-2 rounded-xl border hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5">
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
              placeholder="جستجو با نام، شماره پرونده، ۴ رقم آخر موبایل یا کد ملی..."
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border focus:outline-none text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="flex p-1 rounded-xl border">
              <button
                onClick={() => { setDateFilter('today'); setCustomDate(''); }}
                style={dateFilter === 'today' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3.5 py-1.5 rounded-lg font-semibold"
              >
                امروز
              </button>
              <button
                onClick={() => { setDateFilter('all'); setCustomDate(''); }}
                style={dateFilter === 'all' ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                className="px-3.5 py-1.5 rounded-lg font-semibold"
              >
                همه روزها
              </button>
            </div>

            <label style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border cursor-pointer">
              <Calendar className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span>{dateFilter === 'custom' && customDate ? formatShamsiDate(customDate) : 'انتخاب تاریخ'}</span>
              <input
                type="date"
                value={customDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomDate(e.target.value);
                    setDateFilter('custom');
                  }
                }}
                className="sr-only"
              />
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
              className="px-3.5 py-2 rounded-xl border text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="waiting">در انتظار</option>
              <option value="in_progress">در حال ویزیت</option>
              <option value="visited">ویزیت‌شده</option>
              <option value="cancelled">لغو شده</option>
            </select>
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
                    <th className="py-3.5 px-4">تاریخ شمسی</th>
                    <th className="py-3.5 px-4">وضعیت</th>
                    <th className="py-3.5 px-4">مدارک و آزمایش‌ها</th>
                    <th className="py-3.5 px-4">یادداشت</th>
                    <th className="py-3.5 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 text-sm">
                  {patients.map((p, idx) => {
                    const st = STATUS_META[p.status] || STATUS_META.waiting;
                    const timeLabel = p.visit_time ? toPersianDigits(p.visit_time) : toPersianDigits(idx + 1);
                    return (
                      <tr key={p.id} className="hover:bg-slate-500/5 transition-colors">
                        <td className="py-3.5 px-4 font-bold tabular-nums">{timeLabel}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)' }} className="w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0">
                              {(p.full_name || '?').trim().charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{p.full_name}</span>
                                {p.file_number && (
                                  <span style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums">
                                    پرونده {toPersianDigits(p.file_number)}
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
                        <td className="py-3.5 px-4 text-xs tabular-nums">{formatShamsiDate(p.visit_date)}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => openLabModal(p.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                              p.attachment_count > 0
                                ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                                : 'bg-slate-100/70 hover:bg-slate-200/70 text-slate-600 border-slate-200'
                            }`}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{p.attachment_count > 0 ? `${toPersianDigits(p.attachment_count)} آزمایش` : 'افزودن آزمایش'}</span>
                          </button>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }} className="py-3.5 px-4 text-xs max-w-[180px] truncate" title={p.notes}>
                          {p.notes || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-left">
                          <div className="inline-flex items-center gap-1">
                            {p.status === 'waiting' && (
                              <button onClick={() => quickStatus(p.id, 'in_progress')} style={{ backgroundColor: 'var(--accent)' }} className="px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold">
                                شروع ویزیت
                              </button>
                            )}
                            {p.status === 'in_progress' && (
                              <button onClick={() => quickStatus(p.id, 'visited')} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">
                                ویزیت شد ✓
                              </button>
                            )}
                            {p.visit_date !== getTodayIso() && (
                              <button onClick={() => rebookToday(p)} className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold">
                                نوبت امروز
                              </button>
                            )}
                            <button onClick={() => openEditPatientModal(p)} className="p-1.5 rounded-lg hover:bg-slate-500/10" title="ویرایش">
                              <Pencil className="w-4 h-4 text-slate-400" />
                            </button>
                            <button onClick={() => removePatient(p.id)} className="p-1.5 rounded-lg hover:bg-rose-500/10" title="حذف">
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
        <span>React + Lucide + Tailwind • نسخه ۱.۱.۰</span>
      </footer>

      {/* Modal 1: Add / Edit Patient */}
      {patientModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border max-w-lg w-full shadow-2xl overflow-hidden">
            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-base">{editingPatient ? 'ویرایش اطلاعات مراجعه‌کننده' : 'ثبت مراجعه‌کننده جدید'}</h3>
              <button onClick={() => setPatientModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-500/10">
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
                  <input
                    type="date"
                    required
                    value={formState.visit_date}
                    onChange={(e) => setFormState({ ...formState, visit_date: e.target.value })}
                    style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none"
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
                    onChange={(e) => setFormState({ ...formState, status: e.target.value })}
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
                <button type="button" onClick={() => setPatientModalOpen(false)} style={{ borderColor: 'var(--border-main)' }} className="px-4 py-2 rounded-xl border text-xs font-semibold">
                  انصراف
                </button>
                <button type="submit" style={{ backgroundColor: 'var(--accent)' }} className="px-5 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold">
                  ذخیره اطلاعات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Lab Attachments & Mobile QR */}
      {labModalPatientId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border max-w-4xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center justify-between">
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
              <button onClick={() => setLabModalPatientId(null)} className="p-1.5 rounded-lg hover:bg-slate-500/10">
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
      )}

      {/* Modal 3: Bulk Notebook Import */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border max-w-3xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">ورود سریع لیست از دفتر کاغذی</h3>
                <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">ثبت دسته‌جمعی مراجعه‌کنندگان با تایپ سطری یا کپی/پیست</p>
              </div>
              <button onClick={() => setBulkModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-500/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-3 border-b flex flex-wrap items-center gap-2">
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
                <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-lg border text-xs py-1 px-2" />
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
              <button onClick={() => setBulkModalOpen(false)} style={{ borderColor: 'var(--border-main)' }} className="px-4 py-2 rounded-xl border text-xs font-semibold">انصراف</button>
              <button onClick={submitBulkImport} style={{ backgroundColor: 'var(--accent)' }} className="px-5 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold">ثبت همه در لیست</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Network Info */}
      {networkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border max-w-md w-full shadow-2xl overflow-hidden">
            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-base">اتصال سیستم پزشک و موبایل در شبکه</h3>
              <button onClick={() => setNetworkModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-500/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs leading-6">
              <p style={{ color: 'var(--text-muted)' }}>آدرس زیر را در سیستم دکتر بهامین جهانیان باز کنید تا هم‌زمان به همین لیست متصل شود:</p>
              {lanUrls.map((url) => (
                <div key={url} style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="flex items-center justify-between p-2.5 rounded-xl border">
                  <code className="font-mono font-bold" style={{ color: 'var(--accent)' }} dir="ltr">{url}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(url); notify('آدرس کپی شد.'); }}
                    className="px-2.5 py-1 rounded-lg bg-white text-slate-700 border text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    کپی
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Settings (Themes + Dev Mode + Backup + Git Update) */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }} className="rounded-2xl border max-w-xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div style={{ borderColor: 'var(--border-main)' }} className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-base">تنظیمات، تم‌ها، بکاپ و گیت</h3>
              <button onClick={() => setSettingsModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-500/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Theme Picker */}
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
                      className={`p-3 rounded-xl border-2 text-right flex items-center justify-between text-xs font-semibold transition-all`}
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

              {/* Developer Mode Toggle & Dev Panel */}
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
                    </div>
                  </div>
                )}
              </div>

              {/* Git Update */}
              <div style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <h4 className="text-sm font-bold">بروزرسانی برنامه از GitHub</h4>
                  </div>
                  <span className="text-[11px] font-mono bg-white text-slate-700 px-2 py-0.5 rounded-lg border">
                    {gitStatus.commit ? `${gitStatus.branch || 'main'} @ ${gitStatus.commit}` : 'local'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)' }} className="text-xs">{gitStatus.message}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={openSettingsModal} className="px-3.5 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" />
                    بررسی مجدد
                  </button>
                  {gitStatus.ok && gitStatus.behind > 0 && (
                    <button onClick={applyGitUpdate} style={{ backgroundColor: 'var(--accent)' }} className="px-4 py-2 rounded-xl text-white text-xs font-semibold">
                      دریافت و نصب بروزرسانی
                    </button>
                  )}
                </div>
              </div>

              {/* Backup */}
              <div style={{ borderColor: 'var(--border-main)' }} className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h4 className="text-sm font-bold">پشتیبان‌گیری از دیتابیس</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={createServerBackup} className="px-3.5 py-2 rounded-xl border bg-white text-slate-700 text-xs font-semibold">
                    ذخیره بکاپ در سرور
                  </button>
                  <a href="/api/backup/download" className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    دانلود فایل دیتابیس
                  </a>
                </div>
                {backupMessage && <p className="text-xs text-emerald-600 font-semibold">{backupMessage}</p>}
              </div>
            </div>
          </div>
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
