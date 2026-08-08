import { Check, TriangleAlert } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { ALERT_TYPE_LABELS, SEVERITY_META, type Tone } from "@/lib/constants";
import { fmtTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AlertFeedProps {
  alerts: Doc<"alerts">[];
  onResolve?: (alert: Doc<"alerts">) => void;
  showResolve?: boolean;
  compact?: boolean;
  emptyText?: string;
}

export function AlertFeed({
  alerts,
  onResolve,
  showResolve = false,
  compact = false,
  emptyText = "No alerts recorded for this job.",
}: AlertFeedProps) {
  if (alerts.length === 0) {
    return (
      <p className="px-3 py-6 text-center font-mono text-xs text-stone-500">{emptyText}</p>
    );
  }

  const bar: Record<string, string> = {
    LOW: "bg-stone-400",
    MEDIUM: "bg-amber-500",
    HIGH: "bg-red-600",
    CRITICAL: "bg-red-700",
  };

  return (
    <ul className="divide-y divide-stone-200/70 font-mono">
      {alerts.map((a) => {
        const meta = SEVERITY_META[a.severity];
        return (
          <li
            key={a._id}
            className={cn(
              "relative flex gap-3 px-3 py-2.5",
              a.resolved && "opacity-50",
            )}
          >
            <span className={cn("absolute inset-y-0 left-0 w-[3px]", bar[a.severity])} aria-hidden />
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border",
                a.resolved
                  ? "border-stone-300 bg-stone-100 text-stone-400"
                  : "border-red-700/40 bg-red-50 text-red-700",
              )}
            >
              <TriangleAlert className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-px text-[9px] font-bold tracking-widest",
                    meta.tone === "crit" && "bg-red-50 text-red-700 ring-1 ring-red-700/30",
                    meta.tone === "warn" && "bg-amber-50 text-amber-800 ring-1 ring-amber-700/30",
                    meta.tone === "neutral" && "bg-stone-100 text-stone-600 ring-1 ring-stone-400/40",
                  )}
                >
                  {a.type === "LOW_CONFIDENCE" ? "LOW CONFIDENCE" : ALERT_TYPE_LABELS[a.type]}
                </span>
                <span className="text-[10px] text-stone-500">{meta.label}</span>
                {a.sopStep !== undefined && (
                  <span className="text-[10px] text-stone-500">step {a.sopStep}</span>
                )}
                {!compact && <span className="ml-auto text-[10px] text-stone-400" title={fmtTime(a.timestamp)}>{timeAgo(a.timestamp)}</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-stone-700">{a.message}</p>
              {(a.expected || a.detected) && !compact && (
                <p className="mt-0.5 text-[10px] text-stone-500">
                  expected: <span className="text-stone-700">{a.expected ?? "—"}</span>
                  {" · "}detected: <span className="text-red-700">{a.detected ?? "—"}</span>
                </p>
              )}
              {showResolve && !a.resolved && onResolve && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-6 gap-1 rounded-sm font-mono text-[10px]"
                  onClick={() => onResolve(a)}
                >
                  <Check className="size-3" /> Acknowledge
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function toneOfSeverity(severity: string): Tone {
  if (severity === "CRITICAL" || severity === "HIGH") return "crit";
  if (severity === "MEDIUM") return "warn";
  return "neutral";
}
