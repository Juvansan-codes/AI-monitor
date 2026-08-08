import type { ReactNode } from "react";
import { TONE_BG, type Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function StatCard({ label, value, sub, tone = "neutral", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-stone-300 bg-card px-3.5 py-3",
        className,
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BG[tone])}
        aria-hidden
      />
      <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-lg leading-tight font-bold text-stone-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{sub}</p>}
    </div>
  );
}
