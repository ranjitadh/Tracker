import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Monitor,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { api } from "@/services/api/client";
import { formatDateTime, formatSyncStatus } from "@/services/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs leading-snug text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Settings() {
  const settings = useAuthStore((s) => s.settings);
  const setSettings = useAuthStore((s) => s.setSettings);
  const sync = useSyncStore();
  const [excludedApp, setExcludedApp] = useState("");
  const [excludedDomain, setExcludedDomain] = useState("");
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.listAuditEvents>>>([]);

  useEffect(() => {
    sync.refresh();
    sync.refreshQueue();
    sync.refreshAudit().then(() => {
      api.listAuditEvents().then(setAudit);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return null;
  const s = settings;

  function addExcludedApp() {
    const value = excludedApp.trim();
    if (!value || s.excludedApps.includes(value)) return;
    setSettings({ excludedApps: [...s.excludedApps, value] });
    setExcludedApp("");
  }

  function removeExcludedApp(app: string) {
    setSettings({ excludedApps: s.excludedApps.filter((a) => a !== app) });
  }

  function addExcludedDomain() {
    const value = excludedDomain.trim().toLowerCase().replace(/^https?:\/\//, "");
    if (!value || s.excludedDomains.includes(value)) return;
    setSettings({ excludedDomains: [...s.excludedDomains, value] });
    setExcludedDomain("");
  }

  function removeExcludedDomain(domain: string) {
    setSettings({ excludedDomains: s.excludedDomains.filter((d) => d !== domain) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Everything here is yours. Change capture, privacy and sync behavior anytime.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="general" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="exclusions" className="gap-2">
            <EyeOff className="h-4 w-4" />
            Exclusions
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Monitor className="h-4 w-4" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <Cloud className="h-4 w-4" />
            Sync & storage
          </TabsTrigger>
          <TabsTrigger value="privacy-explainer" className="gap-2">
            <Info className="h-4 w-4" />
            Privacy model
          </TabsTrigger>
        </TabsList>

        {/* ── General ─────────────────────────────────────── */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Tracking behavior</CardTitle>
              <CardDescription>How tracking, idle handling and captures behave.</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                title="Idle timeout"
                description="Minutes of inactivity before you're considered idle."
              >
                <Select
                  value={String(settings.idleTimeoutMinutes)}
                  onValueChange={(v) => setSettings({ idleTimeoutMinutes: parseInt(v, 10) })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10, 15].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} minute{m > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator />
              <SettingRow
                title="Auto-pause on idle"
                description="Pause the timer automatically when the idle timeout is reached (workspace policy)."
              >
                <Switch
                  checked={settings.autoPauseOnIdle}
                  onCheckedChange={(v) => setSettings({ autoPauseOnIdle: v })}
                />
              </SettingRow>
              <Separator />
              <SettingRow
                title="Screenshot frequency"
                description="One screenshot at a random time within each N-minute block."
              >
                <Select
                  value={String(settings.screenshotFrequencyMinutes)}
                  onValueChange={(v) => setSettings({ screenshotFrequencyMinutes: parseInt(v, 10) })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 30].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        every {m} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator />
              <SettingRow
                title="Data retention"
                description="Local data older than this is auto-deleted. Stored encrypted."
              >
                <Select
                  value={String(settings.dataRetentionDays)}
                  onValueChange={(v) => setSettings({ dataRetentionDays: parseInt(v, 10) })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[30, 60, 90, 180, 365].map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Privacy ─────────────────────────────────────── */}
        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Capture & privacy</CardTitle>
              <CardDescription>
                Only aggregate metrics are stored. Nothing about keystroke content, passwords or
                clipboard is ever recorded.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                title="Screen capture"
                description="Allow periodic screenshots during active tracking."
              >
                <Switch
                  checked={settings.screenCaptureEnabled}
                  onCheckedChange={(v) => setSettings({ screenCaptureEnabled: v })}
                />
              </SettingRow>
              <Separator />
              <SettingRow
                title="Capture displays"
                description="Primary display only, or all connected displays."
              >
                <Select
                  value={settings.screenCaptureMode}
                  onValueChange={(v) => setSettings({ screenCaptureMode: v as "primary" | "all" })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary display</SelectItem>
                    <SelectItem value="all">All displays</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <Separator />
              <SettingRow
                title="Blur sensitive content"
                description="Apply a blur to screenshots to redact sensitive text."
              >
                <Switch
                  checked={settings.screenshotBlur}
                  onCheckedChange={(v) => setSettings({ screenshotBlur: v })}
                />
              </SettingRow>
              <Separator />
              <SettingRow
                title="Application usage tracking"
                description="Record app names and durations (never window titles, URLs or typed text)."
              >
                <Switch
                  checked={settings.trackAppUsage}
                  onCheckedChange={(v) => setSettings({ trackAppUsage: v })}
                />
              </SettingRow>
              <Separator />
              <SettingRow
                title="Private mode"
                description="Pause screenshot capture and app usage while enabled. You stay in control."
              >
                <Switch
                  checked={settings.privateMode}
                  onCheckedChange={(v) => setSettings({ privateMode: v })}
                />
              </SettingRow>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Exclusions ──────────────────────────────────── */}
        <TabsContent value="exclusions">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Excluded applications</CardTitle>
                <CardDescription>
                  Screenshots and app usage will not be captured while these apps are focused.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={excludedApp}
                    onChange={(e) => setExcludedApp(e.target.value)}
                    placeholder="e.g. Keychain Access"
                    onKeyDown={(e) => e.key === "Enter" && addExcludedApp()}
                  />
                  <Button onClick={addExcludedApp} disabled={!excludedApp.trim()}>
                    Add
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {settings.excludedApps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No excluded apps.</p>
                  ) : (
                    settings.excludedApps.map((app) => (
                      <Badge key={app} variant="outline" className="gap-2 py-1">
                        {app}
                        <button
                          onClick={() => removeExcludedApp(app)}
                          className="text-muted-foreground hover:text-danger"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Excluded domains</CardTitle>
                <CardDescription>
                  Websites whose content you'd rather not have captured.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    value={excludedDomain}
                    onChange={(e) => setExcludedDomain(e.target.value)}
                    placeholder="e.g. bank.example.com"
                    onKeyDown={(e) => e.key === "Enter" && addExcludedDomain()}
                  />
                  <Button onClick={addExcludedDomain} disabled={!excludedDomain.trim()}>
                    Add
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {settings.excludedDomains.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No excluded domains.</p>
                  ) : (
                    settings.excludedDomains.map((domain) => (
                      <Badge key={domain} variant="outline" className="gap-2 py-1">
                        {domain}
                        <button
                          onClick={() => removeExcludedDomain(domain)}
                          className="text-muted-foreground hover:text-danger"
                        >
                          <XCircle className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Permissions ─────────────────────────────────── */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle>Screen capture permissions</CardTitle>
              <CardDescription>
                The native layer needs explicit OS permission to capture screens and observe activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PermissionCard
                title="Screen Recording"
                state="granted"
                detail="Capturing the primary display. You'll always see a preview and an in-app notification."
              />
              <PermissionCard
                title="Input Monitoring / Accessibility"
                state="granted"
                detail="Aggregate keyboard & mouse counts only. Content is never read or stored."
              />
              <Alert className="border-primary/20 bg-primary/5">
                <Monitor className="h-4 w-4 text-primary" />
                <AlertTitle>How to enable macOS permissions</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>1. Open <strong>System Settings → Privacy &amp; Security</strong>.</p>
                  <p>2. Select <strong>Screen Recording</strong>, then <strong>Accessibility</strong>.</p>
                  <p>3. Enable "Time Tracker". You may need to restart the app after granting.</p>
                  <p>On Windows, screen capture uses the modern Windows Graphics Capture API and grants
                  automatically after you approve the system prompt once.</p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sync & storage ──────────────────────────────── */}
        <TabsContent value="sync">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Sync status</CardTitle>
                <CardDescription>
                  Everything is stored locally first. Sync happens automatically when online, with
                  retry and exponential backoff on failure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatBox
                    label="Status"
                    value={sync.state?.mode === "offline" ? "Offline" : "Online"}
                    tone={sync.state?.mode === "offline" ? "warning" : "positive"}
                  />
                  <StatBox label="Pending" value={String(sync.state?.pendingCount ?? 0)} />
                  <StatBox label="Failed" value={String(sync.state?.failedCount ?? 0)} tone={sync.state?.failedCount ? "danger" : "muted"} />
                  <StatBox
                    label="Last sync"
                    value={sync.state?.lastSyncAt ? formatDateTime(new Date(sync.state.lastSyncAt).toISOString()) : "Never"}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={() => sync.syncNow()} disabled={sync.state?.syncing} className="gap-2">
                    {sync.state?.syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Sync now
                  </Button>
                  <Badge variant="muted">
                    <Database className="h-3 w-3" />
                    Backend: {sync.state?.usingMock ? "mock (offline-ready)" : "Tauri native"}
                  </Badge>
                </div>
                {sync.error && (
                  <p className="text-xs text-danger">{sync.error}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Encryption & storage</CardTitle>
                <CardDescription>
                  Screenshots and session metadata are encrypted with AES-256-GCM on disk. The key is
                  stored in the OS keychain and never leaves the device.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-positive" />
                    Local database: <strong>encrypted</strong> at rest
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-positive" />
                    Screenshots: <strong>encrypted before upload</strong>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-positive" />
                    Sync queue: <strong>durable</strong> across restarts
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sync queue</CardTitle>
                <CardDescription>Items waiting to reach the backend.</CardDescription>
              </CardHeader>
              <CardContent>
                {sync.queue.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Queue is empty — everything is synced.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sync.queue.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs">
                          {item.entityType}/{item.operation}
                        </span>
                        <Badge
                          variant={item.status === "failed" ? "destructive" : item.status === "in_flight" ? "default" : "warning"}
                        >
                          {item.status}
                          {item.attempts > 0 ? ` · ${item.attempts} retries` : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4" />
                  Audit log
                </CardTitle>
                <CardDescription>Structured events for transparency and accountability.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {audit.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No audit events yet.</p>
                  ) : (
                    audit.slice(0, 30).map((event) => (
                      <div key={event.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs">
                        <Badge variant="muted" className="shrink-0">{event.eventType}</Badge>
                        <span className="flex-1 text-muted-foreground">{event.detail}</span>
                        <span className="shrink-0 text-muted-foreground/60">{formatDateTime(event.timestamp)}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Privacy explainer ───────────────────────────── */}
        <TabsContent value="privacy-explainer">
          <Card>
            <CardHeader>
              <CardTitle>How your privacy is protected</CardTitle>
              <CardDescription>Designed to be transparent, never hidden surveillance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <PrivacyPoint title="Only aggregates, never content">
                We record counts — keystrokes, clicks, movement — never the characters typed, passwords,
                clipboard contents, mouse coordinates, URLs, or window titles.
              </PrivacyPoint>
              <PrivacyPoint title="Visible tracking, always">
                A prominent "Tracking active" indicator shows in the app and the system tray. Tracking
                never starts silently: you must explicitly start a session.
              </PrivacyPoint>
              <PrivacyPoint title="Screenshots you can see">
                Every screenshot is previewed to you the moment it's taken, encrypted on disk before
                upload, and deletable before sync where the workspace policy allows.
              </PrivacyPoint>
              <PrivacyPoint title="Pause and exclude anything">
                Pause, private mode, excluded apps and excluded domains — you stay in control of what
                is captured and when.
              </PrivacyPoint>
              <PrivacyPoint title="Works offline, syncs later">
                All data is stored locally first. A durable queue retries sync with exponential backoff
                until it reaches your backend.
              </PrivacyPoint>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermissionCard({ title, state, detail }: { title: string; state: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <Monitor className="h-5 w-5 text-primary" />
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
      <Badge variant={state === "granted" ? "positive" : "warning"}>
        {state === "granted" ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <XCircle className="h-3 w-3" />
        )}
        {state}
      </Badge>
    </div>
  );
}

function StatBox({ label, value, tone = "muted" }: { label: string; value: string; tone?: "positive" | "warning" | "danger" | "muted" }) {
  const color = {
    positive: "text-positive",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-foreground",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function PrivacyPoint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-positive" />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export { formatSyncStatus };
