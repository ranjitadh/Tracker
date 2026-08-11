import { create } from "zustand";
import { api } from "@/services/api/client";
import type { SyncState, SyncQueueItem, AuditEvent } from "@/types";

interface SyncStore {
  state: SyncState | null;
  queue: SyncQueueItem[];
  auditEvents: AuditEvent[];
  lastResult: { flushed: number; message: string } | null;
  error: string | null;

  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  refreshAudit: () => Promise<void>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  state: null,
  queue: [],
  auditEvents: [],
  lastResult: null,
  error: null,

  async refresh() {
    try {
      const state = await api.getSyncState();
      set({ state: { backendUrl: null, ...state } });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load sync state" });
    }
  },

  async syncNow() {
    set({ error: null });
    try {
      const result = await api.syncNow();
      set({ lastResult: { flushed: result.flushed, message: `${result.flushed} item(s) synced` } });
      await get().refresh();
      await get().refreshQueue();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Sync failed" });
    }
  },

  async refreshQueue() {
    const queue = await api.getQueue();
    set({ queue });
  },

  async refreshAudit() {
    const auditEvents = await api.listAuditEvents();
    set({ auditEvents });
  },
}));
