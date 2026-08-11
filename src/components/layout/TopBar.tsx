import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  CloudUpload,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { useTrackerStore } from "@/stores/trackerStore";
import { TrackingIndicator } from "./TrackingIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const workspaces = useAuthStore((s) => s.workspaces);
  const workspace = useAuthStore((s) => s.workspace);
  const settings = useAuthStore((s) => s.settings);
  const selectWorkspace = useAuthStore((s) => s.selectWorkspace);
  const setSettings = useAuthStore((s) => s.setSettings);
  const logout = useAuthStore((s) => s.logout);

  const syncState = useSyncStore((s) => s.state);
  const syncNow = useSyncStore((s) => s.syncNow);
  const phase = useTrackerStore((s) => s.phase);

  const [opened, setOpened] = useState(false);

  const initials = useMemo(
    () =>
      (user?.name ?? "?")
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [user],
  );

  useEffect(() => {
    if (!opened) return;
    const t = setInterval(() => useSyncStore.getState().refresh(), 4000);
    useSyncStore.getState().refresh();
    return () => clearInterval(t);
  }, [opened]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-background px-6 pt-2 pb-1">
      <div className="flex items-center gap-3">
        <TrackingIndicator />
        {settings?.privateMode && (
          <Badge variant="muted" className="rounded-full border-warning/40 bg-warning/10 px-3 py-1 text-warning">
            <ShieldCheck className="h-3 w-3" />
            Private mode
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3">

        {/* Workspace selector */}
        <DropdownMenu onOpenChange={setOpened}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 rounded-full border-slate-200/80 bg-slate-50 px-3.5 text-xs font-medium shadow-2xs transition-all hover:bg-slate-100 hover:scale-[1.02] active:scale-95 gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[140px] truncate text-xs font-medium">
                {workspace?.name ?? "Select workspace"}
              </span>
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => selectWorkspace(w.id)}
                className="justify-between"
              >
                <span className="truncate">{w.name}</span>
                {w.id === workspace?.id && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-hover">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm">Private mode</span>
                <Switch
                  checked={settings?.privateMode ?? false}
                  onCheckedChange={(v) => setSettings({ privateMode: v })}
                />
              </div>
              <p className="px-2 text-[11px] leading-snug text-muted-foreground">
                Pauses screenshot capture and app usage tracking while active.
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => syncNow()}>
              <CloudUpload className="h-4 w-4" />
              Sync now
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()} className="text-danger focus:text-danger">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
