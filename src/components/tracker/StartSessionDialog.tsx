import { useEffect, useState } from "react";
import { Play, Sparkles } from "lucide-react";
import { api } from "@/services/api/client";
import { useAuthStore } from "@/stores/authStore";
import type { Project, Task } from "@/types";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, ShieldOff } from "lucide-react";

export function StartSessionDialog({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (projectId: string, taskId: string | null, note: string | null) => Promise<void>;
}) {
  const settings = useAuthStore((s) => s.settings);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) {
        setProjectId((current) => current || list[0].id);
      }
    });
  }, [open]);

  useEffect(() => {
    if (!projectId) return;
    api.listTasks(projectId).then((list) => {
      setTasks(list);
      setTaskId((current) => (list.some((t) => t.id === current) ? current : ""));
    });
  }, [projectId]);

  async function handleStart() {
    if (!projectId) return;
    setStarting(true);
    try {
      await onStart(projectId, taskId || null, note.trim() || null);
      onOpenChange(false);
      setNote("");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What are you working on?</DialogTitle>
          <DialogDescription>
            Pick a project and task before you start. You can always pause or stop.
          </DialogDescription>
        </DialogHeader>

        {!settings?.screenCaptureEnabled && (
          <Alert className="border-warning/30 bg-warning/5">
            <Camera className="h-4 w-4 text-warning" />
            <AlertTitle>Screenshots are off</AlertTitle>
            <AlertDescription>
              Screen capture is disabled in settings. Time and activity will still be tracked.
            </AlertDescription>
          </Alert>
        )}

        {settings?.privateMode && (
          <Alert className="border-warning/30 bg-warning/5">
            <ShieldOff className="h-4 w-4 text-warning" />
            <AlertTitle>Private mode is on</AlertTitle>
            <AlertDescription>No screenshots or app usage will be captured.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
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
                <SelectValue placeholder="Select a task" />
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

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional: what are you working on?"
              className="min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={!projectId || starting} className="gap-2">
            <Play className="h-4 w-4" />
            {starting ? "Starting…" : "Start tracking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
