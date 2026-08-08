import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Terminal-style panel: title bar + bordered body. */
export function Panel({ title, right, children, className, bodyClassName }: PanelProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-stone-300 bg-card shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-100/80 px-3 py-1.5">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600">
            {title && <span className="text-emerald-700">▌</span>} {title}
          </h2>
          {right}
        </header>
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}
