import { Button } from "@/components/ui/button";
import { AlertFeed } from "@/components/terminal/AlertFeed";
import { DemoTag, StatusBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { RoutePlotter } from "@/components/terminal/RoutePlotter";
import { Shell } from "@/components/terminal/Shell";
import { StatCard } from "@/components/terminal/StatCard";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useEnsureDemoData } from "@/hooks/use-demo-seed";
import { useSupervisorContext } from "@/hooks/use-supervisor-context";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { STAGE_META, type Tone } from "@/lib/constants";
import { fmtPct, timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

const stageTone = (status: string): Tone =>
  STAGE_META[status as keyof typeof STAGE_META]?.tone ?? "neutral";

export default function SupervisorDashboard() {
  useEnsureDemoData();
  const data = useSupervisorContext();
  const { mode } = useAIMode();
  const navigate = useNavigate();
  const resolveAlert = useMutation(api.alerts.resolve);

  const nav = [
    { to: "/supervisor", label: "Command", end: true },
    { to: "/supervisor/sops", label: "SOPs" },
    { to: "/supervisor/reports", label: "Reports" },
  ];

  if (!data) {
    return (
      <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </Shell>
    );
  }

  const { counts, workers, recentAlerts } = data;
  const markers = workers
    .filter((w) => w.job)
    .map((w) => {
      const job = w.job!;
      const lat = w.latestLocation?.lat ?? job.currentLat ?? job.destinationLat;
      const lng = w.latestLocation?.lng ?? job.currentLng ?? job.destinationLng;
      const isDone = job.status === "COMPLETED";
      return {
        id: w.worker.workerId,
        lat,
        lng,
        label: w.worker.workerId,
        tone: isDone ? ("neutral" as Tone) : stageTone(job.status),
        onClick: () => navigate(`/supervisor/workers/${w.worker.workerId}`),
      };
    });

  const activeJobForMap = workers.find(
    (w) =>
      w.job &&
      (w.job.status === "TRAVELING" ||
        w.job.status === "DEVIATED" ||
        w.job.status === "ARRIVED"),
  )?.job;

  return (
    <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> COMMAND CENTER
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            live maintenance operations · {workers.length} workers
          </p>
        </div>
        <DemoTag />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active workers" value={counts.totalWorkers} tone="info" />
        <StatCard label="Active jobs" value={counts.activeJobs} sub={`${counts.working} working`} tone="ok" />
        <StatCard label="Workers en route" value={counts.enRoute} tone="info" />
        <StatCard label="Workers working" value={counts.working} tone="ok" />
        <StatCard label="Active alerts" value={counts.activeAlerts} tone={counts.activeAlerts > 0 ? "crit" : "ok"} />
        <StatCard label="Avg SOP compliance" value={fmtPct(counts.avgSopCompliance)} tone="warn" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Live worker map"
          right={
            <span className="font-mono text-[10px] text-stone-400">
              click a marker for worker detail
            </span>
          }
        >
          <div className="p-3">
            <div className="aspect-[480/340] w-full overflow-hidden rounded-md border border-stone-300">
              <RoutePlotter
                route={
                  activeJobForMap
                    ? activeJobForMap.plannedRoute.map(([lat, lng]) => ({ lat, lng }))
                    : []
                }
                company={{ lat: 37.7694, lng: -122.4862 }}
                destination={
                  activeJobForMap
                    ? {
                        lat: activeJobForMap.destinationLat,
                        lng: activeJobForMap.destinationLng,
                      }
                    : undefined
                }
                markers={markers}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-stone-500">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-600" /> working</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky-600" /> en route / on site</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amber-500" /> deviation</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-red-600" /> warning</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-stone-400" /> completed</span>
            </div>
          </div>
        </Panel>

        <Panel
          title="Alert stream"
          right={
            <span className="font-mono text-[10px] text-stone-400">
              {counts.activeAlerts} active
            </span>
          }
        >
          <div className="max-h-[420px] overflow-y-auto">
            <AlertFeed
              alerts={recentAlerts.map((r) => r.alert)}
              showResolve
              onResolve={(alert) =>
                void resolveAlert({ alertId: alert._id, acknowledged: true }).catch(
                  () => {},
                )
              }
            />
          </div>
        </Panel>
      </div>

      <Panel title="Workers" className="mt-4" right={<DemoTag />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] font-mono text-xs">
            <thead>
              <tr className="border-b border-stone-300 text-left text-[10px] tracking-widest text-stone-500 uppercase">
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Badge</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">PPE</th>
                <th className="px-3 py-2">SOP step</th>
                <th className="px-3 py-2">Compliance</th>
                <th className="px-3 py-2">Latest alert</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/70">
              {workers.map((w) => {
                const job = w.job;
                const step = w.session
                  ? `#${w.session.currentStepNumber}${
                      w.session.completedSteps.length
                        ? ` (${w.session.completedSteps.length} done)`
                        : ""
                    }`
                  : "—";
                return (
                  <tr
                    key={w.worker._id}
                    className="cursor-pointer transition-colors hover:bg-emerald-700/5"
                    onClick={() => navigate(`/supervisor/workers/${w.worker.workerId}`)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-stone-900">{w.worker.workerId}</span>
                      <span className="block text-[10px] text-stone-500">{w.worker.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-sm border border-emerald-700/40 bg-emerald-700/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                        {w.worker.badgeNumber ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-stone-800">{job?.jobNumber ?? "—"}</span>
                      <span className="block text-[10px] text-stone-500">
                        {job?.title ?? "no job"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={job ? stageTone(job.status) : "neutral"}>
                        {job?.status ?? "—"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "font-semibold",
                          !w.latestPpe && "text-stone-400",
                          w.latestPpe?.overallStatus === "PASSED" && "text-emerald-700",
                          w.latestPpe?.overallStatus === "FAILED" && "text-red-700",
                        )}
                      >
                        {w.latestPpe?.overallStatus ?? "not checked"}
                      </span>
                      <span className="block text-[10px] text-stone-500">
                        {w.latestPpe ? timeAgo(w.latestPpe.timestamp) : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-stone-700">{step}</td>
                    <td className="px-3 py-2.5">
                      {w.score ? (
                        <span
                          className={cn(
                            "font-bold",
                            w.score.overallScore >= 80
                              ? "text-emerald-700"
                              : w.score.overallScore >= 60
                                ? "text-amber-700"
                                : "text-red-700",
                          )}
                        >
                          {fmtPct(w.score.overallScore)}
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      {w.latestAlert ? (
                        <span
                          className="block truncate text-[11px] text-stone-600"
                          title={w.latestAlert.message}
                        >
                          {w.latestAlert.type} · {timeAgo(w.latestAlert.timestamp)}
                        </span>
                      ) : (
                        <span className="text-stone-400">none</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="ghost" size="icon-sm" className="rounded-sm">
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Shell>
  );
}
