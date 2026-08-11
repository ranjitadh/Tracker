import { useEffect, useState } from "react";
import {
  Users,
  ShieldCheck,
  Camera,
  Activity,
  BarChart3,
  Building2,
  Sliders,
  Play,
  Pause,
  UserCheck,
  Search,
  Filter,
  Keyboard,
  MousePointer,
  Zap,
  Trash2,
} from "lucide-react";
import { api } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";
import type { DashboardData, Screenshot, User } from "@/types";
import { formatDuration } from "@/services/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScreenshotModal } from "@/components/tracker/ScreenshotModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function AdminPanel() {
  const workspace = useAuthStore((s) => s.workspace);
  const currentUser = useAuthStore((s) => s.user);
  const settings = useAuthStore((s) => s.settings);
  const setSettings = useAuthStore((s) => s.setSettings);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("all");
  const [selectedShot, setSelectedShot] = useState<Screenshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Mock team roster representing workspace users for admin view
  const teamUsers: User[] = [
    {
      id: currentUser?.id ?? "u-admin",
      name: currentUser?.name ?? "Admin User",
      email: currentUser?.email ?? "admin@admin.com",
      role: "owner",
      avatarUrl: null,
    },
    {
      id: "u-1",
      name: "Alex Rivera",
      email: "alex@acme.test",
      role: "member",
      avatarUrl: null,
    },
    {
      id: "u-2",
      name: "Sam Chen",
      email: "sam@acme.test",
      role: "admin",
      avatarUrl: null,
    },
    {
      id: "u-3",
      name: "Jordan Lee",
      email: "jordan@acme.test",
      role: "member",
      avatarUrl: null,
    },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, shots] = await Promise.all([
        api.getDashboard(),
        api.listScreenshots(),
      ]);
      setDashboard(dash);
      setScreenshots(shots);
      setSelectedIds(new Set());
    } catch (err) {
      console.warn("Failed loading admin panel data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredShots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredShots.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.allSettled(ids.map((id) => api.deleteScreenshot(id)));
      setSelectedIds(new Set());
      await loadData();
    } catch (err) {
      console.warn("Failed bulk deletion:", err);
    } finally {
      setDeleting(false);
    }
  };

  const totalTeamSeconds = (dashboard?.todayActiveSeconds ?? 0) * 3 + 14400; // Simulated team aggregate
  const filteredShots =
    selectedUserFilter === "all"
      ? screenshots
      : screenshots.filter((_, idx) => idx % 2 === (selectedUserFilter === "u-1" ? 0 : 1));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Admin Panel — {workspace?.name ?? "Workspace"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Workspace admin dashboard to monitor team members, activity breakdown, screenshots, and security settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="positive" className="gap-1.5 px-3 py-1 text-xs">
            <UserCheck className="h-3.5 w-3.5" />
            Admin Access Granted
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Team Members
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamUsers.length} Users</div>
            <p className="text-xs text-muted-foreground mt-1">1 Owner · 1 Admin · 2 Members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team Hours Tracked Today
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-positive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(totalTeamSeconds, true)}</div>
            <p className="text-xs text-positive mt-1">Across all workspace sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team Activity Level
            </CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(dashboard?.todayActivityPercentage ?? 84)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Keyboard & mouse event rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Screenshot Frequency
            </CardTitle>
            <Camera className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{settings?.screenshotFrequencyMinutes ?? 5} min interval</div>
            <p className="text-xs text-muted-foreground mt-1">Standard Mode (5 min capture)</p>
          </CardContent>
        </Card>
      </div>

      {/* Team Roster Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Roster & Live Status
          </CardTitle>
          <CardDescription>
            Overview of team members in {workspace?.name ?? "this workspace"} and their current tracking state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border rounded-xl border border-border">
            {teamUsers.map((user, idx) => {
              const isCurrent = user.id === currentUser?.id;
              const isTracking = idx === 0 || idx === 1;
              return (
                <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {user.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{user.name}</span>
                        {isCurrent && <Badge variant="outline">You</Badge>}
                        <Badge variant={user.role === "owner" ? "default" : user.role === "admin" ? "positive" : "muted"}>
                          {user.role}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs">
                    <div>
                      <div className="font-medium text-foreground">
                        {isTracking ? "Website Redesign" : "Mobile App"}
                      </div>
                      <div className="text-muted-foreground">{isTracking ? "Logo exploration" : "API Integration"}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isTracking ? "bg-positive animate-pulse" : "bg-muted-foreground/50"
                        }`}
                      />
                      <span className="font-medium">{isTracking ? "Tracking Active" : "Stopped"}</span>
                    </div>

                    <div className="font-semibold">{formatDuration((idx + 1) * 7200, true)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Admin Settings & Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            Workspace Tracking Controls
          </CardTitle>
          <CardDescription>
            Configure default screenshot interval frequency and privacy parameters for all team members.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Screenshot Capture Frequency</Label>
              <Select
                value={String(settings?.screenshotFrequencyMinutes ?? 1)}
                onValueChange={(v) => setSettings({ screenshotFrequencyMinutes: parseInt(v, 10) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 minute (Testing Mode)</SelectItem>
                  <SelectItem value="5">5 minutes (Standard)</SelectItem>
                  <SelectItem value="10">10 minutes (Default)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Idle Timeout Trigger</Label>
              <Select
                value={String(settings?.idleTimeoutMinutes ?? 5)}
                onValueChange={(v) => setSettings({ idleTimeoutMinutes: parseInt(v, 10) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timeout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 minutes</SelectItem>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="10">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Screenshots Inspection Gallery */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              All Users' Screenshots Gallery
            </CardTitle>
            <CardDescription>
              Admin view to inspect captured screenshots for all team members across workspace sessions.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filteredShots.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAll} className="gap-1.5 border-border">
                {selectedIds.size === filteredShots.length ? "Deselect All" : "Select All"}
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={handleBulkDelete}
                className="gap-1.5 shadow-sm"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </Button>
            )}
            <Filter className="h-4 w-4 text-muted-foreground ml-2" />
            <Select value={selectedUserFilter} onValueChange={setSelectedUserFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team Members</SelectItem>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredShots.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No screenshots captured yet. Click <strong>Start tracking</strong> to generate screenshots!
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredShots.map((shot, i) => {
                const assignedUser = teamUsers[i % teamUsers.length];
                const isSelected = selectedIds.has(shot.id);
                return (
                  <div
                    key={shot.id}
                    onClick={() => setSelectedShot(shot)}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-surface transition-all hover:shadow-lg ${
                      isSelected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(shot.id);
                      }}
                      className={`absolute left-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-md border text-xs shadow-md transition-transform active:scale-95 ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground font-bold"
                          : "border-white/60 bg-black/50 text-white/70 hover:bg-black/80 hover:text-white"
                      }`}
                      title={isSelected ? "Deselect" : "Select"}
                    >
                      {isSelected ? "✓" : ""}
                    </button>
                    <div className="relative aspect-video w-full overflow-hidden bg-background">
                      <img
                        src={
                          shot.previewDataUrl ||
                          `data:image/svg+xml;base64,${btoa(
                            `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#131A22"/><stop offset="1" stop-color="#1A232E"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="20" y="20" width="200" height="20" rx="10" fill="#263241"/><rect x="20" y="60" width="600" height="240" rx="12" fill="#131A22" opacity="0.9"/><text x="320" y="185" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#4F8CFF">Screenshot ${i + 1}</text></svg>`
                          )}`
                        }
                        alt="Screenshot"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <Badge className="absolute bottom-2 right-2 bg-background/80 backdrop-blur text-[10px]">
                        {new Date(shot.capturedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Badge>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{assignedUser.name}</span>
                        <Badge variant={shot.uploadStatus === "uploaded" ? "positive" : "default"}>
                          {shot.uploadStatus}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200">
                          <Keyboard className="h-3 w-3 text-slate-500" />
                          <span>42</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200">
                          <MousePointer className="h-3 w-3 text-slate-500" />
                          <span>18</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 border border-blue-200 font-semibold">
                          <Zap className="h-3 w-3 text-blue-600" />
                          <span>84%</span>
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10px] text-muted-foreground truncate">
                        Display #{shot.screenNumber} · {shot.redactionApplied ? "Blurred" : "Full Resolution"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ScreenshotModal shot={selectedShot} onClose={() => setSelectedShot(null)} />
    </div>
  );
}
