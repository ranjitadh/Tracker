import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronRight,
  Download,
  FileText,
  Moon,
  PencilLine,
  Plus,
  Sparkles,
  Sun,
} from "lucide-react";
import { api } from "@/services/api/client";
import { addDays, format as formatDate, startOfWeek } from "date-fns";
import type { ActivityBlock, DaySummary, ManualTimeEntry, Project, Screenshot, WeekData } from "@/types";
import { exportCsv, formatDurationCsv, formatDuration } from "@/services/export";
import { activityColor } from "@/components/tracker/ActivityRing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScreenshotThumb } from "@/components/tracker/ScreenshotThumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { ScreenshotModal } from "@/components/tracker/ScreenshotModal";

function mondayOf(weekOffset: number): Date {
  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  return addDays(monday, weekOffset * 7);
}

export function Timesheet() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [week, setWeek] = useState<WeekData | null>(null);
  const [manual, setManual] = useState<ManualTimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);
  const [dayBlocks, setDayBlocks] = useState<ActivityBlock[]>([]);
  const [dayShots, setDayShots] = useState<Screenshot[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualTimeEntry | null>(null);
  const [previewShot, setPreviewShot] = useState<Screenshot | null>(null);

  const startDate = useMemo(() => mondayOf(weekOffset), [weekOffset]);
  const startDateStr = formatDate(startDate, "yyyy-MM-dd");

  const load = useCallback(async () => {
    const [weekData, manualEntries, projectList] = await Promise.all([
      api.getWeek(startDateStr),
      api.listManualEntries(),
      api.listProjects(),
    ]);
    setWeek(weekData);
    setManual(manualEntries);
    setProjects(projectList);
  }, [startDateStr]);

  useEffect(() => {
    load();
  }, [load]);

  const weekLabel = `${formatDate(startDate, "MMM d")} – ${formatDate(addDays(startDate, 6), "MMM d, yyyy")}`;
  const total = useMemo(
    () =>
      week?.days.reduce(
        (acc, d) => ({
          tracked: acc.tracked + d.totalSeconds - d.manualSeconds,
          manual: acc.manual + d.manualSeconds,
          idle: acc.idle + d.idleSeconds,
          shots: acc.shots + d.screenshotCount,
        }),
        { tracked: 0, manual: 0, idle: 0, shots: 0 },
      ) ?? { tracked: 0, manual: 0, idle: 0, shots: 0 },
    [week],
  );

  async function openDay(day: DaySummary) {
    setSelectedDay(day);
    const [blocks, shots] = await Promise.all([
      dayBlocksFor(day),
      api.listScreenshots({ date: day.date }),
    ]);
    setDayBlocks(blocks);
    setDayShots(shots);
  }

  async function dayBlocksFor(day: DaySummary): Promise<ActivityBlock[]> {
    const all = (await api.getDashboard()).todayBlocks;
    return all.filter((b) => b.startedAt.slice(0, 10) === day.date);
  }

  function exportWeeklyCsv() {
    if (!week) return;
    exportCsv(
      `timesheet-${startDateStr}.csv`,
      ["Date", "Tracked", "Manual", "Idle", "Activity %", "Screenshots"],
      week.days.map((d) => [
        d.date,
        formatDurationCsv(d.totalSeconds - d.manualSeconds),
        formatDurationCsv(d.manualSeconds),
        formatDurationCsv(d.idleSeconds),
        d.activityPercentage,
        d.screenshotCount,
      ]),
    );
  }

  function exportWeeklyPdf() {
    if (!week) return;
    const doc = new jsPDF();
    doc.setFillColor(11, 15, 20);
    doc.rect(0, 0, 210, 297, "F");
    doc.setTextColor(79, 140, 255);
    doc.setFontSize(18);
    doc.text("Weekly Timesheet Report", 14, 20);
    doc.setTextColor(230, 237, 245);
    doc.setFontSize(11);
    doc.text(`Week of ${weekLabel}`, 14, 30);
    doc.text(`Total tracked: ${formatDuration(total.tracked)}`, 14, 38);
    doc.text(`Manual entries: ${formatDuration(total.manual)}`, 14, 44);
    doc.text(`Idle time: ${formatDuration(total.idle)}`, 14, 50);
    doc.setFontSize(10);
    let y = 62;
    week.days.forEach((d) => {
      doc.setTextColor(138, 153, 173);
      doc.text(d.date, 14, y);
      doc.setTextColor(230, 237, 245);
      doc.text(formatDurationCsv(d.totalSeconds - d.manualSeconds), 60, y);
      doc.setTextColor(138, 153, 173);
      doc.text(`manual ${formatDurationCsv(d.manualSeconds)}`, 90, y);
      doc.text(`${d.activityPercentage}%`, 150, y);
      y += 8;
    });
    doc.save(`timesheet-${startDateStr}.pdf`);
  }

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Timesheet</h1>
          <p className="text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o - 1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            This week
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((o) => o + 1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button variant="outline" size="sm" className="gap-2" onClick={exportWeeklyCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportWeeklyPdf}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Sun className="h-5 w-5 text-primary" />
            <div>
              <div className="text-lg font-bold tabular-nums">{formatDuration(total.tracked)}</div>
              <div className="text-[11px] text-muted-foreground">tracked this week</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PencilLine className="h-5 w-5 text-warning" />
            <div>
              <div className="text-lg font-bold tabular-nums">{formatDuration(total.manual)}</div>
              <div className="text-[11px] text-muted-foreground">manual entries</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Moon className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-lg font-bold tabular-nums">{formatDuration(total.idle)}</div>
              <div className="text-[11px] text-muted-foreground">idle time</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Camera className="h-5 w-5 text-positive" />
            <div>
              <div className="text-lg font-bold tabular-nums">{total.shots}</div>
              <div className="text-[11px] text-muted-foreground">screenshots</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {(week?.days ?? []).map((day) => {
          const isToday = day.date === formatDate(new Date(), "yyyy-MM-dd");
          const tracked = day.totalSeconds - day.manualSeconds;
          const color = activityColor(day.activityPercentage);
          return (
            <button
              key={day.date}
              onClick={() => openDay(day)}
              className="group rounded-xl border border-border bg-surface p-4 text-left transition-all hover:border-border-strong hover:bg-surface-hover"
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                  {formatDate(new Date(day.date), "EEE")}
                </span>
                {isToday && <Badge variant="default">today</Badge>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{formatDate(new Date(day.date), "MMM d")}</div>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Tracked</span>
                  <span className="font-semibold tabular-nums">{formatDuration(tracked, true)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Manual</span>
                  <span className="flex items-center gap-1 font-medium tabular-nums text-warning">
                    {day.manualSeconds > 0 && <Sparkles className="h-3 w-3" />}
                    {formatDuration(day.manualSeconds, true)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Idle</span>
                  <span className="tabular-nums text-muted-foreground">{formatDuration(day.idleSeconds, true)}</span>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Activity</span>
                  <span className="font-semibold" style={{ color }}>
                    {day.activityPercentage}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-active">
                  <div className="h-full rounded-full" style={{ width: `${day.activityPercentage}%`, backgroundColor: color }} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  {day.screenshotCount}
                </span>
                <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Manual entries */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Manual entries</CardTitle>
            <CardDescription>Clearly labelled as "Manual", never blended into tracked time</CardDescription>
          </div>
          <Button size="sm" className="gap-2" onClick={() => { setEditingEntry(null); setManualOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add entry
          </Button>
        </CardHeader>
        <CardContent>
          {manual.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No manual entries yet.</p>
          ) : (
            <div className="space-y-2">
              {manual.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/5 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="warning" className="gap-1">
                      <PencilLine className="h-3 w-3" />
                      Manual
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">{projectName(m.projectId)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(new Date(m.date), "MMM d, yyyy")}
                        {m.note ? ` — ${m.note}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatDuration(m.hours * 3600 + m.minutes * 60, true)}
                    </span>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => { setEditingEntry(m); setManualOpen(true); }}
                    >
                      <PencilLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={Boolean(selectedDay)} onOpenChange={(v) => !v && setSelectedDay(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? formatDate(new Date(selectedDay.date), "EEEE, MMM d") : ""}
            </DialogTitle>
            <DialogDescription>Activity blocks, screenshots and project breakdown</DialogDescription>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Tracked", formatDuration(selectedDay.totalSeconds - selectedDay.manualSeconds, true)],
                  ["Manual", formatDuration(selectedDay.manualSeconds, true)],
                  ["Idle", formatDuration(selectedDay.idleSeconds, true)],
                  ["Activity", `${selectedDay.activityPercentage}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-background/40 p-3 text-center">
                    <div className="text-sm font-bold tabular-nums">{value}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {selectedDay.projectBreakdown.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Project breakdown
                  </div>
                  <div className="space-y-1.5">
                    {selectedDay.projectBreakdown.map((p) => (
                      <div key={p.projectId} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="flex-1">{p.projectName}</span>
                        <span className="font-medium tabular-nums">{formatDuration(p.seconds, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dayBlocks.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Activity blocks
                  </div>
                  <div className="space-y-2">
                    {dayBlocks.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2">
                        <span
                          className="w-1 self-stretch rounded-full"
                          style={{ backgroundColor: activityColor(b.activityPercentage) }}
                        />
                        <div className="flex-1">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(new Date(b.startedAt), "HH:mm")} –{" "}
                            {formatDate(new Date(b.endedAt), "HH:mm")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {b.keyboardCount} keys · {b.mouseClickCount} clicks · {b.mouseActivityScore} movement
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {b.activityPercentage}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dayShots.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Screenshots
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {dayShots.map((shot) => (
                      <ScreenshotThumb key={shot.id} shot={shot} onClick={() => setPreviewShot(shot)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entry={editingEntry}
        onSaved={() => load()}
      />
      <ScreenshotModal shot={previewShot} onClose={() => setPreviewShot(null)} onDeleted={load} />
    </div>
  );
}
