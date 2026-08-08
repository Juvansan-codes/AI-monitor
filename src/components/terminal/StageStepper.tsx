import { cn } from "@/lib/utils";

export interface StageDef {
  key: string;
  label: string;
}

/** Vertical journey timeline: completed (green), current (amber), pending (muted). */
export function StageStepper({
  stages,
  currentKey,
  completedKeys,
}: {
  stages: StageDef[];
  currentKey: string | null;
  completedKeys?: string[];
}) {
  const done = new Set(completedKeys ?? []);
  const currentIdx = stages.findIndex((s) => s.key === currentKey);

  return (
    <ol className="font-mono">
      {stages.map((stage, i) => {
        const isDone = done.has(stage.key) || (currentIdx !== -1 && i < currentIdx);
        const isCurrent = stage.key === currentKey;
        return (
          <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < stages.length - 1 && (
              <span
                className={cn(
                  "absolute top-4 left-[7px] h-full w-px",
                  isDone ? "bg-emerald-600/60" : "bg-stone-300",
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                isDone && "border-emerald-700 bg-emerald-600 text-white",
                isCurrent && "border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/30",
                !isDone && !isCurrent && "border-stone-300 bg-white text-stone-400",
              )}
            >
              {isDone ? "✓" : isCurrent ? "→" : i + 1}
            </span>
            <div className="pt-0.5">
              <p
                className={cn(
                  "text-xs font-medium",
                  isDone && "text-emerald-800",
                  isCurrent && "font-bold text-amber-800",
                  !isDone && !isCurrent && "text-stone-400",
                )}
              >
                {stage.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
