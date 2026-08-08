import { Button } from "@/components/ui/button";
import { DemoTag, StatusBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { ScoreRing } from "@/components/terminal/ScoreRing";
import { Shell } from "@/components/terminal/Shell";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useEnsureDemoData } from "@/hooks/use-demo-seed";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtDuration, fmtPct } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

interface ReportData {
  jobNumber: string;
  title: string;
  customer: string;
  destination?: string;
  workerId: string;
  workerName: string;
  startedAt?: number | null;
  endedAt?: number | null;
  journeyDurationMs?: number | null;
  ppeCompliance?: number;
  sopCompliance?: number;
  safetyCompliance?: number;
  routeCompliance?: number;
  sequenceCompliance?: number;
  toolCompliance?: number;
  overallScore: number;
  violations: {
    type: string;
    severity: string;
    message: string;
    timestamp: number;
    sopStep?: number;
    resolved?: boolean;
  }[];
  sops?: string | null;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  useEnsureDemoData();
  const { mode } = useAIMode();
  const reports = useQuery(api.scores.listWithJobs);
  const [selected, setSelected] = useState<string | null>(null);

  const nav = [
    { to: "/supervisor", label: "Command", end: true },
    { to: "/supervisor/sops", label: "SOPs" },
    { to: "/supervisor/reports", label: "Reports" },
  ];

  const selectedEntry = useMemo(
    () => reports?.find((r) => r.report._id === selected) ?? null,
    [reports, selected],
  );

  if (!reports) {
    return (
      <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
        <Skeleton className="h-64 rounded-md" />
      </Shell>
    );
  }

  const exportJson = (data: ReportData) => {
    download(
      `report-${data.jobNumber}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
    toast.success("JSON report downloaded.");
  };

  const exportCsv = (data: ReportData) => {
    const header = "type,severity,message,timestamp,sop_step";
    const rows = data.violations.map((v) =>
      [
        v.type,
        v.severity,
        `"${v.message.replace(/"/g, '""')}"`,
        new Date(v.timestamp).toISOString(),
        v.sopStep ?? "",
      ].join(","),
    );
    download(`report-${data.jobNumber}-violations.csv`, [header, ...rows].join("\n"), "text/csv");
    toast.success("Violations CSV downloaded.");
  };

  return (
    <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> JOB COMPLETION REPORTS
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            quality scores, compliance breakdowns and timestamped violations
          </p>
        </div>
        <DemoTag />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[380px_1fr]">
        <Panel title="Completed jobs">
          <ul className="divide-y divide-stone-200/70 font-mono">
            {reports.map((r) => (
              <li key={r.report._id}>
                <button
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-emerald-700/5",
                    selected === r.report._id && "bg-emerald-700/10",
                  )}
                  onClick={() => setSelected(r.report._id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-900">{r.report.data.jobNumber}</span>
                    <span className="text-emerald-700">{fmtPct(r.report.data.overallScore)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {r.report.data.title} · {r.worker?.workerId ?? "?"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {fmtDateTime(r.report.data.endedAt)}
                  </p>
                </button>
              </li>
            ))}
            {reports.length === 0 && (
              <li className="px-4 py-8 text-center text-stone-500">no completed reports yet</li>
            )}
          </ul>
        </Panel>

        <div className="min-w-0">
          {!selectedEntry ? (
            <Panel title="Select a report">
              <p className="px-4 py-12 text-center font-mono text-xs text-stone-500">
                Choose a completed job on the left to view its report.
              </p>
            </Panel>
          ) : (
            <ReportView
              data={selectedEntry.report.data as ReportData}
              onExportJson={exportJson}
              onExportCsv={exportCsv}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

function ReportView({
  data,
  onExportJson,
  onExportCsv,
}: {
  data: ReportData;
  onExportJson: (d: ReportData) => void;
  onExportCsv: (d: ReportData) => void;
}) {
  const compliance: [string, number | undefined][] = [
    ["PPE compliance", data.ppeCompliance],
    ["SOP compliance", data.sopCompliance],
    ["Safety compliance", data.safetyCompliance],
    ["Route compliance", data.routeCompliance],
    ["Sequence compliance", data.sequenceCompliance],
    ["Tool compliance", data.toolCompliance],
  ];

  return (
    <div className="space-y-4">
      <Panel
        title={data.jobNumber}
        right={
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-sm font-mono text-[10px]"
              onClick={() => onExportJson(data)}
            >
              <FileJson className="size-3.5" /> JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-sm font-mono text-[10px]"
              onClick={() => onExportCsv(data)}
            >
              <FileSpreadsheet className="size-3.5" /> VIOLATIONS CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-sm font-mono text-[10px]"
              onClick={() => window.print()}
            >
              <Download className="size-3.5" /> PRINT
            </Button>
          </div>
        }
      >
        <dl className="grid gap-x-6 gap-y-2 p-4 font-mono text-xs sm:grid-cols-3">
          <Row label="Worker" value={`${data.workerId} · ${data.workerName}`} />
          <Row label="Job ID" value={data.jobNumber} />
          <Row label="Customer" value={data.customer} />
          <Row label="Start" value={fmtDateTime(data.startedAt)} />
          <Row label="End" value={fmtDateTime(data.endedAt)} />
          <Row label="Journey duration" value={fmtDuration(data.journeyDurationMs)} />
          <Row label="SOP" value={data.sops ?? "—"} />
          <Row label="Destination" value={data.destination ?? "—"} />
          <Row label="Overall quality" value={fmtPct(data.overallScore)} />
        </dl>
      </Panel>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Panel title="Quality score">
          <div className="flex flex-col items-center gap-2 p-4">
            <ScoreRing value={data.overallScore} size={140} label="overall" />
            <StatusBadge tone={data.overallScore >= 80 ? "ok" : data.overallScore >= 60 ? "warn" : "crit"}>
              {data.overallScore >= 80 ? "EXCELLENT" : data.overallScore >= 60 ? "REVIEW" : "FAILED"}
            </StatusBadge>
          </div>
        </Panel>
        <Panel title="Compliance breakdown">
          <div className="divide-y divide-stone-200/70 font-mono">
            {compliance.map(([label, v]) => {
              const n = v ?? 0;
              return (
                <div key={label} className="px-4 py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-600">{label}</span>
                    <span className={cn("font-bold", n >= 80 ? "text-emerald-700" : n >= 60 ? "text-amber-700" : "text-red-700")}>
                      {fmtPct(n)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        n >= 80 ? "bg-emerald-600" : n >= 60 ? "bg-amber-500" : "bg-red-600",
                      )}
                      style={{ width: `${n}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title={`Violations (${data.violations.length})`}>
        {data.violations.length === 0 ? (
          <p className="px-4 py-6 font-mono text-xs text-emerald-700">
            ✓ no violations recorded for this job
          </p>
        ) : (
          <ul className="divide-y divide-stone-200/70 font-mono">
            {data.violations.map((v, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-stone-700">
                    <span
                      className={cn(
                        "font-bold",
                        v.severity === "LOW"
                          ? "text-stone-500"
                          : v.severity === "MEDIUM"
                            ? "text-amber-700"
                            : "text-red-700",
                      )}
                    >
                      {v.type}
                    </span>
                    {v.sopStep !== undefined && <span className="text-stone-400"> · step {v.sopStep}</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-600">{v.message}</p>
                </div>
                <span className="shrink-0 text-[10px] text-stone-400">{fmtDateTime(v.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
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
