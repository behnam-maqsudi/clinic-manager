import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Stethoscope, UserCheck, Wifi, X } from 'lucide-react';
import type { ClinicMessage, UserRole } from '../../shared/types';
import { logUiEvent } from '../utils/debugLogger';

interface MessagesModalProps {
  open: boolean;
  onClose: () => void;
  role: UserRole;
  messages: ClinicMessage[];
  onSendMessage: (body: string) => Promise<boolean>;
  onConnectPeer?: (url: string) => void;
}

const DOCTOR_PRESETS = [
  'بیمار بعدی را بفرستید',
  'لطفاً پرونده را بیاورید',
  'چند دقیقه استراحت',
  'لطفاً به اتاق پزشک بیایید',
];

const SECRETARY_PRESETS = [
  'بیمار جدید منتظر است',
  'آزمایش بیمار آماده شد',
  'تماس تلفنی دارید',
  'بیمار اورژانسی است',
];

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function MessagesModal({
  open,
  onClose,
  role,
  messages,
  onSendMessage,
  onConnectPeer,
}: MessagesModalProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, messages.length]);

  if (!open) return null;

  const presets = role === 'doctor' ? DOCTOR_PRESETS : SECRETARY_PRESETS;
  const targetLabel = role === 'doctor' ? 'منشی' : 'پزشک';

  async function handleSend(bodyToSend: string) {
    const clean = bodyToSend.trim();
    if (!clean || sending) return;
    logUiEvent('MessagesModal', 'send_message', { role, length: clean.length });
    setSending(true);
    try {
      const ok = await onSendMessage(clean);
      if (ok && bodyToSend === text) {
        setText('');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="messages-modal-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
        className="rounded-2xl border max-w-lg w-full shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div
          style={{ borderColor: 'var(--border-main)' }}
          className="px-5 py-4 border-b flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
            >
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 id="messages-modal-title" className="font-bold text-sm sm:text-base">
                پیام‌های داخلی مطب (پزشک ⇄ منشی)
              </h3>
              <p style={{ color: 'var(--text-muted)' }} className="text-[11px]">
                ارسال پیام آنی به {targetLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="بستن پیام‌ها"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-2.5 min-h-[240px]">
          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
              <p style={{ color: 'var(--text-muted)' }} className="text-xs">
                هنوز پیامی رد و بدل نشده است. اولین پیام را به {targetLabel} بفرستید.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_role === role;
              const isInvite = msg.kind === 'connection_invite';
              const senderTitle =
                msg.sender_role === 'doctor' ? 'دکتر' : msg.sender_role === 'secretary' ? 'منشی' : 'سیستم';

              return (
                <div key={msg.id} className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}>
                  <div
                    style={
                      isInvite
                        ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent-soft-text)', borderColor: 'var(--accent)' }
                        : isMine
                          ? { backgroundColor: 'var(--accent)', color: '#ffffff' }
                          : { backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }
                    }
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs space-y-1.5 ${
                      isInvite ? 'border' : isMine ? '' : 'border'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 opacity-80 text-[10px] font-bold">
                      {isInvite ? (
                        <Wifi className="w-3 h-3" />
                      ) : msg.sender_role === 'doctor' ? (
                        <Stethoscope className="w-3 h-3" />
                      ) : (
                        <UserCheck className="w-3 h-3" />
                      )}
                      <span>{isInvite ? `درخواست اتصال از ${msg.meta?.fromName || senderTitle}` : senderTitle}</span>
                      <span>•</span>
                      <span>{formatTime(msg.created_at)}</span>
                    </div>
                    <p className="leading-5 whitespace-pre-wrap">{msg.body}</p>
                    {isInvite && msg.meta?.fromUrl && onConnectPeer && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => onConnectPeer(String(msg.meta.fromUrl))}
                          style={{ backgroundColor: 'var(--accent)' }}
                          className="px-3 py-1 rounded-lg text-white text-[11px] font-semibold"
                        >
                          اتصال به سیستم اصلی
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ borderColor: 'var(--border-main)' }} className="p-3.5 border-t space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={sending}
                onClick={() => handleSend(preset)}
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
                className="px-2.5 py-1 rounded-full border text-[11px] font-medium hover:opacity-80 disabled:opacity-50"
              >
                {preset}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(text);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`پیام به ${targetLabel} بنویسید...`}
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-main)' }}
              className="flex-1 rounded-xl border px-3 py-2 text-xs sm:text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              style={{ backgroundColor: 'var(--accent)' }}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              ارسال
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
