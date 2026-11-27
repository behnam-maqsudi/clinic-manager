import React, { useState } from 'react';
import { Database, GitBranch, Palette, Wifi, X } from 'lucide-react';
import { logUiEvent } from '../utils/debugLogger';
import { AppearanceTab } from './settings/AppearanceTab';
import { NetworkTab } from './settings/NetworkTab';
import { BackupTab } from './settings/BackupTab';
import { UpdateTab } from './settings/UpdateTab';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'network' | 'backup' | 'update';

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  if (!open) return null;

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'appearance', label: 'ظاهر و نقش', icon: Palette },
    { id: 'network', label: 'شبکه و اتصال', icon: Wifi },
    { id: 'backup', label: 'بکاپ و دیتابیس', icon: Database },
    { id: 'update', label: 'بروزرسانی', icon: GitBranch },
  ];

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
        className="rounded-2xl border max-w-xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-6 py-4 border-b flex items-center justify-between"
        >
          <h3 className="font-bold text-base">تنظیمات سیستم</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-500/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          style={{ borderColor: 'var(--border-main)', backgroundColor: 'var(--bg-subtle)' }}
          className="px-4 py-2.5 border-b flex items-center gap-1.5 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  logUiEvent('SettingsModal', 'tab_switch', { tab: tab.id });
                  setActiveTab(tab.id);
                }}
                style={
                  active
                    ? { backgroundColor: 'var(--bg-card)', color: 'var(--accent)', borderColor: 'var(--border-main)' }
                    : { color: 'var(--text-muted)', borderColor: 'transparent' }
                }
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-all"
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {activeTab === 'appearance' && <AppearanceTab onClose={onClose} />}
          {activeTab === 'network' && <NetworkTab />}
          {activeTab === 'backup' && <BackupTab />}
          {activeTab === 'update' && <UpdateTab />}
        </div>
      </div>
    </div>
  );
}
