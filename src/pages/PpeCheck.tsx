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
import { ArrowRight, Camera, HardHat, Loader2, PlugZap } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { getPPEDetectionService, getAIMode, type PPECheckResult, type PPEMap } from "@/lib/services";
import { PPE_ITEMS } from "@/lib/constants";
import { fmtPct } from "@/lib/format";

export default function PpeCheck() {
  const ctx = useWorkerContext();
  const { mode, demoEnabled, setDemoEnabled } = useAIMode();
  const navigate = useNavigate();
  const cameraRef = useRef<CameraHandle>(null);
  const recordCheck = useMutation(api.ppe.recordCheck);
  const setStage = useMutation(api.jobs.setStage);

  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<PPECheckResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(false);

  const workerId = ctx?.worker?.workerId ?? "";
  const job = ctx?.job ?? null;

  const nav = [
    { to: "/worker", label: "Dashboard", end: true },
    { to: "/worker/ppe", label: "PPE" },
    { to: "/worker/journey", label: "Journey" },
    { to: "/worker/worksite", label: "Worksite" },
    { to: "/worker/monitor", label: "Monitor" },
  ];

  const captureAndCheck = async () => {
    if (!cameraRef.current || !ctx || !ctx.worker || !job) return;
    if (cameraRef.current.status !== "live") {
      toast.error("Camera not live — start the camera first.");
      return;
    }
    const frame = await cameraRef.current.captureBlob();
    if (!frame) {
      toast.error("Could not capture a frame — is the camera streaming?");
      return;
    }
    setCapturing(true);
    setResult(null);
    try {
      const service = getPPEDetectionService(getAIMode());
      const res = await service.checkPpe(frame, {
        workerId,
        jobId: job._id,
        stage: "pre_departure",
        attempt,
      });
      setResult(res);
      setAttempt((a) => a + 1);
      await recordCheck({
        jobId: job._id,
        workerId: ctx!.worker!._id,
        stage: "pre_departure",
        items: res.items,
        tools: res.tools,
        overallStatus: res.overallStatus,
        mode: res.mode,
      });
      setSaved(true);
      if (res.overallStatus === "PASSED") {
        toast.success("PPE check passed. You may start the journey.");
      } else {
        toast.warning(res.message ?? "PPE check failed — see details below.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PPE verification failed");
    } finally {
      setCapturing(false);
    }
  };

  const startJourney = async () => {
    if (!job) return;
    await setStage({ jobId: job._id, to: "TRAVELING" });
    toast.success("Journey started — GPS tracking will begin.");
    navigate("/worker/journey");
  };

  const itemStatus = (key: keyof PPEMap) => result?.items[key];

  return (
    <Shell roleLabel="worker" workerTag={workerId} nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> PRE-DEPARTURE PPE CHECK
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {job ? `${job.jobNumber} · ${job.title}` : "no job assigned"} — stage:{" "}
            {job?.status ?? "—"}
          </p>
        </div>
        <AIModeBadge mode={mode} />
      </div>

      {job?.status && !["ASSIGNED", "PPE_CHECK"].includes(job.status) && (
        <div className="mt-4 rounded-md border border-amber-700/40 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900">
          This job has already passed the pre-departure check (stage {job.status}).
          You can still re-run it below.
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
                CAPTURE PPE CHECK
              </Button>
              {result?.overallStatus === "PASSED" && (
                <Button
                  onClick={startJourney}
                  className="gap-2 rounded-sm bg-emerald-700 font-mono text-xs hover:bg-emerald-800"
                >
                  START JOURNEY <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel
            title="Detection results"
            right={
              result ? (
                <StatusBadge tone={result.overallStatus === "PASSED" ? "ok" : "crit"}>
                  {result.overallStatus}
                </StatusBadge>
              ) : (
                <DemoTag />
              )
            }
          >
            {mode === "unavailable" ? (
              <div className="p-4">
                <div className="rounded-md border border-dashed border-stone-400/70 bg-stone-50 px-4 py-6 text-center">
                  <PlugZap className="mx-auto size-5 text-stone-400" />
                  <p className="mt-2 font-mono text-xs font-bold text-stone-600">
                    AI PPE verification service not connected
                  </p>
                  <p className="mx-auto mt-1 max-w-sm font-mono text-[11px] leading-relaxed text-stone-500">
                    The Python FastAPI AI backend is not configured. Set{" "}
                    <code className="rounded-sm bg-stone-200 px-1 text-emerald-800">
                      VITE_AI_API_URL
                    </code>{" "}
                    to connect the real YOLO PPE model. No results are shown —
                    this UI never fabricates detections.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-1.5 rounded-sm font-mono text-[11px]"
                    onClick={() => setDemoEnabled(true)}
                  >
                    Enable demo simulation (labeled SIMULATED)
                  </Button>
                </div>
              </div>
            ) : !result ? (
              <p className="px-4 py-8 text-center font-mono text-xs text-stone-500">
                Capture a frame to run the PPE check. Results appear here.
              </p>
            ) : (
              <div className="divide-y divide-stone-200/70">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                    verification mode
                  </span>
                  <span className="flex items-center gap-1.5">
                    {result.mode === "demo" && <SimulatedTag />}
                    {result.mode === "production" && <StatusBadge tone="ok">MODEL</StatusBadge>}
                  </span>
                </div>
                {PPE_ITEMS.map((item) => {
                  const st = itemStatus(item.key);
                  return (
                    <div key={item.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="font-mono text-xs text-stone-700">{item.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-stone-400">
                          {st ? `${fmtPct(st.confidence * 100)} conf` : ""}
                        </span>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-sm border font-mono text-[11px] font-bold",
                            st?.detected
                              ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                              : "border-red-700 bg-red-50 text-red-700",
                          )}
                        >
                          {st?.detected ? "✓" : "✗"}
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
                  </div>
                </div>
                {result.message && (
                  <div className="mx-4 my-3 rounded-sm border border-red-700/40 bg-red-50 px-3 py-2 font-mono text-xs text-red-800">
                    {result.message}
                  </div>
                )}
                {saved && (
                  <p className="px-4 py-2 font-mono text-[10px] text-emerald-700">
                    ✓ stored in cloud database (job + worker + timestamp)
                  </p>
                )}
              </div>
            )}
          </Panel>

          {mode === "demo" && !result && (
            <p className="rounded-sm border border-amber-700/40 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-900">
              Demo simulation is enabled. Results will be clearly labeled{" "}
              <SimulatedTag /> and are not real AI detections.{" "}
              <button
                className="underline"
                onClick={() => setDemoEnabled(false)}
              >
                Disable
              </button>
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
