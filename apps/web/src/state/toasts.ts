import { create } from 'zustand';

export interface Toast {
  id: number;
  tone: 'info' | 'error';
  message: string;
}

interface ToastState {
  toasts: readonly Toast[];
  show: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Short messages in the bottom-right corner (ux.md §1): failures, confirmations. */
export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, tone = 'info') => {
    set({ toasts: [...get().toasts, { id: nextId++, tone, message }] });
  },
  dismiss: (id) => {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
}));
