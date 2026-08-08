import { Button } from "@/components/ui/button";
import { AlertFeed } from "@/components/terminal/AlertFeed";
import { DemoTag, StatusBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { ScoreRing } from "@/components/terminal/ScoreRing";
import { Shell } from "@/components/terminal/Shell";
import { SopTimeline } from "@/components/terminal/SopTimeline";
import { StageStepper } from "@/components/terminal/StageStepper";
import { StatCard } from "@/components/terminal/StatCard";
import { useAIMode } from "@/hooks/use-ai-mode";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { JOURNEY_TIMELINE, PPE_ITEMS, STAGE_META, type Tone } from "@/lib/constants";
import { fmtDateTime, fmtDuration, fmtPct, timeAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function WorkerDetails() {
  const { workerId = "" } = useParams();
  const navigate = useNavigate();
  const { mode } = useAIMode();
  const detail = useQuery(api.workers.getWorkerDetail, { workerId });
  const resolveAlert = useMutation(api.alerts.resolve);

  const nav = [
    { to: "/supervisor", label: "Command", end: true },
    { to: "/supervisor/sops", label: "SOPs" },
    { to: "/supervisor/reports", label: "Reports" },
  ];

  if (!detail) {
    return (
      <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
        <Skeleton className="h-72 rounded-md" />
      </Shell>
    );
  }

  const { worker, job, sop, steps, session, ppeChecks, alerts, score, locations, report, aiDetections } = detail;

  if (!worker) {
    return (
      <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
        <Panel title="Worker not found">
          <div className="px-4 py-10 font-mono text-xs text-stone-600">
            No worker with id {workerId}.
          </div>
        </Panel>
      </Shell>
    );
  }

  const stageMeta = job ? STAGE_META[job.status] : null;
  const stageIndex = job ? JOURNEY_TIMELINE.findIndex((s) => s.key === job.status) : -1;
  const doneKeys = stageIndex >= 0 ? JOURNEY_TIMELINE.slice(0, stageIndex).map((s) => s.key) : [];
  const ppeStatus = ppeChecks[0];
  const sopDone = session?.completedSteps.length ?? 0;
  const sopTotal = steps.length;

  return (
    <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 gap-1.5 rounded-sm font-mono text-[11px] text-stone-500"
        onClick={() => navigate("/supervisor")}
      >
        <ArrowLeft className="size-3.5" /> COMMAND CENTER
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
            {worker.name}
          </h1>
          <span className="rounded-sm bg-stone-800 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-stone-100">
            {worker.workerId}
          </span>
          {worker.isDemo && <DemoTag />}
        </div>
        {job && stageMeta && (
          <StatusBadge tone={stageMeta.tone}>{job.status}</StatusBadge>
        )}
      </div>

      {!job ? (
        <Panel title="No current job" className="mt-5">
          <div className="px-4 py-8 font-mono text-xs text-stone-500">
            This worker has no assigned job.
          </div>
        </Panel>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Current job" value={job.jobNumber} sub={job.title} tone="info" />
            <StatCard label="Customer" value={job.customer} sub={job.destinationAddress} tone="neutral" />
            <StatCard
              label="PPE status"
              value={ppeStatus?.overallStatus ?? "NOT CHECKED"}
              sub={ppeStatus ? `${ppeStatus.stage.replace("_", " ")} · ${timeAgo(ppeStatus.timestamp)}` : "no checks"}
              tone={ppeStatus?.overallStatus === "PASSED" ? "ok" : ppeStatus?.overallStatus === "FAILED" ? "crit" : "warn"}
            />
            <StatCard
              label="SOP progress"
              value={`${sopDone} / ${sopTotal}`}
              sub={session?.status ?? "not started"}
              tone={sopTotal > 0 && sopDone === sopTotal ? "ok" : "info"}
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Panel title="Journey timeline">
              <div className="p-4">
                <StageStepper
                  stages={JOURNEY_TIMELINE}
                  currentKey={job.status === "COMPLETED" ? "COMPLETED" : job.status}
                  completedKeys={doneKeys}
                />
              </div>
            </Panel>

            <Panel title="SOP progress" right={<span className="font-mono text-[10px] text-stone-400">{sopDone}/{sopTotal}</span>}>
              <SopTimeline steps={steps} session={session} />
            </Panel>

            <div className="space-y-4">
              <Panel title="Compliance score">
                {score ? (
                  <div className="flex flex-col items-center gap-3 p-4">
                    <ScoreRing value={score.overallScore} size={104} label="overall" />
                    <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
                      {[
                        ["PPE", score.ppeCompliance],
                        ["SOP", score.sopCompliance],
                        ["Safety", score.safetyCompliance],
                        ["Route", score.routeCompliance],
                        ["Sequence", score.sequenceCompliance],
                        ["Tools", score.toolCompliance],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between">
                          <span className="text-stone-500">{l}</span>
                          <span className="font-bold text-stone-800">{fmtPct(v as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="px-4 py-8 text-center font-mono text-xs text-stone-500">
                    Score is generated when the job is completed.
                  </p>
                )}
              </Panel>
              <Panel title="Latest AI detections">
                <ul className="max-h-56 divide-y divide-stone-200/70 overflow-y-auto font-mono">
                  {aiDetections.slice(0, 12).map((d) => (
                    <li key={d._id} className="px-3 py-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-700">
                          {d.detectedAction?.action ?? d.detections[0]?.class ?? "frame"}
                        </span>
                        <span className="text-stone-400">{timeAgo(d.timestamp)}</span>
                      </div>
                      {d.detectedAction && (
                        <p className="mt-0.5 text-[10px] text-stone-500">
                          {fmtPct(d.detectedAction.confidence * 100)} conf · source: {d.detectedAction.source}
                          {d.mode === "demo" && <span className="text-amber-700"> · SIMULATED</span>}
                        </p>
                      )}
                    </li>
                  ))}
                  {aiDetections.length === 0 && (
                    <li className="px-3 py-4 text-center text-stone-500">no detections yet</li>
                  )}
                </ul>
              </Panel>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="PPE verification history" right={<span className="font-mono text-[10px] text-stone-400">{ppeChecks.length} checks</span>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] font-mono text-xs">
                  <thead>
                    <tr className="border-b border-stone-300 text-left text-[10px] tracking-widest text-stone-500 uppercase">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/70">
                    {ppeChecks.map((c) => (
                      <tr key={c._id}>
                        <td className="px-3 py-2 text-stone-600">{fmtDateTime(c.timestamp)}</td>
                        <td className="px-3 py-2 text-stone-700">{c.stage.replace("_", " ")}</td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={c.overallStatus === "PASSED" ? "ok" : c.overallStatus === "FAILED" ? "crit" : "warn"}>
                            {c.overallStatus}
                          </StatusBadge>
                        </td>
                        <td className="px-3 py-2 text-stone-500">{c.mode}</td>
                      </tr>
                    ))}
                    {ppeChecks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-stone-500">no checks</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {ppeChecks[0] && (
                <div className="border-t border-stone-200 px-3 py-2.5">
                  <p className="mb-1.5 font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                    latest check items
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PPE_ITEMS.map((item) => {
                      const st = ppeChecks[0].items[item.key];
                      return (
                        <span
                          key={item.key}
                          className={cn(
                            "rounded-sm border px-2 py-0.5 font-mono text-[10px]",
                            st.detected
                              ? "border-emerald-700/40 bg-emerald-50 text-emerald-800"
                              : "border-red-700/40 bg-red-50 text-red-700",
                          )}
                        >
                          {st.detected ? "✓" : "✗"} {item.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Alerts" right={<span className="font-mono text-[10px] text-stone-400">{alerts.filter((a) => !a.resolved).length} active</span>}>
              <div className="max-h-80 overflow-y-auto">
                <AlertFeed
                  alerts={alerts}
                  showResolve
                  onResolve={(alert) =>
                    void resolveAlert({ alertId: alert._id, acknowledged: true }).catch(() => {})
                  }
                />
              </div>
            </Panel>
          </div>

          {report && (
            <Panel title="Completion report" className="mt-4" right={<DemoTag />}>
              <dl className="grid gap-x-6 gap-y-2 p-4 font-mono text-xs sm:grid-cols-3">
                <Row label="Job" value={`${report.data.jobNumber} · ${report.data.title}`} />
                <Row label="Customer" value={report.data.customer} />
                <Row label="Duration" value={fmtDuration(report.data.journeyDurationMs)} />
                <Row label="Started" value={fmtDateTime(report.data.startedAt)} />
                <Row label="Ended" value={fmtDateTime(report.data.endedAt)} />
                <Row label="SOP" value={report.data.sops ?? "—"} />
              </dl>
              <div className="border-t border-stone-200 px-4 py-3">
                <p className="mb-2 font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                  violations ({report.data.violations?.length ?? 0})
                </p>
                {report.data.violations?.length ? (
                  <ul className="space-y-1.5 font-mono text-[11px]">
                    {report.data.violations.map((v: { type: string; severity: string; message: string; timestamp: number }, i: number) => (
                      <li key={i} className="flex items-start justify-between gap-3 rounded-sm bg-stone-50 px-2.5 py-1.5">
                        <span className="text-stone-700">
                          <span className={cn("font-bold", v.severity === "LOW" ? "text-stone-500" : v.severity === "MEDIUM" ? "text-amber-700" : "text-red-700")}>
                            {v.type}
                          </span>
                          {" · "}
                          {v.message}
                        </span>
                        <span className="shrink-0 text-stone-400">{fmtDateTime(v.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-[11px] text-emerald-700">no violations recorded</p>
                )}
              </div>
            </Panel>
          )}
        </>
      )}
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-semibold text-stone-900">{value}</dd>
    </div>
  );
}
