import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

export function useSupervisorContext() {
  return useQuery(api.workers.supervisorOverview);
}
