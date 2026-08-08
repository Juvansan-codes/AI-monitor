import {
  distanceToRouteMeters,
  haversineMeters,
  progressAlongRouteMeters,
  routeLengthMeters,
  type LatLng,
} from "@/lib/geo";

export type RouteStatus = "ON_ROUTE" | "DEVIATED" | "ARRIVED";

export interface RouteVerdict {
  status: RouteStatus;
  distanceToRouteM: number;
  distanceToDestinationM: number;
  remainingMeters: number;
  etaMinutes: number;
  progressPct: number;
  deviationThresholdM: number;
  message: string;
}

export interface RouteVerifyInput {
  route: LatLng[];
  current: LatLng;
  destination: LatLng;
  /** distance from the planned route that counts as a deviation */
  deviationThresholdM?: number;
  /** distance from destination that counts as ARRIVED */
  arrivedThresholdM?: number;
  avgSpeedKph?: number;
}

/**
 * Route verification. A deviation is reported factually (distance from the
 * planned route) — it is NOT automatically treated as a safety violation.
 */
export class RouteVerificationService {
  static verify(input: RouteVerifyInput): RouteVerdict {
    const deviationThresholdM = input.deviationThresholdM ?? 250;
    const arrivedThresholdM = input.arrivedThresholdM ?? 120;
    const avgSpeedKph = input.avgSpeedKph ?? 40;

    const distToDest = haversineMeters(input.current, input.destination);
    const distToRoute = distanceToRouteMeters(input.current, input.route);
    const remaining = Math.max(0, distToDest - arrivedThresholdM);
    const etaMinutes = remaining / 1000 / (avgSpeedKph / 60);
    const total = routeLengthMeters(input.route) || 1;
    const travelled = progressAlongRouteMeters(input.current, input.route);
    const progressPct = Math.min(100, Math.round((travelled / total) * 100));

    let status: RouteStatus;
    let message: string;
    if (distToDest <= arrivedThresholdM) {
      status = "ARRIVED";
      message = "Destination reached. Run the worksite safety check.";
    } else if (distToRoute > deviationThresholdM) {
      status = "DEVIATED";
      message = `Position is ${Math.round(distToRoute)} m from the planned route. Deviation recorded, not penalized automatically.`;
    } else {
      status = "ON_ROUTE";
      message = "Following the assigned route.";
    }

    return {
      status,
      distanceToRouteM: distToRoute,
      distanceToDestinationM: distToDest,
      remainingMeters: remaining,
      etaMinutes: Math.max(0, Math.round(etaMinutes)),
      progressPct,
      deviationThresholdM,
      message,
    };
  }
}
