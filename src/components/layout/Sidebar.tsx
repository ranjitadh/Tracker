import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Camera,
  FolderKanban,
  Settings,
  Timer,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavStore, type View } from "@/stores/navStore";
import { useTrackerStore } from "@/stores/trackerStore";

const navItems: Array<{ view: View; label: string; icon: React.ElementType; adminOnly?: boolean }> = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "timesheet", label: "Timesheet", icon: CalendarDays },
  { view: "screenshots", label: "Screenshots", icon: Camera },
  { view: "projects", label: "Projects", icon: FolderKanban },
  { view: "admin", label: "Admin Panel", icon: ShieldCheck },
  { view: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const view = useNavStore((s) => s.view);
  const navigate = useNavStore((s) => s.navigate);
  const phase = useTrackerStore((s) => s.phase);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  return (
    <div className="relative flex shrink-0">
      <aside
        className={cn(
          "flex shrink-0 flex-col bg-slate-50 border-r border-slate-200/80 transition-all duration-200 ease-in-out select-none",
          collapsed ? "w-16 items-center px-2" : "w-56 px-3",
        )}
      >
        {/* Sidebar Header */}
        <div
          className={cn(
            "flex items-center py-4 w-full",
            collapsed ? "justify-center" : "justify-start px-2",
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white font-semibold shadow-xs">
              <Timer className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="truncate">
                <div className="text-sm font-bold tracking-tight leading-none text-foreground">Time Tracker</div>
                <div className="mt-1 text-[11px] font-medium text-muted-foreground truncate">Work Analytics</div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="mt-2 flex w-full flex-col gap-1.5">
          {navItems.map((item) => {
            const active = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => navigate(item.view)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-all",
                  collapsed ? "h-10 w-10 justify-center mx-auto" : "gap-3 px-3 py-2 w-full",
                  active
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Status Card */}
        <div className="mt-auto pb-5 w-full">
          {collapsed ? (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface mx-auto"
              title={phase === "idle" ? "Stopped" : phase === "paused" ? "Paused" : "Tracking"}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  phase === "idle"
                    ? "bg-slate-400"
                    : phase === "paused"
                      ? "bg-amber-500"
                      : "bg-emerald-500 animate-pulse",
                )}
              />
            </div>
          ) : (
            <div
              className={cn(
                "rounded-xl border p-3.5 transition-all",
                phase === "idle"
                  ? "border-border/80 bg-surface/80"
                  : "border-emerald-200/80 bg-emerald-50/50",
              )}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    phase === "idle"
                      ? "bg-slate-400"
                      : phase === "paused"
                        ? "bg-amber-500"
                        : "bg-emerald-600 animate-pulse",
                  )}
                />
                <span className="text-foreground">
                  {phase === "idle" ? "Stopped" : phase === "paused" ? "Paused" : "Tracking"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {phase === "idle"
                  ? "Start a session whenever you're ready."
                  : "You're visibly being tracked. Pause anytime."}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Toggle button — centered on the border line */}
      <button
        type="button"
        onClick={toggleCollapse}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute right-0 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-900 transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
