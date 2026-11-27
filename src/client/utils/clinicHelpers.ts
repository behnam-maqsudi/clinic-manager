import { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import type { PatientInput, PatientStatus } from '../../shared/types';

export const STATUS_META: Record<PatientStatus, { label: string; badge: string; dot: string }> = {
  waiting: { label: 'در انتظار', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  in_progress: { label: 'در حال ویزیت', badge: 'bg-teal-100 text-teal-800', dot: 'bg-teal-600' },
  visited: { label: 'ویزیت‌شده', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600' },
  cancelled: { label: 'لغو شده', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
};

export const THEMES = [
  { id: 'teal', name: 'سبزآبی طبی (پیش‌فرض)', swatch: '#00685f' },
  { id: 'sky', name: 'آبی آرامش', swatch: '#0284c7' },
  { id: 'emerald', name: 'زمردی مدرن', swatch: '#059669' },
  { id: 'dark', name: 'تیره شبانه (Dark)', swatch: '#0f172a' },
];

export const QUICK_NOTES = ['چکاپ سالانه', 'بررسی آزمایش خون', 'تجدید نسخه', 'کنترل ۳ ماه دیگر'];

export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toPersianDigits(str: string | number | null | undefined): string {
  return String(str ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function formatShamsiDate(isoDate: string, withWeekday = false): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const options: Intl.DateTimeFormatOptions = withWeekday
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(dateObj);
}

export function toIsoDateString(d: DateObject | null | undefined): string {
  if (!d) return '';
  return new DateObject(d).convert(gregorian, gregorian_en).format('YYYY-MM-DD');
}

export function isoToPersianDateObj(iso: string): DateObject {
  const [y, m, d] = (iso || getTodayIso()).split('-').map(Number);
  return new DateObject({ year: y, month: m, day: d, calendar: gregorian, locale: gregorian_en }).convert(
    persian,
    persian_fa
  );
}

export function playGentleChime(): void {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
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

export function parsePasteLines(raw: string): PatientInput[] {
  return raw
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => {
      const parts = line.split(/[\t,\-|،]+/).map((s: string) => s.trim()).filter(Boolean);
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
