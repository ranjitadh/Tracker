import { useEffect, useState } from "react";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { api } from "@/services/api/client";
import type { ManualTimeEntry, Project, Task } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";

export function ManualEntryDialog({
  open,
  onOpenChange,
  entry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ManualTimeEntry | null;
  onSaved: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setProjectId((cur) => cur || list[0].id);
    });
    if (entry) {
      setProjectId(entry.projectId);
      setTaskId(entry.taskId ?? "");
      setDate(entry.date);
      setHours(String(entry.hours));
      setMinutes(String(entry.minutes));
      setNote(entry.note ?? "");
      setIsBillable(entry.isBillable);
    } else {
      setTaskId("");
      setHours("0");
      setMinutes("30");
      setNote("");
    }
  }, [open, entry]);

  useEffect(() => {
    if (!projectId) return;
    api.listTasks(projectId).then((list) => {
      setTasks(list);
      setTaskId((cur) => (list.some((t) => t.id === cur) ? cur : ""));
    });
  }, [projectId]);

  async function handleSave() {
    setSaving(true);
    const req = {
      projectId,
      taskId: taskId || null,
      date,
      hours: Math.max(0, parseInt(hours || "0", 10)),
      minutes: Math.max(0, parseInt(minutes || "0", 10)),
      note: note.trim() || null,
      isBillable,
    };
    try {
      if (entry) await api.updateManualEntry(entry.id, req);
      else await api.addManualEntry(req);
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    await api.deleteManualEntry(entry.id);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="h-4 w-4 text-warning" />
            {entry ? "Edit manual entry" : "Add manual entry"}
          </DialogTitle>
          <DialogDescription>
            Manual time is labelled separately from tracked time and never blended in.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-warning/30 bg-warning/5">
          <Sparkles className="h-4 w-4 text-warning" />
          <AlertTitle>Manual entry</AlertTitle>
          <AlertDescription>
            This will show as "Manual" in timesheets, screenshots are not required.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Task (optional)</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger>
                <SelectValue placeholder="Select task" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hours</Label>
              <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Minutes</Label>
              <Input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
            <span className="text-sm">Billable</span>
            <Switch checked={isBillable} onCheckedChange={setIsBillable} />
          </div>
        </div>

        <DialogFooter>
          {entry && (
            <Button variant="ghost" onClick={handleDelete} className="mr-auto gap-2 text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !projectId} className="gap-2">
            <Plus className="h-4 w-4" />
            {entry ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
