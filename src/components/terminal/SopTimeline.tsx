import { ShieldAlert, Wrench } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export interface SopTimelineProps {
  steps: Doc<"sopSteps">[];
  session: {
    currentStepNumber: number;
    completedSteps: number[];
    skippedSteps: number[];
    incorrectSteps: number[];
  } | null;
}

/** ✓ completed · → current · ○ pending · ✗ incorrect. */
export function SopTimeline({ steps, session }: SopTimelineProps) {
  if (steps.length === 0) {
    return (
      <p className="px-3 py-4 font-mono text-xs text-stone-500">
        No SOP steps defined for this job.
      </p>
    );
  }
  const completed = new Set(session?.completedSteps ?? []);
  const skipped = new Set(session?.skippedSteps ?? []);
  const incorrect = new Set(session?.incorrectSteps ?? []);
  const current = session?.currentStepNumber ?? 1;
  const doneAll = (session?.completedSteps.length ?? 0) >= steps.length;

  return (
    <ol className="font-mono">
      {steps.map((step) => {
        const isCompleted = completed.has(step.stepNumber);
        const isSkipped = skipped.has(step.stepNumber);
        const isIncorrect = incorrect.has(step.stepNumber);
        const isCurrent = !isCompleted && !isSkipped && step.stepNumber === current;
        const isPending = !isCompleted && !isSkipped && !isCurrent;
        return (
          <li
            key={step.stepNumber}
            className={cn(
              "flex items-start gap-3 border-b border-stone-200/70 px-3 py-2.5 last:border-0",
              isCurrent && "bg-amber-50/70",
              isIncorrect && "bg-red-50/70",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border text-[11px] font-bold",
                isCompleted && "border-emerald-700 bg-emerald-600 text-white",
                isSkipped && "border-amber-700 bg-amber-500 text-white",
                isCurrent && "border-amber-600 bg-white text-amber-800",
                isIncorrect && "border-red-700 bg-white text-red-700",
                isPending && "border-stone-300 bg-white text-stone-400",
              )}
            >
              {isCompleted ? "✓" : isSkipped ? "✗" : isCurrent ? "→" : isIncorrect ? "✗" : "○"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-stone-400">#{step.stepNumber}</span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isCurrent && "font-bold text-amber-900",
                    isIncorrect && "text-red-800",
                  )}
                >
                  {step.action}
                </span>
                {step.safetyCritical && (
                  <span className="inline-flex items-center gap-0.5 rounded-sm bg-red-50 px-1.5 py-px font-mono text-[9px] font-bold tracking-wider text-red-700 ring-1 ring-red-700/30">
                    <ShieldAlert className="size-2.5" /> SAFETY-CRITICAL
                  </span>
                )}
              </div>
              {step.requiredTools.length > 0 && (
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-stone-500">
                  <Wrench className="size-2.5" />
                  {step.requiredTools.join(" · ")}
                </p>
              )}
            </div>
            {isSkipped && (
              <span className="font-mono text-[10px] font-bold tracking-widest text-amber-700">
                SKIPPED
              </span>
            )}
          </li>
        );
      })}
      {doneAll && (
        <li className="px-3 py-2.5 font-mono text-xs font-bold text-emerald-700">
          ✓ ALL STEPS COMPLETED
        </li>
      )}
    </ol>
  );
}
