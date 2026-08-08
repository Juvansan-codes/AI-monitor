import { TONE_BG, type Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AIMode } from "@/lib/services";
import { Badge } from "@/components/ui/badge";

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        TONE_BG[tone],
        className,
      )}
      aria-hidden
    />
  );
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const ring: Record<Tone, string> = {
    ok: "border-emerald-700/30 bg-emerald-50 text-emerald-800",
    warn: "border-amber-700/30 bg-amber-50 text-amber-800",
    crit: "border-red-700/30 bg-red-50 text-red-800",
    info: "border-sky-800/30 bg-sky-50 text-sky-900",
    neutral: "border-stone-400/40 bg-stone-100 text-stone-700",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-sm px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase",
        ring[tone],
        className,
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </Badge>
  );
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-sm border-amber-700/40 bg-amber-100/70 px-1.5 py-0 font-mono text-[9px] font-bold tracking-widest text-amber-900",
        className,
      )}
    >
      ◆ DEMO DATA
    </Badge>
  );
}

export function SimulatedTag({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 rounded-sm border-amber-700/40 bg-amber-100/70 px-1.5 py-0 font-mono text-[9px] font-bold tracking-widest text-amber-900",
        className,
      )}
    >
      ⚠ SIMULATED
    </Badge>
  );
}

export function AIModeBadge({ mode, className }: { mode: AIMode; className?: string }) {
  if (mode === "production") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 rounded-sm border-emerald-700/30 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] tracking-widest text-emerald-800",
          className,
        )}
      >
        <span className="inline-block size-1.5 rounded-full bg-emerald-600" />
        AI: PRODUCTION
      </Badge>
    );
  }
  if (mode === "demo") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 rounded-sm border-amber-700/40 bg-amber-50 px-2 py-0.5 font-mono text-[10px] tracking-widest text-amber-900",
          className,
        )}
      >
        <span className="inline-block size-1.5 rounded-full bg-amber-500" />
        AI: DEMO SIMULATION
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-sm border-stone-400/50 bg-stone-100 px-2 py-0.5 font-mono text-[10px] tracking-widest text-stone-600",
        className,
      )}
    >
      <span className="inline-block size-1.5 rounded-full bg-stone-400" />
      AI: NOT CONNECTED
    </Badge>
  );
}
