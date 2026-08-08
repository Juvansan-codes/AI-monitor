import { Button } from "@/components/ui/button";
import {
  CameraCapture,
  type CameraHandle,
} from "@/components/terminal/CameraCapture";
import { PrivacyNotice } from "@/components/terminal/PrivacyNotice";
import { DemoTag, SimulatedTag, StatusBadge, AIModeBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { ScoreRing } from "@/components/terminal/ScoreRing";
import { Shell } from "@/components/terminal/Shell";
import { SopTimeline } from "@/components/terminal/SopTimeline";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useWorkerContext } from "@/hooks/use-worker-context";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Radio,
  StopCircle,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import {
  getAIMode,
  getActionRecognitionService,
  getObjectDetectionService,
  SOPVerificationEngine,
  subscribeToJobAlerts,
  type ActionResult,
  type Detection,
  type DetectionResult,
  type SopVerdict,
} from "@/lib/services";
import { computeJobScore, type ScoreResult } from "@/lib/scoring";
import { fmtPct, fmtDuration } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";

interface LocalSopState {
  currentStepNumber: number;
  completedSteps: number[];
  skippedSteps: number[];
  incorrectSteps: number[];
}

interface DetectionTick {
  detections: Detection[];
  action: ActionResult;
  verdict: SopVerdict;
  mode: string;
  ts: number;
}

const TICK_MS = 4500;

export default function Monitor() {
  const ctx = useWorkerContext();
  const { mode, demoEnabled, setDemoEnabled } = useAIMode();
  const navigate = useNavigate();
  const cameraRef = useRef<CameraHandle>(null);

  const startSession = useMutation(api.sessions.start);
  const recordDetection = useMutation(api.sessions.recordDetection);
  const completeJob = useMutation(api.jobs.completeJob);
  const setStage = useMutation(api.jobs.setStage);

  const [running, setRunning] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [tick, setTick] = useState<DetectionTick | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastScore, setLastScore] = useState<ScoreResult | null>(null);
  const [sop, setSop] = useState<LocalSopState | null>(null);
  const sopRef = useRef<LocalSopState | null>(null);
  const warnedStep = useRef<number | null>(null);

  const job = ctx?.job ?? null;
  const worker = ctx?.worker ?? null;
  const steps = ctx?.steps ?? [];
  const engine = useMemo(
    () => new SOPVerificationEngine(steps),
    [steps],
  );

  // Initialize local SOP state once from the server session.
  useEffect(() => {
    if (!sop && ctx?.session && steps.length > 0) {
      const s: LocalSopState = {
        currentStepNumber: ctx.session.currentStepNumber,
        completedSteps: [...ctx.session.completedSteps],
        skippedSteps: [...ctx.session.skippedSteps],
        incorrectSteps: [...ctx.session.incorrectSteps],
      };
      sopRef.current = s;
      setSop(s);
    }
  }, [ctx?.session, sop, steps.length]);

  const setSopState = useCallback((s: LocalSopState) => {
    sopRef.current = s;
    setSop(s);
  }, []);

  // Start the maintenance session once we're working.
  useEffect(() => {
    if (!job || !worker || !ctx?.sop || sessionId || running) return;
    if (job.status !== "WORKING" && job.status !== "WARNING") return;
    void (async () => {
      const id = await startSession({
        jobId: job._id,
        workerId: worker._id,
        sopId: ctx.sop!._id,
      });
      setSessionId(id);
    })();
  }, [job, worker, ctx?.sop, sessionId, running, startSession]);

  const tickOnce = useCallback(async () => {
    if (!job || !worker || !cameraLive || !sessionId) return;
    const current = sopRef.current;
    if (!current) return;
    const expected = steps.find((s) => s.stepNumber === current.currentStepNumber);
    if (!expected) return; // all done

    const frame = await cameraRef.current?.captureBlob();
    if (!frame) return;

    try {
      const connected = getAIMode() === "production";
      const objService = getObjectDetectionService(getAIMode());
      const det = await objService.detect(frame, {
        workerId: worker.workerId,
        jobId: job._id,
        trackId: "T001",
        expectedActionCode: expected.actionCode,
      });
      // When the FastAPI backend is connected, /api/ai/detect already runs the
      // full server-side pipeline and returns the recognized action; only fall
      // back to the separate recognize call in demo/unconnected mode.
      let action = det.currentAction;
      if (!action) {
        const actService = getActionRecognitionService(getAIMode());
        action = await actService.recognize(frame, {
          workerId: worker.workerId,
          jobId: job._id,
          detections: det.detections,
          expectedActionCode: expected.actionCode,
          expectedLabel: expected.action,
          stepIndex: current.currentStepNumber,
        });
      }
      const verdict = engine.verify(current.currentStepNumber, action);

      const next: LocalSopState = { ...current };
      const alerts: {
        type: "WRONG_SOP_STEP" | "SOP_STEP_SKIPPED" | "LOW_CONFIDENCE";
        severity: "HIGH" | "CRITICAL" | "MEDIUM" | "LOW";
        message: string;
        expected?: string;
        detected?: string;
        sopStep?: number;
      }[] = [];

      if (verdict.advance) {
        if (verdict.skippedSteps?.length) {
          next.skippedSteps = [...new Set([...next.skippedSteps, ...verdict.skippedSteps])];
          next.currentStepNumber = Math.max(
            next.currentStepNumber + 1,
            verdict.skippedSteps[verdict.skippedSteps.length - 1] + 1,
          );
          if (verdict.alert) {
            alerts.push({
              type: "SOP_STEP_SKIPPED",
              severity: verdict.alert.severity,
              message: verdict.alert.message,
              expected: verdict.alert.expected,
              detected: verdict.alert.detected,
              sopStep: verdict.alert.sopStep,
            });
          }
        } else {
          next.completedSteps = [...new Set([...next.completedSteps, current.currentStepNumber])];
          next.currentStepNumber = current.currentStepNumber + 1;
        }
      } else {
        next.incorrectSteps = [...new Set([...next.incorrectSteps, current.currentStepNumber])];
        if (verdict.alert && warnedStep.current !== current.currentStepNumber) {
          warnedStep.current = current.currentStepNumber;
          alerts.push({
            type: "WRONG_SOP_STEP",
            severity: verdict.alert.severity,
            message: verdict.alert.message,
            expected: verdict.alert.expected,
            detected: verdict.alert.detected,
            sopStep: verdict.alert.sopStep,
          });
        }
      }

      if (action.confidence < 0.55) {
        alerts.push({
          type: "LOW_CONFIDENCE",
          severity: "LOW",
          message: `Low detection confidence (${fmtPct(action.confidence * 100)}) on action "${action.action}".`,
        });
      }

      setSopState(next);
      setTick({
        detections: det.detections,
        action,
        verdict,
        mode: det.mode,
        ts: Date.now(),
      });

      await recordDetection({
        jobId: job._id,
        workerId: worker._id,
        sessionId,
        detections: det.detections,
        detectedAction: {
          action: action.action,
          actionCode: action.actionCode,
          confidence: action.confidence,
          evidence: action.evidence,
          source: action.source,
        },
        sopStatus: {
          status: verdict.status,
          expectedStep: verdict.expectedStep,
          expectedAction: verdict.expectedAction,
          detectedAction: verdict.detectedAction,
          message: verdict.message,
        },
        mode: det.mode,
        sessionUpdate: {
          currentStepNumber: next.currentStepNumber,
          completedSteps: next.completedSteps,
          skippedSteps: next.skippedSteps,
          incorrectSteps: next.incorrectSteps,
          status: "IN_PROGRESS",
        },
        alertsToCreate: alerts,
      });

      if (verdict.alert) toast.warning(verdict.alert.message);
      setServiceError(null);
    } catch (e) {
      setServiceError(e instanceof Error ? e.message : "Detection service failed");
    }
  }, [job, worker, cameraLive, sessionId, steps, engine, recordDetection, setSopState]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void tickOnce(), TICK_MS);
    return () => clearInterval(id);
  }, [running, tickOnce]);

  // Realtime alerts pushed by the FastAPI backend over WebSocket when the AI
  // backend is connected (worker-facing view of the backend alert engine).
  useEffect(() => {
    if (mode !== "production" || !job || !running) return;
    const seen = new Set<string>();
    const unsub = subscribeToJobAlerts(job._id, (msg) => {
      const key = `${msg.type}:${msg.message}:${msg.timestamp ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (msg.severity === "CRITICAL" || msg.severity === "HIGH") {
        toast.warning(msg.message, { duration: 6000 });
      } else {
        toast.info(msg.message);
      }
    });
    return unsub;
  }, [mode, job, running]);

  const finishJob = useCallback(async () => {
    if (!job || !worker) return;
    setBusy(true);
    try {
      const finalSop = sopRef.current ?? {
        currentStepNumber: 1,
        completedSteps: [],
        skippedSteps: [],
        incorrectSteps: [],
      };
      const score = computeJobScore({
        ppeChecks: ctx?.ppeChecks ?? [],
        alerts: ctx?.alerts ?? [],
        session: finalSop,
        totalSteps: steps.length,
        routeDeviations: (ctx?.alerts ?? []).filter(
          (a) => a.type === "ROUTE_DEVIATION" && !a.resolved,
        ).length,
        gpsPoints: ctx?.locations.length ?? 0,
      });
      const violations = (ctx?.alerts ?? [])
        .filter((a) => !a.resolved)
        .map((a) => ({
          type: a.type,
          severity: a.severity,
          message: a.message,
          timestamp: a.timestamp,
          sopStep: a.sopStep ?? undefined,
        }));
      const report = {
        jobNumber: job.jobNumber,
        title: job.title,
        customer: job.customer,
        destination: job.destinationAddress,
        workerId: worker.workerId,
        workerName: worker.name,
        startedAt: job.startedAt ?? null,
        endedAt: Date.now(),
        journeyDurationMs: job.startedAt ? Date.now() - job.startedAt : null,
        ppeCompliance: score.ppeCompliance,
        sopCompliance: score.sopCompliance,
        safetyCompliance: score.safetyCompliance,
        routeCompliance: score.routeCompliance,
        sequenceCompliance: score.sequenceCompliance,
        toolCompliance: score.toolCompliance,
        overallScore: score.overallScore,
        violations,
        sops: ctx?.sop?.name ?? null,
      };
      await completeJob({ jobId: job._id, score, report });
      setLastScore(score);
      setFinished(true);
      setRunning(false);
      toast.success("Job completed. Quality score generated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete job");
    } finally {
      setBusy(false);
    }
  }, [job, worker, ctx, steps.length, completeJob]);

  const nav = [
    { to: "/worker", label: "Dashboard", end: true },
    { to: "/worker/ppe", label: "PPE" },
    { to: "/worker/journey", label: "Journey" },
    { to: "/worker/worksite", label: "Worksite" },
    { to: "/worker/monitor", label: "Monitor" },
  ];

  if (!ctx || !job || !worker) {
    return (
      <Shell roleLabel="worker" nav={nav} aiMode={mode}>
        <Skeleton className="h-96 rounded-md" />
      </Shell>
    );
  }

  const expectedStep = steps.find((s) => s.stepNumber === sop?.currentStepNumber);
  const allDone = sop
    ? sop.currentStepNumber > steps.length && steps.length > 0
    : false;
  const deviation = tick && (tick.verdict.status === "ERROR" || tick.verdict.status === "WARNING" || tick.verdict.status === "CRITICAL") ? tick.verdict : null;

  if (finished) {
    return (
      <Shell roleLabel="worker" workerTag={worker.workerId} nav={nav} aiMode={mode}>
        <Panel title="Job complete">
          <div className="flex flex-col items-center gap-6 px-4 py-10">
            <CheckCircle2 className="size-10 text-emerald-700" />
            <div>
              <h1 className="text-center font-mono text-2xl font-bold text-stone-900">
                {job.jobNumber} COMPLETED
              </h1>
              <p className="mt-1 text-center font-mono text-xs text-stone-500">
                {job.title} · {job.customer}
              </p>
            </div>
            <div className="grid w-full max-w-md gap-4 sm:grid-cols-2">
              <div className="flex flex-col items-center gap-2 rounded-md border border-stone-300 p-4">
                <ScoreRing value={lastScore?.overallScore ?? 0} size={110} label="overall" />
                <p className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                  quality score
                </p>
              </div>
              <div className="space-y-1.5 rounded-md border border-stone-300 p-4 font-mono text-[11px]">
                <p className="mb-1.5 text-[10px] tracking-widest text-stone-500 uppercase">compliance</p>
                {[
                  ["PPE", lastScore?.ppeCompliance],
                  ["SOP", lastScore?.sopCompliance],
                  ["Safety", lastScore?.safetyCompliance],
                  ["Route", lastScore?.routeCompliance],
                ].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between">
                    <span className="text-stone-500">{l}</span>
                    <span className="font-bold text-stone-800">{fmtPct(typeof v === "number" ? v : 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="max-w-sm text-center font-mono text-[11px] leading-relaxed text-stone-500">
              Cloud report generated and stored with every violation timestamped.
              The supervisor can export it from the Reports page.
            </p>
            <Button
              className="gap-2 rounded-sm font-mono text-xs"
              onClick={() => navigate("/worker")}
            >
              BACK TO DASHBOARD
            </Button>
          </div>
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell roleLabel="worker" workerTag={worker.workerId} nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> MAINTENANCE MONITOR
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {job.jobNumber} · {job.title} · SOP: {ctx?.sop?.name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.isDemo && <DemoTag />}
          <StatusBadge tone={job.status === "WARNING" ? "crit" : "ok"}>{job.status}</StatusBadge>
        </div>
      </div>

      {mode === "unavailable" && (
        <div className="mt-4 rounded-md border border-dashed border-stone-400/70 bg-stone-50 px-4 py-3">
          <p className="font-mono text-xs font-bold text-stone-600">
            AI detection service not connected
          </p>
          <p className="mt-1 font-mono text-[11px] text-stone-500">
            Set <code className="rounded-sm bg-stone-200 px-1 text-emerald-800">VITE_AI_API_URL</code> to enable
            real YOLO detection, or{" "}
            <button className="underline" onClick={() => setDemoEnabled(true)}>
              enable labeled demo simulation
            </button>{" "}
            to walk the monitoring flow. Nothing is fabricated — the camera stays live either way.
          </p>
        </div>
      )}

      {deviation && (
        <div className="mt-4 rounded-md border-2 border-red-700/60 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-red-800">
            <AlertTriangle className="size-4" /> 🚨 SOP DEVIATION
          </p>
          <div className="mt-1.5 grid gap-1 font-mono text-[11px] text-red-800 sm:grid-cols-[1fr_1fr_auto] sm:gap-4">
            <span>Expected: {deviation.expectedAction ?? "—"}</span>
            <span>Detected: {deviation.detectedAction ?? "—"}</span>
            <span className="font-bold">ACTION: STOP / CORRECT STEP</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel
            title="Live camera feed"
            right={
              <span className="font-mono text-[10px] text-stone-400">
                frames analyzed every {TICK_MS / 1000}s
              </span>
            }
          >
            <div className="p-3">
              <CameraCapture
                ref={cameraRef}
                onStatusChange={(s) => setCameraLive(s === "live")}
              />
              <PrivacyNotice variant="camera" />
            </div>
          </Panel>

          <Panel title="AI detection panel" right={<AIModeBadge mode={mode} />}>
            <div className="grid grid-cols-2 gap-px bg-stone-200 font-mono sm:grid-cols-3">
              <Cell label="Worker" value={worker.workerId} />
              <Cell label="Equipment" value={job.title} />
              <Cell label="Detected tool" value={tick?.detections.find((d) => d.class !== "person")?.class ?? "—"} />
              <Cell label="Current action" value={tick?.action.action ?? "—"} warn={!!deviation} />
              <Cell label="Confidence" value={tick ? fmtPct(tick.action.confidence * 100) : "—"} />
              <Cell label="Current SOP step" value={expectedStep ? `${expectedStep.stepNumber}. ${expectedStep.action}` : "—"} />
            </div>
            <div className="border-t border-stone-200 px-3 py-2.5">
              <p className="mb-1.5 font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                detected objects
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(tick?.detections ?? []).map((d, i) => (
                  <span
                    key={`${d.class}-${i}`}
                    className="rounded-sm border border-stone-300 bg-stone-50 px-2 py-0.5 font-mono text-[10px] text-stone-700"
                  >
                    {d.class} <span className="text-stone-400">{fmtPct(d.confidence * 100)}</span>
                    {tick?.mode === "demo" && <span className="text-amber-700"> · SIM</span>}
                  </span>
                ))}
                {!tick && <span className="font-mono text-[10px] text-stone-400">waiting for first analysis…</span>}
              </div>
              {tick && tick.action.source === "simulated" && (
                <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-amber-800">
                  <SimulatedTag /> simulated detection — not a real AI result
                </p>
              )}
              {serviceError && (
                <p className="mt-2 font-mono text-[10px] text-red-700">service error: {serviceError}</p>
              )}
            </div>
          </Panel>

          <div className="flex flex-wrap gap-2">
            {!running ? (
              <Button
                onClick={() => setRunning(true)}
                disabled={mode === "unavailable" || !cameraLive}
                className="gap-2 rounded-sm font-mono text-xs"
              >
                <Play className="size-4" /> START AI MONITORING
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setRunning(false)}
                className="gap-2 rounded-sm font-mono text-xs"
              >
                <StopCircle className="size-4" /> PAUSE MONITORING
              </Button>
            )}
            <Button
              onClick={() => void finishJob()}
              disabled={busy || !allDone}
              className="gap-2 rounded-sm bg-emerald-700 font-mono text-xs hover:bg-emerald-800"
              title={!allDone ? "Complete all SOP steps first" : undefined}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              COMPLETE JOB
            </Button>
            {running && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-800">
                <Radio className="size-3.5 animate-pulse" /> monitoring active
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Panel
            title="SOP verification"
            right={
              <span className="font-mono text-[10px] text-stone-400">
                {sop?.completedSteps.length ?? 0}/{steps.length} done
              </span>
            }
          >
            <SopTimeline steps={steps} session={sop} />
            {!running && !allDone && (
              <p className="border-t border-stone-200 px-3 py-2.5 font-mono text-[10px] text-stone-500">
                Start monitoring to verify steps against the SOP in real time.
              </p>
            )}
            {allDone && (
              <p className="border-t border-emerald-700/30 bg-emerald-50 px-3 py-2.5 font-mono text-[11px] font-bold text-emerald-800">
                ✓ All steps verified — you can complete the job.
              </p>
            )}
          </Panel>

          <Panel title="Tools & equipment" right={<Wrench className="size-3.5 text-stone-400" />}>
            <div className="p-3 font-mono text-[11px] text-stone-600">
              <p className="text-stone-500">SOP required tools:</p>
              <p className="mt-1">
                {(ctx?.sop?.requiredTools ?? []).join(" · ") || "—"}
              </p>
              <p className="mt-2.5 text-stone-500">Maintenance session:</p>
              <p className="mt-1">
                {sessionId ? (
                  <span className="text-emerald-700">● IN PROGRESS</span>
                ) : (
                  <span className="text-stone-400">not started — begin monitoring</span>
                )}
              </p>
            </div>
          </Panel>

          <Panel title="Session stats">
            <div className="grid grid-cols-2 gap-px bg-stone-200 font-mono">
              <Cell label="Skipped steps" value={String(sop?.skippedSteps.length ?? 0)} />
              <Cell label="Incorrect steps" value={String(sop?.incorrectSteps.length ?? 0)} />
              <Cell label="Elapsed" value={fmtDuration(job.startedAt ? Date.now() - job.startedAt : null)} />
              <Cell label="AI frames" value={String(ctx?.aiDetections?.length ?? 0)} />
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function Cell({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="font-mono text-[9px] tracking-widest text-stone-400 uppercase">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono text-xs font-bold", warn ? "text-red-700" : "text-stone-800")}>
        {value || "—"}
      </p>
    </div>
  );
}
