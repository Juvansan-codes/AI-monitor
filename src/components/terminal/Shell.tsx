import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { AIModeBadge } from "./badges";
import { clearBackendSession, type AIMode } from "@/lib/services";

export interface ShellNavItem {
  to: string;
  label: string;
  end?: boolean;
}

interface ShellProps {
  roleLabel: string;
  workerTag?: string;
  nav: ShellNavItem[];
  aiMode?: AIMode;
  children: ReactNode;
  maxWidth?: string;
}

export function Shell({
  roleLabel,
  workerTag,
  nav,
  aiMode,
  children,
  maxWidth = "max-w-7xl",
}: ShellProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    clearBackendSession(); // drop the FastAPI backend JWT too
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-stone-300 bg-[#f7f6f1]/95 backdrop-blur">
        <div className={cn("mx-auto flex h-12 items-center gap-3 px-4", maxWidth)}>
          <NavLink to="/" className="flex shrink-0 items-center gap-2 font-mono">
            <span className="flex size-6 items-center justify-center rounded-sm bg-emerald-700 text-[10px] font-bold text-white">
              ◆
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">
              AMSQ<span className="text-emerald-700">://</span>
              <span className="font-medium text-stone-500">{roleLabel}</span>
            </span>
          </NavLink>

          <nav className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-sm px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider uppercase transition-colors",
                    isActive
                      ? "bg-emerald-700/10 text-emerald-900 ring-1 ring-emerald-700/30"
                      : "text-stone-500 hover:bg-stone-200/70 hover:text-stone-800",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {workerTag && (
              <span className="hidden rounded-sm bg-stone-200/80 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-stone-600 sm:inline">
                {workerTag}
              </span>
            )}
            {aiMode && <AIModeBadge mode={aiMode} className="hidden md:inline-flex" />}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-sm text-stone-500 hover:text-red-700"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className={cn("mx-auto px-4 py-5 sm:px-6", maxWidth)}>{children}</main>
    </div>
  );
}
