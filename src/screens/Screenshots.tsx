import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Filter, ShieldCheck, UploadCloud } from "lucide-react";
import { api } from "@/services/api/client";
import type { Project, Screenshot } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScreenshotThumb } from "@/components/tracker/ScreenshotThumb";
import { ScreenshotModal } from "@/components/tracker/ScreenshotModal";

export function Screenshots() {
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [date, setDate] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState("all");
  const [previewShot, setPreviewShot] = useState<Screenshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const filter: { date?: string; projectId?: string; uploadStatus?: string } = {};
    if (date) filter.date = date;
    if (projectId !== "all") filter.projectId = projectId;
    if (status !== "all") filter.uploadStatus = status;
    const [list, proj] = await Promise.all([api.listScreenshots(filter), api.listProjects()]);
    setShots(list);
    setProjects(proj);
    setSelectedIds(new Set());
  }, [date, projectId, status]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === shots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shots.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.allSettled(ids.map((id) => api.deleteScreenshot(id)));
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      console.warn("Failed bulk delete:", err);
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(
    () => ({
      total: shots.length,
      synced: shots.filter((s) => s.uploadStatus === "uploaded").length,
      pending: shots.filter((s) => s.uploadStatus === "pending" || s.uploadStatus === "encrypted").length,
      failed: shots.filter((s) => s.uploadStatus === "failed").length,
    }),
    [shots],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Screenshots</h1>
          <p className="text-sm text-muted-foreground">
            Every capture is previewed to you first and encrypted before upload. Select multiple items to delete in bulk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shots.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="gap-1.5 border-border"
            >
              {selectedIds.size === shots.length ? "Deselect All" : "Select All"}
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
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Delete ({selectedIds.size})</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setDate(""); setProjectId("all"); setStatus("all"); }}>
            <Filter className="h-4 w-4" />
            Clear filters
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-lg font-bold tabular-nums">{stats.total}</div>
            <div className="text-[11px] text-muted-foreground">total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-lg font-bold tabular-nums text-positive">
              <UploadCloud className="h-4 w-4" />
              {stats.synced}
            </div>
            <div className="text-[11px] text-muted-foreground">synced</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-lg font-bold tabular-nums text-warning">{stats.pending}</div>
            <div className="text-[11px] text-muted-foreground">pending / encrypted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-lg font-bold tabular-nums text-danger">{stats.failed}</div>
            <div className="text-[11px] text-muted-foreground">failed sync</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Filter by date, project, and sync state</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Project</span>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Sync state</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="uploaded">Synced</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="encrypted">Encrypted</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {shots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Camera className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No screenshots</p>
            <p className="text-xs text-muted-foreground">Adjust filters or start a tracking session.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shots.map((shot) => (
            <ScreenshotThumb
              key={shot.id}
              shot={shot}
              onClick={() => setPreviewShot(shot)}
              selected={selectedIds.has(shot.id)}
              onToggleSelect={() => toggleSelect(shot.id)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-positive" />
        Screenshots are encrypted locally and never transmitted without your knowledge.
      </div>

      <ScreenshotModal shot={previewShot} onClose={() => setPreviewShot(null)} onDeleted={load} />
    </div>
  );
}
