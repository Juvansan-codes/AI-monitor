import { useMemo } from "react";
import type { LatLng } from "@/lib/geo";
import { TONE_BG, type Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface PlotMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone?: Tone;
  onClick?: () => void;
}

interface RoutePlotterProps {
  route: LatLng[];
  company?: LatLng;
  destination?: LatLng;
  current?: LatLng | null;
  actual?: LatLng[];
  markers?: PlotMarker[];
  className?: string;
}

const W = 480;
const H = 340;
const PAD = 36;

/** Vector plot of the assigned route. Deterministic, no network tiles. */
export function RoutePlotter({
  route,
  company,
  destination,
  current,
  actual = [],
  markers = [],
  className,
}: RoutePlotterProps) {
  const view = useMemo(() => {
    const pts: LatLng[] = [...route, ...actual];
    if (company) pts.push(company);
    if (destination) pts.push(destination);
    if (current) pts.push(current);
    for (const m of markers) pts.push({ lat: m.lat, lng: m.lng });
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    if (maxLat - minLat < 0.001) {
      minLat -= 0.0005;
      maxLat += 0.0005;
    }
    if (maxLng - minLng < 0.001) {
      minLng -= 0.0005;
      maxLng += 0.0005;
    }
    const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const cosLat = Math.cos(midLat) || 1;

    const toX = (lng: number) => ((lng - minLng) * cosLat * (W - PAD * 2)) / ((maxLng - minLng) * cosLat || 1) + PAD;
    const toY = (lat: number) => H - PAD - ((lat - minLat) * (H - PAD * 2)) / (maxLat - minLat || 1);
    const p = (g: LatLng) => ({ x: toX(g.lng), y: toY(g.lat) });

    const routePts = route.map(p);
    const actualPts = actual.map(p);
    const grids: { x: number; y: number; vertical: boolean }[] = [];
    for (let x = PAD; x <= W - PAD; x += 24) grids.push({ x, y: 0, vertical: true });
    for (let y = PAD; y <= H - PAD; y += 24) grids.push({ x: 0, y, vertical: false });

    return {
      routePts,
      actualPts,
      companyP: company ? p(company) : null,
      destP: destination ? p(destination) : null,
      currentP: current ? p(current) : null,
      markers: markers.map((m) => ({ ...m, pos: p({ lat: m.lat, lng: m.lng }) })),
      grids,
      routePath: routePts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" "),
      actualPath: actualPts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" "),
    };
  }, [route, company, destination, current, actual, markers]);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="size-full" role="img" aria-label="Route plot">
        <rect x="0" y="0" width={W} height={H} fill="#fbfaf6" />
        {view.grids.map((g, i) => (
          <line
            key={i}
            x1={g.vertical ? g.x : 0}
            y1={g.vertical ? 0 : g.y}
            x2={g.vertical ? g.x : W}
            y2={g.vertical ? H : g.y}
            stroke="#e7e4d8"
            strokeWidth="0.5"
          />
        ))}
        <line x1={PAD / 2} y1={H - PAD / 2} x2={W - PAD / 2} y2={H - PAD / 2} stroke="#d6d2c2" strokeWidth="1" />
        <line x1={PAD / 2} y1={PAD / 2} x2={PAD / 2} y2={H - PAD / 2} stroke="#d6d2c2" strokeWidth="1" />

        {view.actualPath && (
          <path d={view.actualPath} fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="6 4" />
        )}
        {view.routePts.length > 1 && (
          <path d={view.routePath} fill="none" stroke="#1a7f37" strokeWidth="2" strokeLinejoin="round" strokeDasharray="10 5" />
        )}

        {/* planned route waypoints */}
        {view.routePts.map((pt, i) => (
          <circle key={`r${i}`} cx={pt.x} cy={pt.y} r="2.5" fill="#ffffff" stroke="#1a7f37" strokeWidth="1.5" />
        ))}

        {/* company marker */}
        {view.companyP && (
          <g>
            <rect x={view.companyP.x - 6} y={view.companyP.y - 6} width="12" height="12" fill="#f6f5f0" stroke="#23241f" strokeWidth="2" />
            <text x={view.companyP.x} y={view.companyP.y - 11} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#44463c">COMPANY</text>
          </g>
        )}

        {/* destination marker */}
        {view.destP && (
          <g>
            <path d={`M${view.destP.x - 7},${view.destP.y - 7} L${view.destP.x + 7},${view.destP.y + 7} M${view.destP.x + 7},${view.destP.y - 7} L${view.destP.x - 7},${view.destP.y + 7}`} stroke="#0e7490" strokeWidth="2.5" />
            <circle cx={view.destP.x} cy={view.destP.y} r="3" fill="#0e7490" />
            <text x={view.destP.x} y={view.destP.y - 12} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#155e75">WORKSITE</text>
          </g>
        )}

        {/* worker current */}
        {view.currentP && (
          <g>
            <circle cx={view.currentP.x} cy={view.currentP.y} r="10" fill="#f59e0b" opacity="0.25">
              <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={view.currentP.x} cy={view.currentP.y} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
            <text x={view.currentP.x} y={view.currentP.y - 13} textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#92400e">WORKER</text>
          </g>
        )}

        {/* extra markers (other workers) */}
        {view.markers.map((m) => (
          <g key={m.id} onClick={m.onClick} className={m.onClick ? "cursor-pointer" : undefined}>
            <circle cx={m.pos.x} cy={m.pos.y} r="5.5" fill={TONE_BG[m.tone ?? "neutral"]} stroke="#fff" strokeWidth="1.5" />
            <text x={m.pos.x} y={m.pos.y - 9} textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill="#44463c">{m.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
