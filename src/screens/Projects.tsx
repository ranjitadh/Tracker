import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { api } from "@/services/api/client";
import type { Project, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PALETTE = ["#4F8CFF", "#22C55E", "#F59E0B", "#EF4444", "#A78BFA", "#EC4899", "#14B8A6", "#F97316"];

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    const map: Record<string, Task[]> = {};
    await Promise.all(
      list.map(async (p) => {
        map[p.id] = await api.listTasks(p.id);
      }),
    );
    setTasksByProject(map);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject() {
    if (!name.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      await api.createProject(name.trim(), client.trim() || undefined, color);
      setName("");
      setClient("");
      setCreateOpen(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  async function createTask(projectId: string) {
    if (!taskName.trim()) return;
    await api.createTask(projectId, taskName.trim());
    setTaskName("");
    setTaskFor(null);
    load();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Projects and tasks you can track time against.</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                <CardTitle className="text-base">{project.name}</CardTitle>
              </div>
              <Badge variant="outline">{project.client ?? "No client"}</Badge>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <Separator />
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Tasks
                </div>
                <div className="space-y-1.5">
                  {(tasksByProject[project.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tasks yet.</p>
                  ) : (
                    tasksByProject[project.id]?.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                        {task.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Input
                  placeholder="Add task…"
                  value={taskFor === project.id ? taskName : ""}
                  onChange={(e) => setTaskName(e.target.value)}
                  onFocus={() => setTaskFor(project.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && taskFor === project.id) createTask(project.id);
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={() => createTask(project.id)}
                  disabled={taskFor !== project.id || !taskName.trim()}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <FolderKanban className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">Create a project to start tracking time.</p>
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Projects group your tracked time and tasks.</DialogDescription>
          </DialogHeader>
          {createError && (
            <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">
              {createError}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Website redesign" />
            </div>
            <div className="space-y-1.5">
              <Label>Client (optional)</Label>
              <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform ${color === c ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface scale-110" : "hover:scale-110"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={createProject} disabled={!name.trim() || submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
