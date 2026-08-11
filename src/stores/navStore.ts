import { create } from "zustand";

export type View = "dashboard" | "timesheet" | "screenshots" | "projects" | "settings" | "admin";

interface NavState {
  view: View;
  navigate: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: "dashboard",
  navigate: (view) => set({ view }),
}));
