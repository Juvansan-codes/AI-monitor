import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import { getBackendSession } from "@/lib/services";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";

const HOME: Record<string, string> = {
  worker: "/worker",
  supervisor: "/supervisor",
};

/**
 * Ensures the user profile carries the requested role (auto-attaching the
 * role selected at login) and redirects mismatched roles to their home.
 *
 * When a FastAPI backend JWT session exists (POST /api/auth/login) that JWT is
 * authoritative for role gating: supervisors land on /supervisor, workers on
 * /worker, without needing a Convex profile.
 */
export function RequireRole({
  role,
  children,
}: {
  role: "worker" | "supervisor";
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const me = useQuery(api.workers.me);
  const ensureProfile = useMutation(api.workers.ensureProfile);
  const navigate = useNavigate();
  const [ensuring, setEnsuring] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (isLoading || !user || user.role || ensuring || started.current) return;
    started.current = true;
    setEnsuring(true);
    const stored =
      typeof window !== "undefined" &&
      window.localStorage.getItem("amsq-role") === "supervisor"
        ? "supervisor"
        : "worker";
    ensureProfile({ role: stored })
      .then((home) => {
        if (home && home !== HOME[role]) navigate(home, { replace: true });
      })
      .catch(() => {})
      .finally(() => setEnsuring(false));
  }, [isLoading, user, ensuring, ensureProfile, navigate, role]);

  // All hooks are above; conditional returns are safe from here on.
  const backend = getBackendSession();
  if (backend) {
    if (backend.user.role !== role) {
      return <Navigate to={HOME[backend.user.role]} replace />;
    }
    return children;
  }

  if (isLoading || (user && !user.role) || me === undefined || ensuring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!me || me.role !== role) {
    return <Navigate to={me?.role ? HOME[me.role] : "/auth"} replace />;
  }

  return children;
}
