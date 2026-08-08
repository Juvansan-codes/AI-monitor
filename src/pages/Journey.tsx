import { Button } from "@/components/ui/button";
import { PrivacyNotice } from "@/components/terminal/PrivacyNotice";
import { DemoTag, StatusBadge } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { RoutePlotter } from "@/components/terminal/RoutePlotter";
import { Shell } from "@/components/terminal/Shell";
import { StatCard } from "@/components/terminal/StatCard";
import { useAIMode } from "@/hooks/use-ai-mode";
import { useWorkerContext } from "@/hooks/use-worker-context";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, CloudOff, Crosshair, MapPin, Satellite } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { RouteVerificationService, type RouteStatus } from "@/lib/services";
import type { LatLng } from "@/lib/geo";
import { enqueueOffline, useOfflineSync } from "@/lib/offline";
import { fmtMeters } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";

interface CachedPoint {
  jobId: Id<"jobs">;
  workerId: Id<"workers">;
  lat: number;
  lng: number;
  timestamp: number;
}

export default function Journey() {
  const ctx = useWorkerContext();
  const { mode } = useAIMode();
  const navigate = useNavigate();
  const reportLocation = useMutation(api.locations.report);
  const reportBatch = useMutation(api.locations.reportBatch);
  const setStage = useMutation(api.jobs.setStage);
  const createAlert = useMutation(api.alerts.create);

  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const deviationAlerted = useRef(false);
  const lastReportRef = useRef(0);

  const job = ctx?.job ?? null;
  const worker = ctx?.worker ?? null;
  const locations = useMemo(
    () => (ctx?.locations ?? []).slice().reverse(), // asc by time
    [ctx?.locations],
  );

  const actualPath = useMemo(
    () =>
      locations.map((l) => ({ lat: l.lat, lng: l.lng })),
    [locations],
  );

  const currentPos: LatLng | null =
    position ?? (job?.currentLat != null && job.currentLng != null ? { lat: job.currentLat, lng: job.currentLng } : null);

  const verdict = useMemo(() => {
    if (!job || !currentPos) return null;
    return RouteVerificationService.verify({
      route: job.plannedRoute.map(([lat, lng]) => ({ lat, lng })),
      current: currentPos,
      destination: { lat: job.destinationLat, lng: job.destinationLng },
    });
  }, [job, currentPos]);

  const { pending, flushNow } = useOfflineSync<CachedPoint>(
    "gps",
    useCallback(async (points) => {
      await reportBatch({
        points: points.map((p) => ({
          jobId: p.jobId,
          workerId: p.workerId,
          lat: p.lat,
          lng: p.lng,
          timestamp: p.timestamp,
          source: "offline-cache",
        })),
      });
    }, [reportBatch]),
    !!job,
  );

  const pushPoint = useCallback(
    async (lat: number, lng: number) => {
      if (!job || !worker) return;
      const now = Date.now();
      if (now - lastReportRef.current < 8000) return; // max ~1 point / 8s
      lastReportRef.current = now;
      try {
        await reportLocation({
          jobId: job._id,
          workerId: worker._id,
          lat,
          lng,
          source: "gps",
          timestamp: now,
        });
      } catch {
        // Offline: cache locally and sync when connectivity returns.
        enqueueOffline<CachedPoint>("gps", {
          jobId: job._id,
          workerId: worker._id,
          lat,
          lng,
          timestamp: now,
        });
      }
    },
    [job, worker, reportLocation],
  );

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation API unavailable. A secure (HTTPS) context is required.");
      return;
    }
    setWatching(true);
    setGpsError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        void pushPoint(latitude, longitude);
      },
      (err) => {
        const map: Record<number, string> = {
          1: "Permission denied for location access.",
          2: "Position unavailable right now.",
          3: "Location request timed out.",
        };
        setGpsError(map[err.code] ?? err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [pushPoint]);

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  // Factual low-severity deviation note — never treated as misconduct.
  useEffect(() => {
    if (!verdict || !job || !worker) return;
    if (verdict.status === "DEVIATED" && !deviationAlerted.current) {
      deviationAlerted.current = true;
      createAlert({
        jobId: job._id,
        workerId: worker._id,
        type: "ROUTE_DEVIATION",
        severity: "LOW",
        message: `Position ${Math.round(verdict.distanceToRouteM)} m from the planned route. Deviation recorded; not classified as a safety violation.`,
      }).catch(() => {});
    }
    if (verdict.status !== "DEVIATED" && deviationAlerted.current) {
      deviationAlerted.current = false;
    }
  }, [verdict, job, worker, createAlert]);

  const arrived = async () => {
    if (!job) return;
    await setStage({ jobId: job._id, to: "ARRIVED" });
    toast.success("Arrival confirmed at worksite.");
    navigate("/worker/worksite");
  };

  const nav = [
    { to: "/worker", label: "Dashboard", end: true },
    { to: "/worker/ppe", label: "PPE" },
    { to: "/worker/journey", label: "Journey" },
    { to: "/worker/worksite", label: "Worksite" },
    { to: "/worker/monitor", label: "Monitor" },
  ];

  if (!ctx || !job) {
    return (
      <Shell roleLabel="worker" nav={nav} aiMode={mode}>
        <Skeleton className="h-64 rounded-md" />
      </Shell>
    );
  }

  const routeStatus: RouteStatus = verdict?.status ?? "ON_ROUTE";
  const statusTone =
    routeStatus === "ON_ROUTE" ? "ok" : routeStatus === "ARRIVED" ? "ok" : "warn";

  return (
    <Shell roleLabel="worker" workerTag={worker?.workerId} nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> JOURNEY TRACKING
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            {job.jobNumber} · {job.destinationAddress}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.isDemo && <DemoTag />}
          <StatusBadge tone={statusTone}>{routeStatus}</StatusBadge>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Route status"
          value={routeStatus}
          sub={verdict?.message}
          tone={statusTone}
        />
        <StatCard
          label="Distance remaining"
          value={verdict ? fmtMeters(verdict.remainingMeters) : "—"}
          sub={verdict ? `to worksite` : "no position fix"}
          tone="info"
        />
        <StatCard
          label="ETA"
          value={verdict ? `${verdict.etaMinutes} min` : "—"}
          sub="at 40 km/h avg"
          tone="info"
        />
        <StatCard
          label="Route progress"
          value={verdict ? `${verdict.progressPct}%` : "—"}
          sub={verdict ? `off-route ${fmtMeters(verdict.distanceToRouteM)}` : ""}
          tone={verdict && verdict.progressPct >= 100 ? "ok" : "info"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Route plot"
          right={
            <span className="font-mono text-[10px] text-stone-400">
              {watching ? "GPS: LIVE" : "GPS: OFF"}
            </span>
          }
        >
          <div className="p-3">
            <div className="aspect-[480/340] w-full overflow-hidden rounded-md border border-stone-300">
              <RoutePlotter
                route={job.plannedRoute.map(([lat, lng]) => ({ lat, lng }))}
                company={{ lat: job.companyLat, lng: job.companyLng }}
                destination={{ lat: job.destinationLat, lng: job.destinationLng }}
                current={currentPos}
                actual={actualPath}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {watching ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-sm font-mono text-[11px]"
                    onClick={() => {
                      if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                      }
                      setWatching(false);
                    }}
                  >
                    <Satellite className="size-3.5" /> STOP TRACKING
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-sm font-mono text-[11px]"
                    onClick={startWatching}
                  >
                    <Crosshair className="size-3.5" /> START GPS TRACKING
                  </Button>
                )}
                {pending > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-sm font-mono text-[11px] text-amber-800"
                    onClick={() => void flushNow()}
                  >
                    <CloudOff className="size-3.5" /> SYNC {pending} CACHED POINT{pending > 1 ? "S" : ""}
                  </Button>
                )}
              </div>
              <span className="font-mono text-[10px] text-stone-400">
                {positionsLabel(actualPath.length)} points recorded
              </span>
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          {gpsError && (
            <div className="rounded-md border border-amber-700/40 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-900">
              GPS: {gpsError} Position history below is the recorded track.
            </div>
          )}
          <Panel title="Arrival">
            <div className="p-4 font-mono text-xs text-stone-600">
              <p className="flex items-start gap-2 text-stone-500">
                <MapPin className="mt-0.5 size-4 shrink-0 text-sky-800" />
                <span>
                  Worksite: <span className="text-stone-800">{job.destinationAddress}</span>
                  <br />
                  <span className="text-[10px]">{job.destinationLat.toFixed(5)}, {job.destinationLng.toFixed(5)}</span>
                </span>
              </p>
              {verdict?.status === "DEVIATED" && (
                <p className="mt-2 rounded-sm border border-amber-700/40 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  Deviation recorded for the supervisor — no penalty is applied
                  automatically.
                </p>
              )}
              <Button
                className="mt-3 w-full gap-2 rounded-sm font-mono text-xs"
                onClick={arrived}
                disabled={job.status === "ARRIVED" || job.status === "WORKSITE_CHECK" || job.status === "WORKING" || job.status === "WARNING" || job.status === "COMPLETED"}
              >
                I HAVE ARRIVED AT WORKSITE <ArrowRight className="size-4" />
              </Button>
              {(job.status === "ARRIVED" || job.status === "WORKSITE_CHECK") && (
                <Button
                  className="mt-2 w-full gap-2 rounded-sm bg-sky-800 font-mono text-xs hover:bg-sky-900"
                  onClick={() => navigate("/worker/worksite")}
                >
                  PROCEED TO WORKSITE CHECK <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </Panel>
          <PrivacyNotice variant="location" />
          <Panel title="Recorded track" right={
            <span className="font-mono text-[10px] text-stone-400">{locations.length} pts</span>
          }>
            <ul className="max-h-56 divide-y divide-stone-200/70 overflow-y-auto font-mono">
              {locations.slice(-12).reverse().map((l) => (
                <li key={l._id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                  <span className="text-stone-600">
                    {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                  </span>
                  <span className="text-stone-400">
                    {l.source === "offline-cache" ? "cached" : l.source} · {new Date(l.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
              {locations.length === 0 && (
                <li className="px-3 py-4 text-center text-stone-500">no GPS points yet</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function positionsLabel(n: number): string {
  return `${n} gps`;
}
