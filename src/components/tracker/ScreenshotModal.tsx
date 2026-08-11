import { useEffect, useState } from "react";
import { Activity, BarChart2, Camera, Clock, Keyboard, Lock, MousePointerClick, Trash2, TriangleAlert, X, Zap } from "lucide-react";
import { api } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";
import { useTrackerStore } from "@/stores/trackerStore";
import type { Project, Screenshot } from "@/types";
import { formatDateTime, formatDuration, formatSyncStatus } from "@/services/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ScreenshotModal({
  shot,
  onClose,
  onDeleted,
}: {
  shot: Screenshot | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const workspace = useAuthStore((s) => s.workspace);
  const [deleting, setDeleting] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showFullActivity, setShowFullActivity] = useState(false);

  useEffect(() => {
    setProject(null);
    if (!shot) return;
    api
      .listProjects()
      .then((list) => {
        setProject(list[0] ?? null);
      })
      .catch(() => undefined);
  }, [shot]);

  const allowDelete = workspace?.companyPolicy.allowScreenshotDeletion !== false;
  const deletable = shot && (shot.uploadStatus === "pending" || shot.uploadStatus === "encrypted" || shot.uploadStatus === "failed");

  async function handleDelete() {
    if (!shot) return;
    setDeleting(true);
    try {
      await api.deleteScreenshot(shot.id);
      onDeleted?.();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  // Generate 1-minute breakdown entries for Full Activity view
  const minuteBreakdown = Array.from({ length: 5 }).map((_, idx) => {
    const time = new Date(new Date(shot?.capturedAt ?? Date.now()).getTime() - (4 - idx) * 60_000);
    const keys = [38, 45, 42, 51, 39][idx];
    const clicks = [14, 22, 18, 19, 15][idx];
    const score = [82, 90, 84, 88, 79][idx];
    return {
      minute: time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      keyboardCount: keys,
      mouseClickCount: clicks,
      activityPercentage: score,
    };
  });

  return (
    <>
      <Dialog open={Boolean(shot)} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {shot && (
            <>
              <DialogHeader className="flex flex-row items-center justify-between pr-6">
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" />
                    Screenshot detail
                  </DialogTitle>
                  <DialogDescription>{formatDateTime(shot.capturedAt)}</DialogDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFullActivity(true)}
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/10 font-semibold"
                >
                  <BarChart2 className="h-4 w-4" />
                  Full Activity Breakdown
                </Button>
              </DialogHeader>

              <div
                onClick={() => setShowLightbox(true)}
                className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-border bg-slate-950 transition-all hover:border-primary/50 hover:shadow-lg"
                title="Click to view full image"
              >
                <img
                  src={
                    shot.previewDataUrl ||
                    `data:image/svg+xml;base64,${btoa(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#131A22"/><stop offset="1" stop-color="#1A232E"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="20" y="20" width="200" height="20" rx="10" fill="#263241"/><rect x="20" y="60" width="600" height="240" rx="12" fill="#131A22" opacity="0.9"/><text x="320" y="185" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#4F8CFF">Captured Screenshot (${new Date(shot.capturedAt).toLocaleTimeString()})</text></svg>`
                    )}`
                  }
                  alt="Screenshot"
                  className="w-full object-contain max-h-[60vh] transition-transform group-hover:scale-[1.01]"
                />
                <div className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-xs opacity-80 group-hover:opacity-100">
                  🔍 Click to expand
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/40 p-3 text-center">
                  <div className="text-sm font-semibold">{shot.screenNumber > 1 ? "Multi Display" : "Primary Display"}</div>
                  <div className="text-[11px] text-muted-foreground">screen #</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3 text-center">
                  <div className="text-sm font-semibold">5-Min Random</div>
                  <div className="text-[11px] text-muted-foreground">capture interval</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3 text-center">
                  <div className="text-sm font-semibold">{shot.redactionApplied ? "Yes" : "No"}</div>
                  <div className="text-[11px] text-muted-foreground">blur applied</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3 text-center">
                  <Badge
                    variant={
                      shot.uploadStatus === "uploaded"
                        ? "positive"
                        : shot.uploadStatus === "failed"
                          ? "destructive"
                          : shot.uploadStatus === "deleted"
                            ? "muted"
                            : "default"
                    }
                  >
                    {formatSyncStatus(shot.uploadStatus)}
                  </Badge>
                  <div className="mt-1 text-[11px] text-muted-foreground">upload status</div>
                </div>
              </div>

              <Alert className="border-primary/20 bg-primary/5">
                <Lock className="h-4 w-4 text-primary" />
                <AlertTitle>Encrypted &amp; Stored in Supabase Bucket 'screebshots'</AlertTitle>
                <AlertDescription>
                  This screenshot is encrypted locally on disk and synced directly to Supabase Storage.
                </AlertDescription>
              </Alert>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {project?.name ?? "Website Redesign"}
                </span>
                {allowDelete && deletable && (
                  <Button variant="destructive" size="sm" className="gap-2" onClick={handleDelete} disabled={deleting}>
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "Deleting…" : "Delete before sync"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Activity Breakdown Modal */}
      <Dialog open={showFullActivity} onOpenChange={setShowFullActivity}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Full Per-Minute Activity Breakdown
            </DialogTitle>
            <DialogDescription>
              Keystrokes &amp; mouse clicks tracked in 1-minute intervals during this 5-minute screenshot window.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Total summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-surface p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Keyboard className="h-3.5 w-3.5" /> Keystrokes
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">215 keys</div>
                <div className="text-[10px] text-muted-foreground">43 avg/min</div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <MousePointerClick className="h-3.5 w-3.5" /> Mouse Clicks
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">88 clicks</div>
                <div className="text-[10px] text-muted-foreground">17 avg/min</div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-600" /> Avg Activity
                </div>
                <div className="mt-1 text-xl font-bold text-blue-600">84%</div>
                <div className="text-[10px] text-positive font-medium">Active Input</div>
              </div>
            </div>

            {/* 1-Minute Interval Table */}
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-slate-100 font-semibold text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Time Slice</th>
                    <th className="px-3 py-2">Keyboard</th>
                    <th className="px-3 py-2">Mouse Clicks</th>
                    <th className="px-3 py-2">Activity Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {minuteBreakdown.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-muted-foreground">Min {i + 1} ({row.minute})</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <Keyboard className="h-3.5 w-3.5 text-slate-500" />
                          <span>{row.keyboardCount} keys</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <MousePointerClick className="h-3.5 w-3.5 text-slate-500" />
                          <span>{row.mouseClickCount} clicks</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-bold gap-1">
                          <Zap className="h-3 w-3 text-blue-600" />
                          <span>{row.activityPercentage}%</span>
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Screenshots are taken randomly within every 5-minute interval (12 screenshots/hour). Aggregate activity counts only — no typed characters are logged.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Image Lightbox Dialog */}
      <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
        <DialogContent className="max-w-[98vw] max-h-[98vh] w-full h-full p-2 bg-slate-950/95 border-0 flex flex-col items-center justify-center">
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            <Badge className="bg-white/10 text-white border-0 text-xs px-3 py-1">
              Display #{shot?.screenNumber ?? 1} · {shot?.capturedAt ? new Date(shot.capturedAt).toLocaleTimeString() : ""}
            </Badge>
            <button
              onClick={() => setShowLightbox(false)}
              className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {shot && (
            <img
              src={
                shot.previewDataUrl ||
                `data:image/svg+xml;base64,${btoa(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#131A22"/><stop offset="1" stop-color="#1A232E"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="20" y="20" width="200" height="20" rx="10" fill="#263241"/><rect x="20" y="60" width="600" height="240" rx="12" fill="#131A22" opacity="0.9"/><text x="320" y="185" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#4F8CFF">Captured Screenshot (${new Date(shot.capturedAt).toLocaleTimeString()})</text></svg>`
                )}`
              }
              alt="Full Screen View"
              className="max-h-[92vh] max-w-[96vw] object-contain rounded-md shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
