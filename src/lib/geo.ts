export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000; // Earth radius (m)

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLengthMeters(route: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += haversineMeters(route[i - 1], route[i]);
  return total;
}

function pointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  // Approximate with equirectangular projection (fine for <10km segments)
  const toXY = (g: LatLng) => {
    const x = (g.lng * Math.PI) / 180;
    const y = (g.lat * Math.PI) / 180;
    const avgLat = ((a.lat + b.lat) / 2 / 2) * (Math.PI / 180);
    return { x: x * R * Math.cos(avgLat), y: y * R };
  };
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return Math.hypot(P.x - cx, P.y - cy);
}

export function distanceToRouteMeters(p: LatLng, route: LatLng[]): number {
  if (!route.length) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return haversineMeters(p, route[0]);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < route.length; i++) {
    min = Math.min(min, pointToSegmentMeters(p, route[i - 1], route[i]));
  }
  return min;
}

/** Distance travelled along the route up to the closest point to `p`. */
export function progressAlongRouteMeters(p: LatLng, route: LatLng[]): number {
  if (route.length < 2) return 0;
  let travelled = 0;
  let best = Number.POSITIVE_INFINITY;
  let bestTravelled = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = routeLengthMeters([route[i - 1], route[i]]);
    const d = pointToSegmentMeters(p, route[i - 1], route[i]);
    const endDist = haversineMeters(p, route[i]);
    if (d < best) {
      best = d;
      // fraction along segment from projection
      bestTravelled = travelled + Math.min(endDist, seg);
    }
    travelled += seg;
  }
  return bestTravelled;
}
