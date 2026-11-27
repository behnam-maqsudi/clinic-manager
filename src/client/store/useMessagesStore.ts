import { create } from 'zustand';
import type { ClinicMessage, UserRole } from '../../shared/types';
import { useAppStore } from './useAppStore';

interface MessagesState {
  messages: ClinicMessage[];
  messagesModalOpen: boolean;

  fetchMessages: () => Promise<void>;
  appendMessage: (msg: ClinicMessage) => void;
  openMessagesModal: () => Promise<void>;
  closeMessagesModal: () => void;
  markMessagesAsRead: (targetRole: UserRole) => Promise<void>;
  sendChatMessage: (body: string) => Promise<boolean>;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messages: [],
  messagesModalOpen: false,

  fetchMessages: async () => {
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      if (data.ok) {
        set({ messages: data.messages || [] });
      }
    } catch {}
  },

  appendMessage: (msg) => {
    set((state) => ({
      messages: state.messages.some((m) => m.id === msg.id) ? state.messages : [...state.messages, msg],
    }));
  },

  markMessagesAsRead: async (targetRole) => {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });
      const now = new Date().toISOString();
      set((state) => ({
        messages: state.messages.map((m) =>
          !m.read_at && m.sender_role !== targetRole && (m.recipient_role === targetRole || m.recipient_role === 'all')
            ? { ...m, read_at: now }
            : m
        ),
      }));
    } catch {}
  },

  openMessagesModal: async () => {
    set({ messagesModalOpen: true });
    await get().markMessagesAsRead(useAppStore.getState().role);
  },

  closeMessagesModal: () => set({ messagesModalOpen: false }),

  sendChatMessage: async (body) => {
    const { role, notify } = useAppStore.getState();
    try {
      const recipientRole: UserRole = role === 'doctor' ? 'secretary' : 'doctor';
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_role: role, recipient_role: recipientRole, body, kind: 'chat' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        notify(data.message || 'خطا در ارسال پیام');
        return false;
      }
      if (data.message) {
        get().appendMessage(data.message);
      }
      return true;
    } catch {
      notify('خطا در ارتباط با سرور هنگام ارسال پیام');
      return false;
    }
  },
}));
