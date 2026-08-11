import { useEffect, useState } from "react";
import { api } from "@/services/api/client";
import { cn } from "@/lib/utils";
import { useTrackerStore } from "@/stores/trackerStore";

export function TrackingIndicator({ className }: { className?: string }) {
  const phase = useTrackerStore((s) => s.phase);
  const session = useTrackerStore((s) => s.session);
  const [projectName, setProjectName] = useState<string>("Website Redesign");

  useEffect(() => {
    if (session?.projectId) {
      api.listProjects().then((list) => {
        const p = list.find((item) => item.id === session.projectId);
        if (p) setProjectName(p.name);
      });
    }
  }, [session?.projectId]);

  const taskOrNote = session?.note || "Active session";

  if (phase === "idle" || !session) {
    return (
      <div className={cn("flex items-center gap-3.5", className)}>
        {/* Triple Ring Concentric Circle */}
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100/80">
          <div className="absolute h-7 w-7 rounded-full bg-slate-200/70" />
          <div className="relative h-4 w-4 rounded-full bg-slate-400" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-sm font-semibold tracking-tight text-slate-800">
            Not tracking
          </span>
          <span className="text-xs font-normal text-slate-400">
            Select a project to start
          </span>
        </div>
      </div>
    );
  }

  const paused = phase === "paused";

  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      {/* Triple Ring Concentric Pulse Circle matching reference image */}
      <div
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full transition-all shrink-0",
          paused ? "bg-amber-100/70" : "bg-emerald-100/70",
        )}
      >
        <div
          className={cn(
            "absolute h-8 w-8 rounded-full transition-all",
            paused ? "bg-amber-200/80" : "bg-emerald-200/80 animate-pulse",
          )}
        />
        <div
          className={cn(
            "relative h-4.5 w-4.5 rounded-full transition-all shadow-xs",
            paused ? "bg-amber-500" : "bg-emerald-600",
          )}
        />
      </div>

      <div className="flex flex-col text-left">
        <span className="text-sm font-semibold tracking-tight text-slate-900 leading-tight">
          {paused ? "Tracking paused" : "Tracking in progress"}
        </span>
        <span className="text-xs font-normal text-slate-500 leading-normal">
          {projectName} · {taskOrNote}
        </span>
      </div>
    </div>
  );
}
