import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Camera,
  CalendarClock,
  FolderKanban,
  Hand,
  Pause,
  Play,
  RotateCcw,
  Square,
  Wifi,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartTooltip, XAxis, YAxis } from "recharts";
import { api, isTauriRuntime } from "@/services/api/client";
import { useTrackerStore } from "@/stores/trackerStore";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { formatDuration, formatTime, formatSyncStatus } from "@/services/format";
import { formatCountdown } from "@/services/activity";
import type { Project, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ActivityRing } from "@/components/tracker/ActivityRing";
import { TimerDisplay } from "@/components/tracker/TimerDisplay";
import { ScreenshotThumb } from "@/components/tracker/ScreenshotThumb";
import { StartSessionDialog } from "@/components/tracker/StartSessionDialog";
import { RecoveryDialog } from "@/components/tracker/RecoveryDialog";
import { CaptureNotice } from "@/components/tracker/CaptureNotice";
import { useDashboardData } from "@/hooks/useDashboardData";

function ProjectLabel({ projectId, taskId }: { projectId: string; taskId: string | null }) {
  const [project, setProject] = useState<Project | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  useEffect(() => {
    api.listProjects().then((list) => setProject(list.find((p) => p.id === projectId) ?? null));
    if (taskId) api.listTasks(projectId).then((list) => setTask(list.find((t) => t.id === taskId) ?? null));
  }, [projectId, taskId]);

  return (
    <div className="flex items-center gap-2">
      {project && (
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
          {project.name}
        </span>
      )}
      {task && <Badge variant="muted">{task.name}</Badge>}
    </div>
  );
}

export function Dashboard() {
  const tracker = useTrackerStore();
  const settings = useAuthStore((s) => s.settings);
  const syncState = useSyncStore((s) => s.state);
  const { data } = useDashboardData();
  const [startOpen, setStartOpen] = useState(false);

  const { phase, session, capturePlan, lastCaptureAt, idle, idleSeconds, elapsed } = tracker;

  const projectTaskIdRef = useRef<{ projectId: string | null; taskId: string | null }>({ projectId: null, taskId: null });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      setProjectId(session.projectId);
      setTaskId(session.taskId);
    }
  }, [session]);

  // Live tick while running.
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => tracker.tick(), 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // Fake input sampling for mock/dev so activity is visible.
  // In the Tauri build real input arrives via the tracker:input event.
  useEffect(() => {
    if (phase !== "running" || isTauriRuntime()) return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (Math.random() < 0.65) {
        tracker.registerInput("keyboard", Math.floor(Math.random() * 3) + 1);
      }
      if (Math.random() < 0.4) {
        tracker.registerInput("click", 1);
      }
      if (Math.random() < 0.8) {
        tracker.registerInput("move", Math.floor(Math.random() * 400));
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [phase, tracker]);

  const nextCaptureIn = useMemo(() => {
    if (phase !== "running" || !capturePlan || !settings?.screenCaptureEnabled) return null;
    return Math.max(0, capturePlan.nextAt - Date.now());
  }, [phase, capturePlan, settings?.screenCaptureEnabled]);

  const graphData = useMemo(() => {
    return (data?.todayBlocks ?? []).map((b, i) => ({
      index: i + 1,
      activity: b.activityPercentage,
      keyboard: b.keyboardCount,
    }));
  }, [data]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        {/* ── Main focus card ─────────────────────────────── */}
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-lg">Focus session</CardTitle>
              <CardDescription>
                {session
                  ? "Everything below is recorded and visible to you."
                  : "Select a project and start when ready."}
              </CardDescription>
            </div>
            {session && phase === "running" && (
              <Badge variant="positive">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
                Recording
              </Badge>
            )}
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-6 pb-8 pt-2">
            <div className="mt-2 flex items-center gap-3">
              {session && projectId ? (
                <ProjectLabel projectId={projectId} taskId={taskId} />
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderKanban className="h-4 w-4" />
                  No project selected
                </span>
              )}
            </div>

            <TimerDisplay />

            <div className="flex items-center gap-3">
              {phase === "idle" ? (
                <Button size="lg" className="gap-2 rounded-full px-8" onClick={() => setStartOpen(true)}>
                  <Play className="h-5 w-5" />
                  Start tracking
                </Button>
              ) : phase === "running" ? (
                <>
                  <Button size="lg" variant="outline" className="gap-2 rounded-full px-6" onClick={() => tracker.pause()}>
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                  <Button size="lg" variant="destructive" className="gap-2 rounded-full px-6" onClick={() => tracker.stop()}>
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" variant="success" className="gap-2 rounded-full px-6" onClick={() => tracker.resume()}>
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                  <Button size="lg" variant="outline" className="gap-2 rounded-full px-6" onClick={() => tracker.stop()}>
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                </>
              )}
            </div>

            {/* Status row */}
            <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  Activity
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {idle ? "Idle" : formatDuration(elapsed, true)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Camera className="h-3 w-3" />
                  Next capture
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums">
                  {nextCaptureIn !== null ? `within ${formatCountdown(nextCaptureIn)}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  Session status
                </div>
                <div className="mt-1 text-sm font-semibold capitalize">{phase}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Right panel ──────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <ActivityRing value={data?.todayActivityPercentage ?? 0} size={84} label="activity" />
                <div className="flex flex-col items-end gap-1 text-right">
                  <div className="text-2xl font-bold tabular-nums">
                    {formatDuration(data?.todayTotalSeconds ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">tracked today</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDuration(data?.todayIdleSeconds ?? 0)} idle
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Screenshots today</span>
                  <span className="font-semibold">{data?.todayScreenshotCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Sync</span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Wifi
                      className={
                        syncState?.mode === "offline" ? "h-3 w-3 text-warning" : "h-3 w-3 text-positive"
                      }
                    />
                    {syncState?.mode === "offline" ? "Offline" : formatSyncStatus("synced")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last screenshot</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.todayScreenshots?.[0] ? (
                <ScreenshotThumb shot={data.todayScreenshots[0]} />
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
                  <Camera className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    {settings?.screenCaptureEnabled
                      ? "No screenshots yet — they'll appear here."
                      : "Screen capture is disabled."}
                  </p>
                </div>
              )}
              {lastCaptureAt && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Last captured {formatTime(new Date(lastCaptureAt).toISOString())}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Bottom: timeline / graph / screenshots ─────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activity timeline</CardTitle>
            <CardDescription>10-minute blocks of aggregate activity</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {graphData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={graphData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F8CFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4F8CFF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#263241" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="index"
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v * 10}m`}
                  />
                  <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <RechartTooltip
                    contentStyle={{ backgroundColor: "#131A22", border: "1px solid #263241", borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: "#8A99AD" }}
                    formatter={(value) => [`${value}%`, "activity"]}
                  />
                  <Area type="monotone" dataKey="activity" stroke="#4F8CFF" strokeWidth={2} fill="url(#activityFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No activity blocks yet today.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent screenshots</CardTitle>
            <CardDescription>Previewed instantly after capture</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.todayScreenshots.length ? (
              <div className="grid grid-cols-3 gap-3">
                {data.todayScreenshots.slice(0, 6).map((shot) => (
                  <ScreenshotThumb key={shot.id} shot={shot} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
                No screenshots captured yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs & overlays */}
      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        onStart={async (p, t, n) => {
          await tracker.start(p, t, n);
          projectTaskIdRef.current = { projectId: p, taskId: t };
        }}
      />
      <RecoveryDialog
        session={tracker.recoveredSession}
        onContinue={tracker.continueRecovered}
        onDiscard={tracker.discardRecovered}
      />
      <CaptureNotice
        visible={tracker.captureNoticeVisible}
        onDismiss={tracker.dismissCaptureNotice}
        screenshot={tracker.recentScreenshots[0] ?? data?.todayScreenshots?.[0] ?? null}
      />
    </div>
  );
}
