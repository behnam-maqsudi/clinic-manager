import React from 'react';
import { Check, Palette, Wrench } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { THEMES } from '../../utils/clinicHelpers';
import { DevToolsPanel } from './DevToolsPanel';

export function AppearanceTab({ onClose }: { onClose?: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const devMode = useAppStore((s) => s.devMode);
  const setDevMode = useAppStore((s) => s.setDevMode);

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

        {devMode && <DevToolsPanel onClose={onClose} />}
      </div>
    </>
  );
}
