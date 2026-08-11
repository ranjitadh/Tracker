import { useEffect, useState } from "react";
import { formatClock } from "@/services/format";
import { useTrackerStore } from "@/stores/trackerStore";
import { cn } from "@/lib/utils";
import { Keyboard, MousePointer } from "lucide-react";

export function TimerDisplay({ className }: { className?: string }) {
  const phase = useTrackerStore((s) => s.phase);
  const session = useTrackerStore((s) => s.session);
  const [displaySeconds, setDisplaySeconds] = useState(session?.totalActiveSeconds ?? 0);

  useEffect(() => {
    if (phase !== "running" || !session) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const started = new Date(session.startedAt).getTime();
      const active = Math.max(0, Math.floor((now - started) / 1000) - session.totalPausedSeconds);
      setDisplaySeconds(active);
    }, 500);
    return () => clearInterval(interval);
  }, [phase, session]);

  useEffect(() => {
    if (phase === "paused" && session) setDisplaySeconds(session.totalActiveSeconds);
  }, [phase, session]);

  if (!session) {
    return (
      <div className={cn("font-mono text-6xl font-bold tracking-tight text-muted-foreground/40", className)}>
        00:00:00
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "font-mono text-6xl font-bold tracking-tight tabular-nums",
          phase === "running" ? "text-foreground" : "text-amber-500",
        )}
      >
        {formatClock(displaySeconds)}
      </div>
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {phase === "running" ? "tracking" : "paused"}
      </span>
      {phase === "running" && (
        <div className="mt-3 flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <Keyboard className="h-3.5 w-3.5 text-slate-500" />
            <span>Keyboard: 42/min</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <MousePointer className="h-3.5 w-3.5 text-slate-500" />
            <span>Mouse: 18/min</span>
          </div>
        </div>
      )}
    </div>
  );
}
