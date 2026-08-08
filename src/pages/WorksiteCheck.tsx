import { Button } from "@/components/ui/button";
import {
  CameraCapture,
  type CameraHandle,
} from "@/components/terminal/CameraCapture";
import { PrivacyNotice } from "@/components/terminal/PrivacyNotice";
import { DemoTag, SimulatedTag, StatusBadge, AIModeBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { Shell } from "@/components/terminal/Shell";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useWorkerContext } from "@/hooks/use-worker-context";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, Camera, Loader2, TriangleAlert, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { getPPEDetectionService, getAIMode, type PPECheckResult, type PPEMap } from "@/lib/services";
import { PPE_ITEMS } from "@/lib/constants";
import { fmtPct } from "@/lib/format";

export default function WorksiteCheck() {
  const ctx = useWorkerContext();
  const { mode, demoEnabled, setDemoEnabled } = useAIMode();
  const navigate = useNavigate();
  const cameraRef = useRef<CameraHandle>(null);
  const recordCheck = useMutation(api.ppe.recordCheck);
  const setStage = useMutation(api.jobs.setStage);

  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<PPECheckResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  const worker = ctx?.worker ?? null;
  const job = ctx?.job ?? null;
  const sop = ctx?.sop ?? null;

  const nav = [
    { to: "/worker", label: "Dashboard", end: true },
    { to: "/worker/ppe", label: "PPE" },
    { to: "/worker/journey", label: "Journey" },
    { to: "/worker/worksite", label: "Worksite" },
    { to: "/worker/monitor", label: "Monitor" },
  ];

  const captureAndCheck = async () => {
    if (!cameraRef.current || !job || !worker) return;
    if (cameraRef.current.status !== "live") {
      toast.error("Camera not live — start the camera first.");
      return;
    }
    const frame = await cameraRef.current.captureBlob();
    if (!frame) return;
    setCapturing(true);
    setResult(null);
    try {
      const service = getPPEDetectionService(getAIMode());
      const res = await service.checkPpe(frame, {
        workerId: worker.workerId,
        jobId: job._id,
        stage: "worksite",
        attempt,
      });
      setResult(res);
      setAttempt((a) => a + 1);
      await recordCheck({
        jobId: job._id,
        workerId: worker._id,
        stage: "worksite",
        items: res.items,
        tools: res.tools,
        overallStatus: res.overallStatus,
        mode: res.mode,
      });
      if (res.overallStatus === "PASSED") {
        toast.success("Worksite check passed. You are clear to start work.");
      } else {
        toast.warning(res.message ?? "Worksite check failed.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Worksite verification failed");
    } finally {
      setCapturing(false);
    }
  };

  const readyToWork = async () => {
    if (!job) return;
    await setStage({ jobId: job._id, to: "WORKING" });
    toast.success("Maintenance session unlocked.");
    navigate("/worker/monitor");
  };

  const missingItems = result
    ? [
        ...PPE_ITEMS.filter((i) => !result.items[i.key].detected).map((i) => i.label),
        ...result.tools.filter((t) => !t.detected).map((t) => t.tool),
      ]
    : [];

  const passed = result?.overallStatus === "PASSED" && missingItems.length === 0;

  return (
    <Shell roleLabel="worker" workerTag={worker?.workerId} nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-stone-900">
            <span className="text-amber-700">▌</span> WORKSITE SAFETY CHECK
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {job ? `${job.jobNumber} · ${job.title}` : "no job assigned"} — stage: {job?.status ?? "—"}
          </p>
        </div>
        <AIModeBadge mode={mode} />
      </div>

      {job?.status && !["ARRIVED", "WORKSITE_CHECK", "WORKING", "WARNING"].includes(job.status) && (
        <div className="mt-4 rounded-md border border-amber-700/40 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900">
          Reached the worksite first? Confirm arrival in{" "}
          <button className="underline" onClick={() => navigate("/worker/journey")}>
            Journey Tracking
          </button>{" "}
          before the worksite check.
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Panel title="Camera feed">
            <div className="p-3">
              <CameraCapture ref={cameraRef} />
              <PrivacyNotice variant="camera" />
            </div>
          </Panel>
          <Panel title="Actions">
            <div className="flex flex-wrap gap-2 p-3">
              <Button
                onClick={captureAndCheck}
                disabled={capturing || !job || cameraRef.current?.status !== "live"}
                className="gap-2 rounded-sm font-mono text-xs"
              >
                {capturing ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                RUN WORKSITE CHECK
              </Button>
              {passed && (
                <Button
                  onClick={readyToWork}
                  className="gap-2 rounded-sm bg-emerald-700 font-mono text-xs hover:bg-emerald-800"
                >
                  READY TO START WORK <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="Verification result" right={result && <StatusBadge tone={passed ? "ok" : "crit"}>{passed ? "PASSED" : result.overallStatus}</StatusBadge>}>
            {mode === "unavailable" ? (
              <div className="p-4">
                <div className="rounded-md border border-dashed border-stone-400/70 bg-stone-50 px-4 py-6 text-center">
                  <p className="font-mono text-xs font-bold text-stone-600">
                    AI PPE verification service not connected
                  </p>
                  <p className="mx-auto mt-1 max-w-sm font-mono text-[11px] leading-relaxed text-stone-500">
                    Set <code className="rounded-sm bg-stone-200 px-1 text-emerald-800">VITE_AI_API_URL</code> to
                    connect the real YOLO PPE model, or enable labeled demo simulation.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-sm font-mono text-[11px]"
                    onClick={() => setDemoEnabled(true)}
                  >
                    Enable demo simulation (labeled SIMULATED)
                  </Button>
                </div>
              </div>
            ) : !result ? (
              <p className="px-4 py-8 text-center font-mono text-xs text-stone-500">
                Run the worksite check to verify PPE and required tools.
              </p>
            ) : (
              <div className="divide-y divide-stone-200/70">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                    verification mode
                  </span>
                  {result.mode === "demo" ? <SimulatedTag /> : <StatusBadge tone="ok">MODEL</StatusBadge>}
                </div>
                {PPE_ITEMS.map((item) => {
                  const st = result.items[item.key];
                  return (
                    <div key={item.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="font-mono text-xs text-stone-700">{item.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-stone-400">
                          {fmtPct(st.confidence * 100)} conf
                        </span>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-sm border font-mono text-[11px] font-bold",
                            st.detected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                              : "border-red-700 bg-red-50 text-red-700",
                          )}
                        >
                          {st.detected ? "✓" : "✗"}
                        </span>
                      </span>
                    </div>
                  );
                })}
                <div className="px-4 py-2.5">
                  <p className="mb-1.5 font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                    required tools
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.tools.map((t) => (
                      <span
                        key={t.tool}
                        className={cn(
                          "rounded-sm border px-2 py-0.5 font-mono text-[10px]",
                          t.detected
                            ? "border-emerald-700/40 bg-emerald-50 text-emerald-800"
                            : "border-red-700/40 bg-red-50 text-red-700",
                        )}
                      >
                        {t.detected ? "✓" : "✗"} {t.tool}
                      </span>
                    ))}
                    {sop && sop.requiredTools.length > 0 && (
                      <span className="font-mono text-[10px] text-stone-400">
                        SOP requires: {sop.requiredTools.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                {missingItems.length > 0 && (
                  <div className="mx-4 my-3 rounded-sm border border-red-700/50 bg-red-50 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-red-800">
                      <TriangleAlert className="size-4" /> REQUIRED ITEMS MISSING
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-red-700">
                      {missingItems.join(", ")} not detected. Please correct
                      before starting maintenance.
                    </p>
                  </div>
                )}
                {passed && (
                  <p className="px-4 py-2.5 font-mono text-[11px] text-emerald-700">
                    ✓ All checks passed — maintenance may begin.
                  </p>
                )}
              </div>
            )}
          </Panel>
          {mode === "demo" && !result && (
            <p className="rounded-sm border border-amber-700/40 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-900">
              Demo simulation enabled — results are labeled <SimulatedTag /> and are not real AI.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
