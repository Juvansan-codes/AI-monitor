import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";

/** Seeds DEMO DATA on first app load so the supervisor view is never empty. */
export function useEnsureDemoData(): boolean | undefined {
  const status = useQuery(api.seed.seedStatus);
  const seed = useMutation(api.seed.seedDemoData);

  useEffect(() => {
    if (status && !status.seeded) {
      seed().catch((e) => console.warn("Demo seed failed:", e));
    }
  }, [status, seed]);

  return status?.seeded;
}
