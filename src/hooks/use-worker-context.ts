import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

export type WorkerContext = NonNullable<
  ReturnType<typeof useWorkerContext>
>;

export function useWorkerContext() {
  return useQuery(api.workers.currentWorkerContext);
}
