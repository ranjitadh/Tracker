import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Activity ring. Green → amber → red, neutral phrasing. The ring
// measures engagement in a session; it never judges the person.
// ─────────────────────────────────────────────────────────────

export function activityColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

export function activityLabel(score: number): string {
  if (score >= 70) return "Active";
  if (score >= 40) return "Light activity";
  return "Low activity";
}

export function ActivityRing({
  value,
  size = 72,
  strokeWidth = 7,
  label,
  className,
}: {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const color = activityColor(clamped);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#263241"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-sm font-bold" style={{ color }}>
            {clamped}%
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">
        {label ?? "activity"}
      </span>
    </div>
  );
}

export function ActivityBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const color = activityColor(clamped);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-hover", className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}
