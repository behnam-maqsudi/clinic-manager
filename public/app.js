const state = {
  role: localStorage.getItem('clinic_role') || 'secretary',
  dateFilter: 'today',
  customDate: '',
  statusFilter: 'all',
  query: '',
  patients: [],
  activePatientId: null,
};

const STATUS_META = {
  waiting: { label: 'در انتظار', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  in_progress: { label: 'در حال ویزیت', badge: 'bg-secondary-container text-on-secondary-container', dot: 'bg-primary' },
  visited: { label: 'ویزیت‌شده', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  cancelled: { label: 'لغو شده', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
};

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

function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setRole(role) {
  state.role = role === 'doctor' ? 'doctor' : 'secretary';
  localStorage.setItem('clinic_role', state.role);
  const secBtn = document.getElementById('roleSecretaryBtn');
  const docBtn = document.getElementById('roleDoctorBtn');

  if (state.role === 'secretary') {
    secBtn.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white text-primary shadow-2xs';
    docBtn.className = 'px-3 py-1.5 rounded-lg font-semibold text-slate-500 hover:text-slate-900';
  } else {
    docBtn.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white text-primary shadow-2xs';
    secBtn.className = 'px-3 py-1.5 rounded-lg font-semibold text-slate-500 hover:text-slate-900';
  }
  renderPatients();
}

function setDateFilter(mode) {
  state.dateFilter = mode;
  if (mode !== 'custom') {
    state.customDate = '';
    document.getElementById('customDateInput').value = '';
    document.getElementById('customDateLabel').textContent = 'انتخاب تاریخ';
  } else if (state.customDate) {
    document.getElementById('customDateLabel').textContent = formatShamsiDate(state.customDate);
  }

  const todayBtn = document.getElementById('dateTodayBtn');
  const allBtn = document.getElementById('dateAllBtn');
  const activeCls = 'px-3 py-1.5 rounded-lg font-semibold bg-white text-on-surface shadow-2xs';
  const inactiveCls = 'px-3 py-1.5 rounded-lg font-semibold text-slate-500 hover:text-slate-900';

  todayBtn.className = mode === 'today' ? activeCls : inactiveCls;
  allBtn.className = mode === 'all' ? activeCls : inactiveCls;
  fetchPatients();
}

async function fetchPatients() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.statusFilter !== 'all') params.set('status', state.statusFilter);
  if (state.dateFilter === 'today') {
    params.set('date', getTodayIso());
  } else if (state.dateFilter === 'custom' && state.customDate) {
    params.set('date', state.customDate);
  } else {
    params.set('date', 'all');
  }

  const res = await fetch(`/api/patients?${params.toString()}`);
  const data = await res.json();
  if (data.ok) {
    state.patients = data.patients || [];
    renderStats();
    renderPatients();
  }
}

function renderStats() {
  const total = state.patients.length;
  const waiting = state.patients.filter((p) => p.status === 'waiting').length;
  const inProgress = state.patients.filter((p) => p.status === 'in_progress').length;
  const visited = state.patients.filter((p) => p.status === 'visited').length;

  document.getElementById('statTotal').textContent = toPersianDigits(total);
  document.getElementById('statWaiting').textContent = toPersianDigits(waiting);
  document.getElementById('statInProgress').textContent = toPersianDigits(inProgress);
  document.getElementById('statVisited').textContent = toPersianDigits(visited);
}

function renderPatients() {
  const tbody = document.getElementById('patientsTableBody');
  const empty = document.getElementById('emptyState');

  if (state.patients.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  tbody.innerHTML = state.patients
    .map((p, index) => {
      const st = STATUS_META[p.status] || STATUS_META.waiting;
      const rowBg = p.status === 'in_progress' ? 'bg-secondary-container/20' : p.status === 'visited' ? 'opacity-85' : '';
      const timeLabel = p.visit_time ? toPersianDigits(p.visit_time) : toPersianDigits(index + 1);
      const attachmentBtn =
        p.attachment_count > 0
          ? `<button onclick="openLabModal(${p.id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-medium">
               <span class="material-symbols-outlined text-[15px]">attach_file</span>
               <span>${toPersianDigits(p.attachment_count)} آزمایش</span>
             </button>`
          : `<button onclick="openLabModal(${p.id})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-low hover:bg-slate-200 text-slate-600 text-xs">
               <span>+ افزودن آزمایش</span>
             </button>`;

      let quickActionBtn = '';
      if (p.status === 'waiting') {
        quickActionBtn = `<button onclick="quickStatus(${p.id}, 'in_progress')" class="px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold">شروع ویزیت</button>`;
      } else if (p.status === 'in_progress') {
        quickActionBtn = `<button onclick="quickStatus(${p.id}, 'visited')" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">ویزیت شد ✓</button>`;
      }

      return `
        <tr class="${rowBg} hover:bg-surface-low/40 transition-colors">
          <td class="py-3.5 px-4 font-bold text-slate-700 tabular-nums">${timeLabel}</td>
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full bg-secondary-container/70 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                ${escapeHtml((p.full_name || '?').trim().charAt(0))}
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-on-surface">${escapeHtml(p.full_name)}</span>
                  ${p.file_number ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700 tabular-nums">پرونده ${toPersianDigits(escapeHtml(p.file_number))}</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-400">ثبت توسط ${p.created_by === 'doctor' ? 'پزشک' : 'منشی'}</div>
              </div>
            </div>
          </td>
          <td class="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums" dir="ltr">${escapeHtml(p.phone || '—')}</td>
          <td class="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums" dir="ltr">${escapeHtml(p.national_id || '—')}</td>
          <td class="py-3.5 px-4 text-xs text-slate-600 tabular-nums">${formatShamsiDate(p.visit_date)}</td>
          <td class="py-3.5 px-4">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.badge}">
              <span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>
              ${st.label}
            </span>
          </td>
          <td class="py-3.5 px-4">${attachmentBtn}</td>
          <td class="py-3.5 px-4 text-xs text-slate-500 max-w-[190px] truncate" title="${escapeHtml(p.notes)}">${escapeHtml(p.notes || '—')}</td>
          <td class="py-3.5 px-4 text-left">
            <div class="inline-flex items-center gap-1">
              ${quickActionBtn}
              ${p.visit_date !== getTodayIso() ? `<button onclick="rebookToday(${p.id})" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold" title="ثبت نوبت مجدد برای امروز">نوبت امروز</button>` : ''}
              <button onclick="openPatientModal(${p.id})" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="ویرایش">
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </button>
              <button onclick="removePatient(${p.id})" class="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="حذف">
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function quickStatus(id, status) {
  const res = await fetch(`/api/patients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, actor_role: state.role }),
  });
  const data = await res.json();
  if (data.ok) {
    showToast('وضعیت مراجعه‌کننده بروزرسانی شد.');
    fetchPatients();
  }
}

async function rebookToday(id) {
  const p = state.patients.find((item) => item.id === id);
  if (!p) return;
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
      created_by: state.role,
    }),
  });
  const data = await res.json();
  if (data.ok) {
    showToast(`نوبت امروز برای ${p.full_name} ثبت شد.`);
    setDateFilter('today');
  }
}

function appendNoteChip(text) {
  const el = document.getElementById('notesInput');
  const current = el.value.trim();
  el.value = current ? `${current} • ${text}` : text;
}

function openPatientModal(id = null) {
  const modal = document.getElementById('patientModal');
  const title = document.getElementById('patientModalTitle');
  const form = document.getElementById('patientForm');
  form.reset();
  document.getElementById('returningSuggestions').classList.add('hidden');

  if (id) {
    const p = state.patients.find((item) => item.id === id);
    if (!p) return;
    title.textContent = 'ویرایش اطلاعات مراجعه‌کننده';
    document.getElementById('patientIdInput').value = p.id;
    document.getElementById('fullNameInput').value = p.full_name;
    document.getElementById('fileNumberInput').value = p.file_number || '';
    document.getElementById('phoneInput').value = p.phone;
    document.getElementById('nationalIdInput').value = p.national_id;
    document.getElementById('visitDateInput').value = p.visit_date;
    document.getElementById('visitTimeInput').value = p.visit_time;
    document.getElementById('statusInput').value = p.status;
    document.getElementById('notesInput').value = p.notes;
  } else {
    title.textContent = 'ثبت مراجعه‌کننده جدید';
    document.getElementById('patientIdInput').value = '';
    document.getElementById('fileNumberInput').value = '';
    document.getElementById('visitDateInput').value = getTodayIso();
    document.getElementById('statusInput').value = 'waiting';
  }

  modal.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.getElementById('patientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('patientIdInput').value;
  const payload = {
    full_name: document.getElementById('fullNameInput').value.trim(),
    file_number: document.getElementById('fileNumberInput').value.trim(),
    phone: document.getElementById('phoneInput').value.trim(),
    national_id: document.getElementById('nationalIdInput').value.trim(),
    visit_date: document.getElementById('visitDateInput').value,
    visit_time: document.getElementById('visitTimeInput').value.trim(),
    status: document.getElementById('statusInput').value,
    notes: document.getElementById('notesInput').value.trim(),
    created_by: state.role,
  };

  const url = id ? `/api/patients/${id}` : '/api/patients';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.ok) {
    closeModal('patientModal');
    showToast(id ? 'اطلاعات مراجعه‌کننده ویرایش شد.' : 'مراجعه‌کننده جدید ثبت شد.');
    fetchPatients();
  } else {
    alert(data.message || 'خطا در ذخیره اطلاعات');
  }
});

async function removePatient(id) {
  if (!confirm('آیا از حذف این مراجعه‌کننده و مدارکش مطمئن هستید؟')) return;
  const res = await fetch(`/api/patients/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.ok) {
    showToast('مراجعه‌کننده حذف شد.');
    fetchPatients();
  }
}

// --- Attachments & Mobile QR Modal ---
async function openLabModal(patientId) {
  state.activePatientId = patientId;
  document.getElementById('labModal').classList.remove('hidden');
  await Promise.all([loadAttachments(patientId), loadPatientQr(patientId)]);
}

async function loadAttachments(patientId) {
  const res = await fetch(`/api/patients/${patientId}/attachments`);
  const data = await res.json();
  if (!data.ok) return;

  const p = data.patient;
  const st = STATUS_META[p.status] || STATUS_META.waiting;
  document.getElementById('labModalTitle').textContent = `مدارک و آزمایش‌های ${p.full_name}`;
  const badge = document.getElementById('labModalStatusBadge');
  badge.textContent = st.label;
  badge.className = `px-2.5 py-0.5 rounded-full text-[11px] font-medium ${st.badge}`;
  document.getElementById('labModalMeta').textContent = `کد ملی: ${p.national_id || '—'}  •  شماره تماس: ${p.phone || '—'}`;

  const list = data.attachments || [];
  document.getElementById('attachmentsCount').textContent = toPersianDigits(list.length);
  const container = document.getElementById('attachmentsList');

  if (list.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">هنوز مدرک یا آزمایشی ثبت نشده است.</p>`;
    return;
  }

  container.innerHTML = list
    .map((att) => {
      const isPdf = (att.mime_type || '').includes('pdf');
      const sizeKb = Math.max(1, Math.round((att.size_bytes || 0) / 1024));
      const sizeText = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} مگابایت` : `${toPersianDigits(sizeKb)} کیلوبایت`;
      const displayTitle = att.title || att.original_name;

      return `
        <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-lg ${isPdf ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'} flex items-center justify-center text-xs font-bold shrink-0">
              ${isPdf ? 'PDF' : 'IMG'}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-on-surface truncate">${escapeHtml(displayTitle)}</p>
              <p class="text-[11px] text-slate-400">${sizeText} • آپلود توسط ${att.uploaded_by === 'mobile' ? 'موبایل' : att.uploaded_by === 'doctor' ? 'پزشک' : 'منشی'}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <a href="/api/attachments/${att.id}/file" target="_blank" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" title="مشاهده">
              <span class="material-symbols-outlined text-[18px]">visibility</span>
            </a>
            <a href="/api/attachments/${att.id}/file?download=1" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" title="دانلود">
              <span class="material-symbols-outlined text-[18px]">download</span>
            </a>
            <button onclick="removeAttachment(${att.id})" class="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="حذف">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadPatientQr(patientId) {
  const res = await fetch(`/api/patients/${patientId}/qr`);
  const data = await res.json();
  if (data.ok) {
    document.getElementById('qrCodeImg').src = data.qrDataUrl;
    document.getElementById('mobileUploadUrlInput').value = data.uploadUrl;
  }
}

async function uploadFilesFromPc(files) {
  if (!state.activePatientId || !files || files.length === 0) return;
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f);
  }
  formData.append('title', document.getElementById('pcUploadTitle').value.trim());
  formData.append('uploaded_by', state.role);

  const res = await fetch(`/api/patients/${state.activePatientId}/attachments`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (data.ok) {
    document.getElementById('pcUploadTitle').value = '';
    document.getElementById('pcFileInput').value = '';
    showToast('فایل آزمایش با موفقیت آپلود شد.');
    loadAttachments(state.activePatientId);
    fetchPatients();
  } else {
    alert(data.message || 'خطا در آپلود فایل');
  }
}

async function removeAttachment(attachmentId) {
  if (!confirm('این مدرک حذف شود؟')) return;
  const res = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
  const data = await res.json();
  if (data.ok) {
    showToast('فایل حذف شد.');
    loadAttachments(state.activePatientId);
    fetchPatients();
  }
}

function copyMobileUrl() {
  const input = document.getElementById('mobileUploadUrlInput');
  navigator.clipboard.writeText(input.value);
  showToast('آدرس آپلود موبایل کپی شد.');
}

// Drag & drop for PC upload
const dropZone = document.getElementById('dropZone');
const pcFileInput = document.getElementById('pcFileInput');
pcFileInput.addEventListener('change', (e) => uploadFilesFromPc(e.target.files));
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-primary', 'bg-secondary-container/20');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-primary', 'bg-secondary-container/20');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-primary', 'bg-secondary-container/20');
  uploadFilesFromPc(e.dataTransfer.files);
});

// --- Network Modal ---
async function openNetworkModal() {
  document.getElementById('networkModal').classList.remove('hidden');
  const res = await fetch('/api/health');
  const data = await res.json();
  const container = document.getElementById('lanUrlsList');
  const urls = data.urls && data.urls.length > 0 ? data.urls : [data.localUrl];

  container.innerHTML = urls
    .map(
      (url) => `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-low border border-slate-200">
        <code class="text-xs font-mono text-primary" dir="ltr">${escapeHtml(url)}</code>
        <button onclick="navigator.clipboard.writeText('${escapeHtml(url)}'); showToast('آدرس کپی شد.')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700">کپی</button>
      </div>
    `
    )
    .join('');
}

// --- Settings / Git Update & Backup ---
async function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
  await checkGitUpdate();
}

async function checkGitUpdate() {
  const msgEl = document.getElementById('gitStatusMessage');
  const btn = document.getElementById('applyGitUpdateBtn');
  const badge = document.getElementById('gitCommitBadge');
  msgEl.textContent = 'در حال بررسی مخزن گیت‌هاب...';

  const res = await fetch('/api/update/status');
  const data = await res.json();
  badge.textContent = data.commit ? `${data.branch || 'main'} @ ${data.commit}` : 'local';
  msgEl.textContent = data.message || '';

  if (data.ok && data.behind > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

async function applyGitUpdate() {
  const msgEl = document.getElementById('gitStatusMessage');
  const btn = document.getElementById('applyGitUpdateBtn');
  btn.disabled = true;
  msgEl.textContent = 'در حال دریافت بروزرسانی از گیت‌هاب...';

  const res = await fetch('/api/update/apply', { method: 'POST' });
  const data = await res.json();
  msgEl.textContent = data.message || '';
  if (data.ok && data.updated) {
    setTimeout(() => window.location.reload(), 3000);
  } else {
    btn.disabled = false;
  }
}

async function createServerBackup() {
  const res = await fetch('/api/backup/create', { method: 'POST' });
  const data = await res.json();
  const el = document.getElementById('backupMessage');
  el.textContent = data.message || '';
  el.classList.remove('hidden');
}

// --- Returning Patient Lookup ---
async function lookupReturning(q) {
  if (document.getElementById('patientIdInput').value) return;
  const box = document.getElementById('returningSuggestions');
  const listEl = document.getElementById('returningSuggestionsList');
  if (!q || q.trim().length < 2) {
    box.classList.add('hidden');
    return;
  }
  const res = await fetch(`/api/patients/lookup?q=${encodeURIComponent(q.trim())}`);
  const data = await res.json();
  const matches = data.matches || [];
  if (matches.length === 0) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  window._returningMatches = matches;
  listEl.innerHTML = matches
    .map(
      (m, idx) => `
      <button type="button" onclick="applyReturningMatch(${idx})" class="px-2.5 py-1 rounded-lg bg-white border border-teal-200 hover:bg-teal-50 text-xs text-on-surface font-medium">
        ${escapeHtml(m.full_name)} ${m.file_number ? `(پرونده ${toPersianDigits(escapeHtml(m.file_number))})` : ''} ${m.phone ? `• ${escapeHtml(m.phone)}` : ''}
      </button>
    `
    )
    .join('');
}

function applyReturningMatch(idx) {
  const m = (window._returningMatches || [])[idx];
  if (!m) return;
  document.getElementById('fullNameInput').value = m.full_name || '';
  document.getElementById('fileNumberInput').value = m.file_number || '';
  document.getElementById('phoneInput').value = m.phone || '';
  document.getElementById('nationalIdInput').value = m.national_id || '';
  document.getElementById('returningSuggestions').classList.add('hidden');
}

['fullNameInput', 'phoneInput', 'fileNumberInput'].forEach((id) => {
  document.getElementById(id).addEventListener('input', (e) => {
    clearTimeout(window._lookupTimer);
    window._lookupTimer = setTimeout(() => lookupReturning(e.target.value), 220);
  });
});

// --- Bulk / Fast Notebook Import ---
let bulkTab = 'grid';

function openBulkModal() {
  document.getElementById('bulkVisitDate').value = getTodayIso();
  document.getElementById('bulkPasteInput').value = '';
  const tbody = document.getElementById('bulkGridBody');
  tbody.innerHTML = '';
  for (let i = 0; i < 5; i++) addBulkGridRow();
  setBulkTab('grid');
  document.getElementById('bulkModal').classList.remove('hidden');
}

function setBulkTab(tab) {
  bulkTab = tab;
  const gridBtn = document.getElementById('bulkTabGridBtn');
  const pasteBtn = document.getElementById('bulkTabPasteBtn');
  const gridSec = document.getElementById('bulkGridSection');
  const pasteSec = document.getElementById('bulkPasteSection');

  if (tab === 'grid') {
    gridBtn.className = 'px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold';
    pasteBtn.className = 'px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold';
    gridSec.classList.remove('hidden');
    pasteSec.classList.add('hidden');
  } else {
    pasteBtn.className = 'px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold';
    gridBtn.className = 'px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold';
    pasteSec.classList.remove('hidden');
    gridSec.classList.add('hidden');
  }
}

function addBulkGridRow() {
  const tbody = document.getElementById('bulkGridBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-1.5 pl-2"><input type="text" placeholder="نام و نام خانوادگی" class="bulk-name w-full rounded-lg border border-slate-200 text-xs py-1.5 px-2 focus:border-primary focus:ring-0" /></td>
    <td class="py-1.5 px-2"><input type="text" dir="ltr" placeholder="0912..." class="bulk-phone w-full rounded-lg border border-slate-200 text-xs py-1.5 px-2 text-left font-mono focus:border-primary focus:ring-0" /></td>
    <td class="py-1.5 px-2"><input type="text" dir="ltr" placeholder="412" class="bulk-file w-full rounded-lg border border-slate-200 text-xs py-1.5 px-2 text-left font-mono focus:border-primary focus:ring-0" /></td>
    <td class="py-1.5 pr-2"><input type="text" dir="ltr" placeholder="کد ملی" class="bulk-nid w-full rounded-lg border border-slate-200 text-xs py-1.5 px-2 text-left font-mono focus:border-primary focus:ring-0" /></td>
  `;
  tr.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!tr.nextElementSibling) addBulkGridRow();
        tr.nextElementSibling?.querySelector('.bulk-name')?.focus();
      }
    });
  });
  tbody.appendChild(tr);
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

async function submitBulkImport() {
  const visitDate = document.getElementById('bulkVisitDate').value || getTodayIso();
  let items = [];

  if (bulkTab === 'grid') {
    document.querySelectorAll('#bulkGridBody tr').forEach((tr) => {
      const fullName = tr.querySelector('.bulk-name').value.trim();
      if (!fullName) return;
      items.push({
        full_name: fullName,
        phone: tr.querySelector('.bulk-phone').value.trim(),
        file_number: tr.querySelector('.bulk-file').value.trim(),
        national_id: tr.querySelector('.bulk-nid').value.trim(),
      });
    });
  } else {
    items = parsePasteLines(document.getElementById('bulkPasteInput').value);
  }

  if (items.length === 0) {
    alert('حداقل یک مراجعه‌کننده وارد کنید.');
    return;
  }

  const res = await fetch('/api/patients/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, visit_date: visitDate, created_by: state.role }),
  });
  const data = await res.json();
  if (data.ok) {
    closeModal('bulkModal');
    showToast(`${toPersianDigits(data.count)} مراجعه‌کننده با موفقیت ثبت شدند.`);
    fetchPatients();
  } else {
    alert(data.message || 'خطا در ثبت گروهی');
  }
}

// --- Gentle Chime Sound (Web Audio API) ---
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

// --- Live SSE Sync ---
function initSSE() {
  const evtSource = new EventSource('/api/events');
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');

  evtSource.addEventListener('connected', () => {
    dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
    text.textContent = 'همگام‌سازی زنده';
  });

  evtSource.addEventListener('patients_changed', () => {
    fetchPatients();
  });

  evtSource.addEventListener('patient_called', (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (state.role === 'secretary' && payload.by === 'doctor') {
        playGentleChime();
        const banner = document.getElementById('callAlertBanner');
        const textEl = document.getElementById('callAlertText');
        const fileTag = payload.file_number ? ` (پرونده ${toPersianDigits(payload.file_number)})` : '';
        textEl.textContent =
          payload.status === 'in_progress'
            ? `دکتر جهانیان بیمار «${payload.full_name}»${fileTag} را فراخوانی کرد`
            : `ویزیت «${payload.full_name}» به پایان رسید`;
        banner.classList.remove('hidden');
        clearTimeout(window._callBannerTimer);
        window._callBannerTimer = setTimeout(() => banner.classList.add('hidden'), 6000);
      }
    } catch {}
  });

  evtSource.addEventListener('attachments_changed', (e) => {
    fetchPatients();
    try {
      const payload = JSON.parse(e.data);
      if (state.activePatientId === payload.patientId && !document.getElementById('labModal').classList.contains('hidden')) {
        loadAttachments(state.activePatientId);
      }
    } catch {}
  });

  evtSource.onerror = () => {
    dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500';
    text.textContent = 'تلاش برای اتصال مجدد...';
  };
}

// --- Init ---
document.getElementById('todayShamsiLabel').textContent = formatShamsiDate(getTodayIso(), true);

document.getElementById('searchInput').addEventListener('input', (e) => {
  state.query = e.target.value.trim();
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(fetchPatients, 180);
});

document.getElementById('statusFilter').addEventListener('change', (e) => {
  state.statusFilter = e.target.value;
  fetchPatients();
});

document.getElementById('customDateInput').addEventListener('change', (e) => {
  if (e.target.value) {
    state.customDate = e.target.value;
    setDateFilter('custom');
  }
});

setRole(state.role);
setDateFilter('today');
initSSE();
