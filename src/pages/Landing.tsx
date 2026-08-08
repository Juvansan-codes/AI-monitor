import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  ClipboardCheck,
  Gauge,
  HardHat,
  MapPin,
  Radar,
  Route,
  ShieldCheck,
  TriangleAlert,
  Video,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

const FLOW = [
  "COMPANY",
  "PPE CHECK",
  "START JOURNEY",
  "GPS TRACKING",
  "ROUTE VERIFY",
  "ARRIVE",
  "WORKSITE CHECK",
  "START MAINTENANCE",
  "CAMERA MONITOR",
  "AI DETECTION",
  "SOP VERIFY",
  "WARNING?",
  "JOB COMPLETE",
  "QUALITY SCORE",
  "CLOUD REPORT",
];

const FEATURES = [
  {
    icon: HardHat,
    title: "PPE verification",
    body: "Pre-departure and worksite PPE checks with per-item detection (helmet, gloves, shoes, uniform, vest) through a swappable AI service.",
  },
  {
    icon: MapPin,
    title: "Live GPS tracking",
    body: "Browser geolocation feeds the assigned-route monitor. ETA, distance remaining and ON_ROUTE / DEVIATED / ARRIVED status.",
  },
  {
    icon: Route,
    title: "Assigned-route monitoring",
    body: "Planned route vs actual track. Deviations are recorded factually — never automatically treated as misconduct.",
  },
  {
    icon: Radar,
    title: "AI maintenance monitoring",
    body: "Camera frames analyzed for technicians, tools and equipment. Architecture ready for a real YOLO/OpenCV backend.",
  },
  {
    icon: ClipboardCheck,
    title: "SOP step verification",
    body: "Every step compared against the assigned SOP from the database: completed, current, pending, skipped, incorrect.",
  },
  {
    icon: TriangleAlert,
    title: "Real-time warnings",
    body: "PPE missing, wrong step, skipped step, wrong tool and route deviations raise severity-tagged alerts to worker and supervisor.",
  },
  {
    icon: Gauge,
    title: "Quality & compliance scoring",
    body: "PPE, SOP, sequence, tool, safety and route compliance rolled into one configurable 0–100 job score.",
  },
  {
    icon: Camera,
    title: "Cloud reports",
    body: "Job completion reports with every violation timestamped, exportable — plus a storage abstraction for videos and frames.",
  },
];

const WORKER_FEATURES = [
  "View assigned job & worksite",
  "Browser camera PPE checks",
  "Live GPS journey tracking",
  "Worksite safety gate",
  "SOP-guided maintenance monitor",
  "Real-time warnings",
  "One-tap job completion",
];

const SUPERVISOR_FEATURES = [
  "Live worker command center",
  "All workers on one map",
  "Journey & PPE status",
  "Active maintenance sessions",
  "AI alert stream",
  "Compliance scores",
  "SOP management & reports",
];

function FlowRow() {
  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
      {FLOW.map((step, i) => (
        <div key={step} className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-sm border px-2 py-1 font-mono text-[10px] tracking-wide ${
              step === "WARNING?"
                ? "border-amber-600/50 bg-amber-50 text-amber-900"
                : "border-emerald-800/30 bg-white text-stone-700"
            }`}
          >
            {step}
          </span>
          {i < FLOW.length - 1 && <span className="font-mono text-stone-400">›</span>}
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-stone-300 bg-[#f7f6f1]/95">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-mono">
            <span className="flex size-7 items-center justify-center rounded-sm bg-emerald-700 font-bold text-white">
              ◆
            </span>
            <span className="text-sm font-bold text-stone-900">
              AMSQ<span className="text-emerald-700">://</span>
              <span className="font-medium text-stone-500">ai-maintenance</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden rounded-sm font-mono text-[10px] tracking-widest text-stone-500 sm:inline-flex">
              v1.0 · FIELD TRIAL BUILD
            </Badge>
            <Button asChild size="sm" className="rounded-sm font-mono text-[11px]">
              <Link to="/auth">SIGN IN →</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="term-grid border-b border-stone-300">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-mono text-xs text-emerald-800"
          >
            <span className="text-stone-400">$</span> amsq --deploy maintenance-safety
            <span className="text-stone-400"> — system online</span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-4 max-w-3xl font-mono text-4xl leading-tight font-bold tracking-tight text-stone-900 sm:text-5xl"
          >
            AI MAINTENANCE SAFETY <span className="text-emerald-700">&amp;</span>{" "}
            QUALITY MONITOR
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-stone-600"
          >
            Monitor every maintenance worker from the company gate to the
            worksite and through every SOP step — camera-based PPE and activity
            verification, live GPS route tracking, real-time deviation warnings
            and a final compliance score, all archived to the cloud.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg" className="gap-2 rounded-sm font-mono text-xs">
              <Link to="/auth">
                <HardHat className="size-4" /> WORKER CONSOLE
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 rounded-sm font-mono text-xs">
              <Link to="/auth">
                <Radar className="size-4" /> SUPERVISOR COMMAND CENTER
              </Link>
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-10"
          >
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-stone-400 uppercase">
              job lifecycle pipeline
            </p>
            <FlowRow />
          </motion.div>
        </div>
      </section>

      {/* Architecture strip */}
      <section className="border-b border-stone-300 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-1.5 font-mono text-[10px]">
              {[
                "CAMERA",
                "FRONTEND",
                "BACKEND API",
                "AI SERVICE",
                "SOP ENGINE",
                "ALERT ENGINE",
                "DATABASE",
                "FRONTEND",
              ].map((node, i) => (
                <div key={node} className="flex items-center gap-1.5">
                  <span className="rounded-sm border border-stone-300 bg-stone-50 px-2.5 py-1.5 font-bold tracking-wider text-stone-700">
                    {node}
                  </span>
                  {i < 7 && <span className="text-emerald-700">→</span>}
                </div>
              ))}
              <Badge variant="outline" className="ml-3 rounded-sm border-amber-700/40 bg-amber-50 font-mono text-[9px] tracking-widest text-amber-900">
                YOLO / OPENCV BACKEND PLUGS IN HERE
              </Badge>
            </div>
          </div>
          <p className="mt-3 max-w-3xl font-mono text-[11px] leading-relaxed text-stone-500">
            AI services (PPE detection, object detection, action recognition,
            SOP verification, route verification) are isolated interfaces. A
            Python FastAPI + YOLO backend can be connected later via{" "}
            <code className="rounded-sm bg-stone-100 px-1 text-emerald-800">VITE_AI_API_URL</code>{" "}
            without touching the UI. Until then the UI reports "service not
            connected" — it never fakes real AI results.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-stone-300">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-mono text-xl font-bold text-stone-900">
            <span className="text-emerald-700">▌</span> CAPABILITIES
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-md border border-stone-300 bg-card p-4 transition-colors hover:border-emerald-800/40 hover:shadow-sm"
              >
                <f.icon className="size-4 text-emerald-700" />
                <h3 className="mt-2.5 font-mono text-xs font-bold tracking-wide text-stone-900 uppercase">
                  {f.title}
                </h3>
                <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-stone-600">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="border-b border-stone-300 bg-white/50">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 md:grid-cols-2">
          <div className="rounded-md border border-emerald-800/30 bg-card p-6">
            <div className="flex items-center gap-2">
              <HardHat className="size-4 text-emerald-700" />
              <h3 className="font-mono text-sm font-bold tracking-wide text-stone-900 uppercase">
                Worker console
              </h3>
            </div>
            <p className="mt-2 font-mono text-[11px] text-stone-500">
              Mobile-first field interface.
            </p>
            <ul className="mt-4 space-y-1.5 font-mono text-xs text-stone-700">
              {WORKER_FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-emerald-700">▸</span> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-stone-300 bg-card p-6">
            <div className="flex items-center gap-2">
              <Radar className="size-4 text-stone-800" />
              <h3 className="font-mono text-sm font-bold tracking-wide text-stone-900 uppercase">
                Supervisor command center
              </h3>
            </div>
            <p className="mt-2 font-mono text-[11px] text-stone-500">
              Desktop-first live overview.
            </p>
            <ul className="mt-4 space-y-1.5 font-mono text-xs text-stone-700">
              {SUPERVISOR_FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-stone-500">▸</span> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="border-b border-stone-300">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col gap-4 rounded-md border border-stone-300 bg-card p-6 sm:flex-row sm:items-start">
            <ShieldCheck className="size-6 shrink-0 text-emerald-700" />
            <div>
              <h3 className="font-mono text-sm font-bold tracking-wide text-stone-900 uppercase">
                Privacy by design
              </h3>
              <p className="mt-2 max-w-3xl font-mono text-xs leading-relaxed text-stone-600">
                No facial recognition. Workers are identified by anonymous
                Worker ID (e.g. <span className="text-emerald-800">W102</span>),
                never by face. Camera frames are processed only for PPE, tool
                and maintenance-action verification. GPS is used solely to
                track the assigned job route. Camera and location features
                require a secure (HTTPS) context and explicit browser
                permission.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="term-grid">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center">
          <p className="font-mono text-xs text-stone-500">
            <span className="text-emerald-800">$</span> ready — open the console
          </p>
          <h2 className="mt-3 font-mono text-2xl font-bold text-stone-900">
            DEPLOY THE MONITOR
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-2 rounded-sm font-mono text-xs">
              <Link to="/auth">
                <Video className="size-4" /> SIGN IN AS WORKER
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2 rounded-sm font-mono text-xs">
              <Link to="/auth">
                <Radar className="size-4" /> SIGN IN AS SUPERVISOR
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-300 bg-[#f7f6f1]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 font-mono text-[10px] text-stone-500 sm:flex-row">
          <span>
            AMSQ<span className="text-emerald-700">://</span>ai-maintenance ·
            field trial build
          </span>
          <span>no facial recognition · worker IDs are anonymous</span>
        </div>
      </footer>
    </div>
  );
}
