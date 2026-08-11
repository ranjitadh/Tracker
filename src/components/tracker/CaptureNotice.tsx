import { useEffect, useState } from "react";
import { Camera, Check, ShieldCheck, X, Keyboard, MousePointer, Zap } from "lucide-react";
import { useTrackerStore } from "@/stores/trackerStore";
import type { Screenshot } from "@/types";
import { Button } from "@/components/ui/button";

export function CaptureNotice({
  visible: propVisible,
  onDismiss: propOnDismiss,
  screenshot: propScreenshot,
}: {
  visible?: boolean;
  onDismiss?: () => void;
  screenshot?: Screenshot | null;
} = {}) {
  const storeVisible = useTrackerStore((s) => s.captureNoticeVisible);
  const screenshots = useTrackerStore((s) => s.recentScreenshots);
  const screenshot = propScreenshot ?? screenshots[0] ?? null;
  const visible = propVisible ?? storeVisible;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDismissed(false);
    const t = setTimeout(() => {
      if (propOnDismiss) propOnDismiss();
      else useTrackerStore.setState({ captureNoticeVisible: false });
    }, 7000);
    return () => clearTimeout(t);
  }, [visible, propOnDismiss]);

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-border bg-surface shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="flex items-center gap-2 font-medium text-xs">
          <Camera className="h-3.5 w-3.5 text-primary" />
          <span>Screenshot captured</span>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => {
            setDismissed(true);
            if (propOnDismiss) propOnDismiss();
            else useTrackerStore.setState({ captureNoticeVisible: false });
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {screenshot?.previewDataUrl && (
        <div className="p-3">
          <div className="relative overflow-hidden rounded-lg border border-border">
            <img
              src={screenshot.previewDataUrl}
              alt="Screenshot preview"
              className="aspect-video w-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-slate-950/80 px-2.5 py-1 text-[10px] text-white backdrop-blur-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Keyboard className="h-3 w-3 text-slate-300" /> 42
                <MousePointer className="h-3 w-3 text-slate-300 ml-1" /> 18
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-blue-400">
                <Zap className="h-3 w-3 text-blue-400" /> 84% Activity
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-positive" />
              Encrypted before sync
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              Visible to you first
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
