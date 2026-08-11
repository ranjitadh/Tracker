import { Camera, CheckCircle2, Clock, Loader2, XCircle, Keyboard, MousePointer, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Screenshot, UploadStatus } from "@/types";

function statusMeta(status: UploadStatus): { label: string; variant: "positive" | "warning" | "destructive" | "muted" | "default" } {
  switch (status) {
    case "uploaded":
      return { label: "Synced", variant: "positive" };
    case "pending":
      return { label: "Pending", variant: "warning" };
    case "encrypted":
      return { label: "Encrypted", variant: "default" };
    case "failed":
      return { label: "Failed", variant: "destructive" };
    case "deleted":
      return { label: "Deleted", variant: "muted" };
  }
}

export function ScreenshotThumb({
  shot,
  onClick,
  selected,
  onToggleSelect,
}: {
  shot: Screenshot;
  onClick?: () => void;
  selected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
}) {
  const meta = statusMeta(shot.uploadStatus);
  return (
    <div
      onClick={onClick}
      className={`group relative block w-full cursor-pointer overflow-hidden rounded-lg border bg-surface text-left transition-all ${
        selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-border-strong"
      }`}
    >
      {onToggleSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e);
          }}
          className={`absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border text-xs shadow-md transition-transform active:scale-95 ${
            selected
              ? "border-primary bg-primary text-primary-foreground font-bold"
              : "border-white/60 bg-black/50 text-white/70 hover:bg-black/80 hover:text-white"
          }`}
          title={selected ? "Deselect" : "Select"}
        >
          {selected ? "✓" : ""}
        </button>
      )}
      <div className="relative aspect-video w-full overflow-hidden">
        <img
          src={shot.previewDataUrl ?? ""}
          alt={`Screenshot ${new Date(shot.capturedAt).toLocaleTimeString()}`}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {shot.redactionApplied && (
            <Badge variant="muted" className="bg-black/60 text-[10px]">
              Blurred
            </Badge>
          )}
          {shot.screenNumber > 1 && (
            <Badge variant="muted" className="bg-black/60 text-[10px]">
              {shot.screenNumber} monitors
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-2.5 py-2 border-t border-border/60">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
            <Clock className="h-3 w-3" />
            {new Date(shot.capturedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          <Badge variant={meta.variant} className="text-[10px]">
            {shot.uploadStatus === "pending" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : shot.uploadStatus === "uploaded" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : shot.uploadStatus === "failed" ? (
              <XCircle className="h-3 w-3" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
            {meta.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-medium">
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5 border border-slate-200">
            <Keyboard className="h-3 w-3 text-slate-500" />
            <span>42/m</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1 py-0.5 border border-slate-200">
            <MousePointer className="h-3 w-3 text-slate-500" />
            <span>18/m</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 px-1 py-0.5 border border-blue-200 font-bold ml-auto">
            <Zap className="h-3 w-3 text-blue-600" />
            <span>84%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
