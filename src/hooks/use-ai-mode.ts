import { useCallback, useState } from "react";
import { getAIMode, setDemoMode, type AIMode } from "@/lib/services";

export function useAIMode() {
  const [mode, setMode] = useState<AIMode>(() => getAIMode());

  const setDemoEnabled = useCallback((on: boolean) => {
    setDemoMode(on);
    setMode(getAIMode());
  }, []);

  return {
    mode,
    demoEnabled: mode === "demo",
    connected: mode === "production",
    setDemoEnabled,
  };
}
