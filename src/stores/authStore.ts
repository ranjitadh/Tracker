import { create } from "zustand";
import { api, isTauriRuntime } from "@/services/api/client";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { User, Workspace, AppSettings } from "@/types";

interface AuthState {
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workspaces: [],
  workspace: null,
  settings: null,
  loading: false,
  error: null,
  initialized: false,

  async initialize() {
    // If running in Desktop App mode, auto-bypass authentication
    if (isTauriRuntime()) {
      try {
        await get().login("admin@admin.com", "admin");
      } catch {
        // Fallback login
      }
      if (!get().user) {
        const defaultUser: User = { id: "u-desktop", name: "Desktop User", email: "admin@admin.com", role: "owner", avatarUrl: null };
        const workspaces = (await api.listWorkspaces().catch(() => [])) as Workspace[];
        const workspace = workspaces[0] ?? {
          id: "w-desktop",
          name: "Local Workspace",
          logoUrl: null,
          role: "owner",
          companyPolicy: { allowScreenshotDeletion: true, autoPauseOnIdle: true, requireManualNotes: false, screenshotFrequencyMinutes: 5 },
        };
        const settings = await api.getSettings().catch(() => null);
        set({ user: defaultUser, workspaces: workspaces.length ? workspaces : [workspace], workspace, settings });
      }
      set({ initialized: true });
      return;
    }

    // If Supabase is configured, try to restore an existing session.
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Restore user from the existing Supabase session.
          const profile = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          const user: User = profile.data
            ? {
                id: profile.data.id as string,
                name: profile.data.name as string,
                email: profile.data.email as string,
                role: (profile.data.role as User["role"]) ?? "member",
                avatarUrl: (profile.data.avatar_url as string) ?? null,
              }
            : {
                id: session.user.id,
                name: session.user.email?.split("@")[0] ?? "User",
                email: session.user.email ?? "",
                role: "member",
                avatarUrl: null,
              };

          const workspaces = await api.listWorkspaces();
          const workspace = workspaces[0] ?? null;
          let settings: AppSettings | null = null;
          if (workspace) {
            settings = (await api.selectWorkspace(workspace.id)).settings;
          }
          set({ user, workspaces, workspace, settings, initialized: true });
          return;
        }
      } catch {
        // Session restoration failed — fall through to show login.
      }

      // Listen for future auth state changes (e.g., token refresh).
      supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          set({ user: null, workspace: null, workspaces: [], settings: null });
        }
      });
    }

    set({ initialized: true });
  },

  async login(email, password) {
    set({ loading: true, error: null });
    try {
      const { user, workspaces } = await api.login({ email, password });
      const workspace = workspaces[0] ?? null;
      let settings: AppSettings | null = null;
      if (workspace) {
        settings = (await api.selectWorkspace(workspace.id)).settings;
      }
      set({ user, workspaces, workspace, settings, loading: false, initialized: true });
      return true;
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : "Login failed" });
      return false;
    }
  },

  async logout() {
    await api.logout();
    set({ user: null, workspace: null, workspaces: [], settings: null });
  },

  async selectWorkspace(workspaceId) {
    set({ loading: true });
    const { settings } = await api.selectWorkspace(workspaceId);
    set({
      workspace: get().workspaces.find((w) => w.id === workspaceId) ?? null,
      settings,
      loading: false,
    });
  },

  async refreshWorkspaces() {
    const workspaces = await api.listWorkspaces();
    set((state) => ({
      workspaces,
      workspace: workspaces.find((w) => w.id === state.workspace?.id) ?? workspaces[0] ?? null,
    }));
  },

  async setSettings(patch) {
    const settings = await api.updateSettings(patch);
    set({ settings });
  },
}));
