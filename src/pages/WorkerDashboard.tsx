import { Button } from "@/components/ui/button";
import { AlertFeed } from "@/components/terminal/AlertFeed";
import { DemoTag, StatusBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { ScoreRing } from "@/components/terminal/ScoreRing";
import { Shell } from "@/components/terminal/Shell";
import { StageStepper } from "@/components/terminal/StageStepper";
import { StatCard } from "@/components/terminal/StatCard";
import { useEnsureDemoData } from "@/hooks/use-demo-seed";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useWorkerContext } from "@/hooks/use-worker-context";
import { api } from "@/convex/_generated/api";
import { JOURNEY_TIMELINE, STAGE_META } from "@/lib/constants";
import { fmtPct, timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Briefcase, MapPin, Radar } from "lucide-react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import type { JobStage } from "@/convex/schema";

export default function WorkerDashboard() {
  useEnsureDemoData();
  const ctx = useWorkerContext();
  const { mode } = useAIMode();
  const navigate = useNavigate();
  const setStage = useMutation(api.jobs.setStage);

  if (!ctx) {
    return (
      <Shell roleLabel="worker" nav={[]} aiMode={mode}>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </Shell>
    );
  }

  const { worker, job, sop, steps, session, ppeChecks, alerts, score, report } = ctx;

  if (!worker) {
    return (
      <Shell roleLabel="worker" nav={[]} aiMode={mode}>
        <Panel title="No worker profile">
          <p className="px-4 py-8 font-mono text-xs text-stone-600">
            No worker profile is linked to this account yet.
          </p>
        </Panel>
      </Shell>
    );
  }

  const nav = [
    { to: "/worker", label: "Dashboard", end: true },
    { to: "/worker/ppe", label: "PPE" },
    { to: "/worker/journey", label: "Journey" },
    { to: "/worker/worksite", label: "Worksite" },
    { to: "/worker/monitor", label: "Monitor" },
  ];

  if (!job) {
    return (
      <Shell roleLabel="worker" workerTag={worker.workerId} nav={nav} aiMode={mode}>
        <Panel title="No assigned job">
          <div className="px-4 py-10 text-center font-mono text-xs text-stone-600">
            You have no assigned job right now.
            <br />
            <span className="text-stone-400">supervisor@company.com will assign one.</span>
          </div>
        </Panel>
      </Shell>
    );
  }

  const stageMeta = STAGE_META[job.status];
  const latestPpe = ppeChecks[0];
  const sopDone = session?.completedSteps.length ?? 0;
  const sopTotal = steps.length;
  const gpsFresh =
    job.lastGpsAt && Date.now() - job.lastGpsAt < 10 * 60 * 1000;
  const activeAlerts = alerts.filter((a) => !a.resolved);

  const stageIndex = JOURNEY_TIMELINE.findIndex((s) => s.key === job.status);
  const doneKeys = JOURNEY_TIMELINE.slice(0, stageIndex).map((s) => s.key);

  const nextAction: { label: string; to: string; icon: typeof Radar } | null =
    job.status === "ASSIGNED" || job.status === "PPE_CHECK"
      ? { label: "RUN PRE-DEPARTURE PPE CHECK", to: "/worker/ppe", icon: Radar }
      : job.status === "TRAVELING" || job.status === "DEVIATED"
        ? { label: "OPEN JOURNEY TRACKING", to: "/worker/journey", icon: MapPin }
        : job.status === "ARRIVED" || job.status === "WORKSITE_CHECK"
          ? { label: "WORKSITE SAFETY CHECK", to: "/worker/worksite", icon: Radar }
          : job.status === "WORKING" || job.status === "WARNING"
            ? { label: "OPEN MAINTENANCE MONITOR", to: "/worker/monitor", icon: Radar }
            : null;

  return (
    <Shell roleLabel="worker" workerTag={worker.workerId} nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
              {worker.name}
            </h1>
            <span className="rounded-sm bg-stone-800 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-stone-100">
              {worker.workerId}
            </span>
            {worker.isDemo && <DemoTag />}
          </div>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {job.jobNumber} · {job.title} · {job.customer}
          </p>
        </div>
        <StatusBadge tone={stageMeta.tone}>{job.status}</StatusBadge>
      </div>

      {activeAlerts.length > 0 && (
        <div className="mt-4 rounded-md border border-red-700/40 bg-red-50 px-3 py-2 font-mono text-xs text-red-900">
          ⚠ {activeAlerts.length} unresolved alert{activeAlerts.length > 1 ? "s" : ""} —
          review in the alert panel below or in the monitor.
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Job status" value={job.status} sub={job.stage} tone={stageMeta.tone} />
        <StatCard
          label="PPE status"
          value={latestPpe?.overallStatus ?? "NOT CHECKED"}
          sub={latestPpe ? `${latestPpe.stage.replace("_", " ")} · ${timeAgo(latestPpe.timestamp)}` : "run pre-departure check"}
          tone={latestPpe?.overallStatus === "PASSED" ? "ok" : latestPpe?.overallStatus === "FAILED" ? "crit" : "warn"}
        />
        <StatCard
          label="GPS status"
          value={gpsFresh ? "LIVE" : job.lastGpsAt ? "STALE" : "NO FIX"}
          sub={job.lastGpsAt ? `last fix ${timeAgo(job.lastGpsAt)}` : "tracking not started"}
          tone={gpsFresh ? "ok" : "warn"}
        />
        <StatCard
          label="SOP progress"
          value={`${sopDone} / ${sopTotal}`}
          sub={session?.status ?? "not started"}
          tone={sopTotal > 0 && sopDone === sopTotal ? "ok" : "info"}
        />
        <StatCard
          label="Safety score"
          value={score ? fmtPct(score.safetyCompliance) : "—"}
          sub={score ? `overall ${fmtPct(score.overallScore)}` : "computed at completion"}
          tone={score ? (score.overallScore >= 80 ? "ok" : "warn") : "neutral"}
        />
        <StatCard
          label="Compliance score"
          value={score ? fmtPct(score.overallScore) : "—"}
          sub="0–100 quality score"
          tone={score ? (score.overallScore >= 80 ? "ok" : score.overallScore >= 60 ? "warn" : "crit") : "neutral"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Panel title="Assigned job" right={worker.isDemo ? <DemoTag /> : undefined}>
            <dl className="divide-y divide-stone-200/70 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">Job</dt>
                <dd className="text-right font-semibold text-stone-900">{job.jobNumber}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">Work order</dt>
                <dd className="text-right font-semibold text-stone-900">{job.title}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">Customer</dt>
                <dd className="text-right font-semibold text-stone-900">{job.customer}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">Worksite</dt>
                <dd className="text-right font-semibold text-stone-900">{job.destinationAddress}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">SOP</dt>
                <dd className="text-right font-semibold text-stone-900">{sop?.name ?? "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
                <dt className="text-stone-500">Required PPE</dt>
                <dd className="text-right font-semibold text-stone-900">
                  {sop?.requiredPpe.join(", ") || "—"}
                </dd>
              </div>
            </dl>
            {nextAction && (
              <div className="border-t border-stone-200 p-3">
                <Button
                  className="w-full gap-2 rounded-sm font-mono text-xs"
                  onClick={() => navigate(nextAction.to)}
                >
                  <nextAction.icon className="size-4" />
                  {nextAction.label} <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="Recent alerts" right={
            <span className="font-mono text-[10px] text-stone-400">{alerts.length} total</span>
          }>
            <AlertFeed alerts={alerts.slice(0, 6)} compact emptyText="No alerts yet." />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Journey timeline">
            <div className="p-4">
              <StageStepper
                stages={JOURNEY_TIMELINE}
                currentKey={job.status === "COMPLETED" ? "COMPLETED" : job.status}
                completedKeys={doneKeys}
              />
            </div>
          </Panel>
          {job.status === "COMPLETED" && score ? (
            <Panel title="Job score">
              <div className="flex flex-col items-center gap-3 p-4">
                <ScoreRing value={score.overallScore} size={110} label="overall" />
                <div className="w-full space-y-1.5 font-mono text-[11px]">
                  {[
                    ["PPE", score.ppeCompliance],
                    ["SOP", score.sopCompliance],
                    ["Safety", score.safetyCompliance],
                    ["Route", score.routeCompliance],
                    ["Sequence", score.sequenceCompliance],
                    ["Tools", score.toolCompliance],
                  ].map(([label, v]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-stone-500">{label}</span>
                      <span className="font-bold text-stone-800">{fmtPct(v as number)}</span>
                    </div>
                  ))}
                </div>
                {report && (
                  <Button variant="outline" className="w-full gap-2 rounded-sm font-mono text-xs" onClick={() => navigate("/supervisor/reports")}>
                    <Briefcase className="size-4" /> VIEW REPORT
                  </Button>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title="SOP steps">
              <div className="p-4 font-mono text-xs text-stone-600">
                <p className="text-stone-500">SOP: {sop?.name ?? "—"}</p>
                <p className="mt-1.5">
                  {steps.map((s, i) => (
                    <span key={s.stepNumber}>
                      {i > 0 && " · "}
                      <span className={s.stepNumber <= sopDone ? "text-emerald-700" : "text-stone-500"}>
                        {s.stepNumber}. {s.action}
                      </span>
                    </span>
                  ))}
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  );
}
