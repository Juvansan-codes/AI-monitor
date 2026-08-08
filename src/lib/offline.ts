import { useEffect, useState } from "react";

const PREFIX = "amsq.offline.";

export function enqueueOffline<T>(key: string, item: T): number {
  const items = readQueue<T>(key);
  items.push(item);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(items));
  } catch {
    // storage full or unavailable — drop oldest entry and retry once
    items.shift();
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(items));
    } catch {
      /* give up silently */
    }
  }
  return items.length;
}

export function readQueue<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function clearQueue(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

export function queuedCount(key: string): number {
  return readQueue<unknown>(key).length;
}

/**
 * Synchronize a per-key offline queue whenever the browser regains
 * connectivity. `send` must be idempotent (Convex mutations are).
 */
export function useOfflineSync<T>(
  key: string,
  send: (items: T[]) => Promise<void>,
  enabled: boolean,
): { pending: number; flushNow: () => Promise<void> } {
  const [pending, setPending] = useState(() => queuedCount(key));

  const flush = async () => {
    const items = readQueue<T>(key);
    if (items.length === 0) return;
    try {
      await send(items);
      clearQueue(key);
      setPending(0);
    } catch {
      // keep queue for the next reconnect
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, send]);

  useEffect(() => {
    setPending(queuedCount(key));
  }, [key]);

  return { pending, flushNow: flush };
}
