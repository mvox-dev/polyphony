// Toast notification store
// Issue #141 - DRY: Extract shared utilities

import { writable } from "svelte/store";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// Timing constants
export const TOAST_DURATION_SUCCESS = 3000;
export const TOAST_DURATION_ERROR = 5000;
export const TOAST_DURATION_INFO = 3000;
export const TOAST_DURATION_FEEDBACK = 1500;

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);
  let nextId = 0;

  function add(message: string, type: ToastType, duration?: number) {
    const id = nextId++;
    const toast: Toast = { id, message, type };

    update((toasts) => [...toasts, toast]);

    // Auto-dismiss
    const timeout =
      duration ??
      (type === "error" ? TOAST_DURATION_ERROR : TOAST_DURATION_SUCCESS);
    setTimeout(() => {
      dismiss(id);
    }, timeout);

    return id;
  }

  function dismiss(id: number) {
    update((toasts) => toasts.filter((t) => t.id !== id));
  }

  function clear() {
    update(() => []);
  }

  return {
    subscribe,
    success: (message: string, duration?: number) =>
      add(message, "success", duration),
    error: (message: string, duration?: number) =>
      add(message, "error", duration),
    info: (message: string, duration?: number) =>
      add(message, "info", duration),
    dismiss,
    clear,
  };
}

export const toast = createToastStore();
