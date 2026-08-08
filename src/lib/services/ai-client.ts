import type { AIMode } from "./types";

/**
 * Base URL of the Python FastAPI AI backend (set VITE_AI_API_URL).
 * When absent, the AI layer reports SERVICE_NOT_CONNECTED — the UI must
 * show "AI ... service not connected" rather than fake results.
 */
export const AI_API_URL: string | null = (
  import.meta.env.VITE_AI_API_URL as string | undefined
)?.replace(/\/+$/, "") || null;

const MODE_KEY = "amsq.ai-mode";

/** Resolve which AI implementation is active. */
export function getAIMode(): AIMode {
  if (AI_API_URL) return "production";
  try {
    if (localStorage.getItem(MODE_KEY) === "on") return "demo";
  } catch {
    /* ignore */
  }
  return "unavailable";
}

export function setDemoMode(on: boolean): void {
  try {
    localStorage.setItem(MODE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

export interface ApiError {
  code: string;
  message: string;
}

/** Uniform response envelope mirroring the FastAPI backend. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  mode: AIMode;
}

/** Attach the stored backend JWT as a bearer token when present. */
function authHeaders(): Record<string, string> {
  const session = getBackendSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

export async function aiPost<T>(
  path: string,
  body: FormData | Record<string, unknown>,
): Promise<ApiResponse<T>> {
  if (!AI_API_URL) {
    return {
      success: false,
      data: null,
      error: {
        code: "SERVICE_NOT_CONNECTED",
        message: "AI backend not configured (set VITE_AI_API_URL).",
      },
      mode: "unavailable",
    };
  }
  try {
    const res = await fetch(`${AI_API_URL}${path}`, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData
        ? authHeaders()
        : { "Content-Type": "application/json", ...authHeaders() },
    });
    const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse<T>>;
    return { success: json.success ?? res.ok, data: json.data ?? null, error: json.error ?? null, mode: "production" };
  } catch (e) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: e instanceof Error ? e.message : "AI backend unreachable" },
      mode: "production",
    };
  }
}

export async function aiGet<T>(path: string): Promise<ApiResponse<T>> {
  if (!AI_API_URL) {
    return {
      success: false,
      data: null,
      error: { code: "SERVICE_NOT_CONNECTED", message: "AI backend not configured (set VITE_AI_API_URL)." },
      mode: "unavailable",
    };
  }
  try {
    const res = await fetch(`${AI_API_URL}${path}`, { headers: authHeaders() });
    const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse<T>>;
    return { success: json.success ?? res.ok, data: json.data ?? null, error: json.error ?? null, mode: "production" };
  } catch (e) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: e instanceof Error ? e.message : "AI backend unreachable" },
      mode: "production",
    };
  }
}

// ---------------------------------------------------------------------------
// Backend JWT session (POST /api/auth/login on the FastAPI backend).
// ---------------------------------------------------------------------------

const TOKEN_KEY = "amsq-ai-token";
const USER_KEY = "amsq-ai-user";

/** User payload returned by the FastAPI auth endpoints. */
export interface BackendUser {
  id: number;
  email: string;
  name?: string | null;
  role: "worker" | "supervisor";
  worker_id?: string | null;
  supervisor_id?: string | null;
}

/** Returns the stored backend JWT session, or null when signed out. */
export function getBackendSession(): { token: string; user: BackendUser } | null {
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const raw = window.localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    return { token, user: JSON.parse(raw) as BackendUser };
  } catch {
    return null;
  }
}

/** Remove the stored backend JWT session (sign out). */
export function clearBackendSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Sign in against the FastAPI backend (POST /api/auth/login) and persist the
 * returned JWT. Demo accounts: worker@demo.com / worker123,
 * supervisor@demo.com / super123.
 */
export async function loginWithBackend(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; user?: BackendUser }> {
  if (!AI_API_URL) {
    return {
      ok: false,
      error: "AI backend not configured (set VITE_AI_API_URL).",
    };
  }
  try {
    const res = await fetch(`${AI_API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { token?: string; user?: BackendUser } | null;
      error?: { message?: string } | null;
    };
    if (!json.success || !json.data?.token || !json.data.user) {
      return { ok: false, error: json.error?.message ?? "Sign-in failed." };
    }
    const user = json.data.user;
    try {
      window.localStorage.setItem(TOKEN_KEY, json.data.token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    return { ok: true, user };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "AI backend unreachable.",
    };
  }
}

/**
 * Deterministic PRNG (FNV-1a) used ONLY to generate clearly-labeled
 * SIMULATED results in demo mode. Never used for real detections.
 */
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function humanizeCode(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A realtime alert frame pushed by the FastAPI backend (WS /ws/jobs/{jobId}). */
export interface JobAlertMessage {
  type: string;
  severity: string;
  message: string;
  expected?: string | null;
  detected?: string | null;
  sop_step?: number | null;
  timestamp?: string;
}

/**
 * Subscribe to the backend's realtime alert stream for a job.
 * Returns an unsubscribe function; fails silently when the backend is not
 * connected (the Convex alert feed remains the source of truth either way).
 */
export function subscribeToJobAlerts(
  jobId: string,
  onAlert: (msg: JobAlertMessage) => void,
): () => void {
  if (!AI_API_URL) return () => {};
  const base = AI_API_URL.replace(/^http/, "ws");
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(`${base}/ws/jobs/${encodeURIComponent(jobId)}`);
  } catch {
    return () => {};
  }
  const onMessage = (ev: MessageEvent) => {
    try {
      const data = JSON.parse(String(ev.data)) as JobAlertMessage;
      if (data && typeof data.message === "string") onAlert(data);
    } catch {
      /* ignore non-JSON frames */
    }
  };
  ws.addEventListener("message", onMessage);
  return () => {
    ws?.removeEventListener("message", onMessage);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}
