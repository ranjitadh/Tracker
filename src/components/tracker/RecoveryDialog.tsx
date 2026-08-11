import { AlertTriangle, Play, Trash2 } from "lucide-react";
import type { TrackingSession } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatTime } from "@/services/format";

// ─────────────────────────────────────────────────────────────
// Shown on launch when a running session was interrupted by an
// unexpected app close. The user explicitly decides to continue or
// discard. We never silently resume.
// ─────────────────────────────────────────────────────────────

export function RecoveryDialog({
  session,
  onContinue,
  onDiscard,
}: {
  session: TrackingSession | null;
  onContinue: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  return (
    <AlertDialog open={Boolean(session)} onOpenChange={() => undefined}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Unfinished session found
          </AlertDialogTitle>
          <AlertDialogDescription>
            The app closed while a tracking session was still running
            {session ? (
              <>
                {" "}
                from <span className="font-semibold text-foreground">{formatTime(session.startedAt)}</span>
              </>
            ) : null}
            . What would you like to do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onDiscard()} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Discard
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onContinue()} className="gap-2">
            <Play className="h-4 w-4" />
            Continue tracking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
