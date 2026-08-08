import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import {
  AI_API_URL,
  getBackendSession,
  loginWithBackend,
  type BackendUser,
} from "@/lib/services";
import {
  ArrowRight,
  HardHat,
  KeyRound,
  Loader2,
  Mail,
  Radar,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { cn } from "@/lib/utils";

interface AuthProps {
  redirectAfterAuth?: string;
}

type RoleChoice = "worker" | "supervisor";

const ROLE_KEY = "amsq-role";

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function roleHome(role: RoleChoice): string {
  return role === "supervisor" ? "/supervisor" : "/worker";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<RoleChoice>(() => {
    if (typeof window === "undefined") return "worker";
    const stored = window.localStorage.getItem(ROLE_KEY);
    return stored === "supervisor" ? "supervisor" : "worker";
  });

  const pickRole = (r: RoleChoice) => {
    setRole(r);
    try {
      window.localStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  };

  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth ?? roleHome(role),
  );

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiEmail, setAiEmail] = useState("");
  const [aiPassword, setAiPassword] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const backendSession = getBackendSession();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Already holding a backend JWT (e.g. page refresh): go straight to the role
  // home — supervisors land on /supervisor, workers on /worker — still honoring
  // any intended returnTo destination.
  useEffect(() => {
    if (!authLoading && backendSession) {
      navigate(
        resolveRedirectAfterAuth(
          searchParams.get("returnTo"),
          roleHome(backendSession.user.role),
        ),
      );
    }
  }, [authLoading, backendSession, navigate, searchParams]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  };

  /** Sign in with the Python FastAPI backend (POST /api/auth/login). */
  const handleBackendLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await loginWithBackend(aiEmail, aiPassword);
      if (!result.ok || !result.user) {
        setAiError(result.error ?? "Backend sign-in failed.");
        return;
      }
      const backendUser: BackendUser = result.user;
      pickRole(backendUser.role); // keep amsq-role in sync with the JWT role
      // Establish the Convex workspace identity (best-effort) so the dashboard
      // context loads; the JWT itself is what gates the route either way.
      try {
        await signIn("anonymous");
      } catch {
        /* workspace profile is optional — JWT session still routes */
      }
      navigate(
        resolveRedirectAfterAuth(
          searchParams.get("returnTo"),
          roleHome(backendUser.role),
        ),
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="term-grid flex min-h-screen flex-col">
      <header className="border-b border-stone-300 bg-[#f7f6f1]/95">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-mono">
            <span className="flex size-7 items-center justify-center rounded-sm bg-emerald-700 font-bold text-white">
              ◆
            </span>
            <span className="text-sm font-bold text-stone-900">
              AMSQ<span className="text-emerald-700">://</span>
              <span className="font-medium text-stone-500">sign-in</span>
            </span>
          </Link>
          <span className="font-mono text-[10px] tracking-widest text-stone-500">
            SECURE CONTEXT REQUIRED FOR CAMERA / GPS
          </span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Card className="rounded-md border-stone-300 shadow-sm">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-mono text-lg font-bold tracking-tight">
                    FIELD CONSOLE ACCESS
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Select your role, then sign in with your employee email
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => pickRole("worker")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 font-mono text-xs transition-colors",
                        role === "worker"
                          ? "border-emerald-700/50 bg-emerald-700/10 text-emerald-900 ring-1 ring-emerald-700/40"
                          : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
                      )}
                    >
                      <HardHat className="size-4" />
                      <span className="font-bold tracking-widest uppercase">Worker</span>
                      <span className="text-[9px] text-stone-500">field console</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => pickRole("supervisor")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 font-mono text-xs transition-colors",
                        role === "supervisor"
                          ? "border-stone-700 bg-stone-800 text-stone-100 ring-1 ring-stone-700"
                          : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
                      )}
                    >
                      <Radar className="size-4" />
                      <span className="font-bold tracking-widest uppercase">Supervisor</span>
                      <span className="text-[9px] text-stone-500">command center</span>
                    </button>
                  </div>

                  <form onSubmit={handleEmailSubmit}>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute top-3 left-3 size-4 text-stone-400" />
                        <Input
                          name="email"
                          placeholder="employee@company.com"
                          type="email"
                          className="rounded-sm pl-9 font-mono text-sm"
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        className="rounded-sm"
                      >
                        {isLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                      </Button>
                    </div>
                    {error && <p className="mt-2 font-mono text-xs text-red-700">{error}</p>}
                  </form>

                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-stone-300" />
                    <span className="font-mono text-[10px] tracking-widest text-stone-400 uppercase">
                      or
                    </span>
                    <span className="h-px flex-1 bg-stone-300" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 rounded-sm font-mono text-xs"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <UserX className="size-4" />
                    Continue as {role === "supervisor" ? "supervisor" : "demo worker"}
                  </Button>
                  <p className="mt-2 text-center font-mono text-[10px] text-stone-400">
                    Guest access links you to a demo worker profile
                  </p>

                  <div className="mt-5 rounded-md border border-stone-300 bg-stone-50/70 p-3">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-widest text-stone-500 uppercase">
                      <KeyRound className="size-3.5" /> AI backend sign-in
                    </p>
                    {AI_API_URL ? (
                      <form onSubmit={handleBackendLogin} className="mt-2 space-y-2">
                        <Input
                          type="email"
                          placeholder="employee@company.com"
                          value={aiEmail}
                          onChange={(e) => setAiEmail(e.target.value)}
                          className="rounded-sm font-mono text-sm"
                          disabled={aiLoading}
                          autoComplete="username"
                          required
                        />
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="password"
                            value={aiPassword}
                            onChange={(e) => setAiPassword(e.target.value)}
                            className="rounded-sm font-mono text-sm"
                            disabled={aiLoading}
                            autoComplete="current-password"
                            required
                          />
                          <Button
                            type="submit"
                            className="shrink-0 rounded-sm font-mono text-xs"
                            disabled={aiLoading}
                          >
                            {aiLoading ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "SIGN IN"
                            )}
                          </Button>
                        </div>
                        {aiError && (
                          <p className="font-mono text-xs text-red-700">{aiError}</p>
                        )}
                        <p className="font-mono text-[10px] leading-relaxed text-stone-400">
                          JWT from the FastAPI backend. Demo:{' '}
                          <span className="text-stone-500">worker@demo.com / worker123</span> ·{' '}
                          <span className="text-stone-500">supervisor@demo.com / super123</span>
                        </p>
                      </form>
                    ) : (
                      <p className="mt-2 font-mono text-[10px] leading-relaxed text-stone-500">
                        Set <code className="rounded-sm bg-stone-200 px-1 text-emerald-800">VITE_AI_API_URL</code>{' '}
                        to sign in with the AI backend.
                      </p>
                    )}
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-mono text-lg font-bold">
                    CHECK YOUR EMAIL
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    A verification code was sent to {step.email}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent>
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                            (e.target as HTMLElement).closest("form")?.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-2 text-center font-mono text-xs text-red-700">
                        {error}
                      </p>
                    )}
                    <p className="mt-4 text-center font-mono text-xs text-stone-500">
                      Didn't receive a code?{" "}
                      <Button
                        variant="link"
                        className="h-auto p-0 font-mono text-xs"
                        onClick={() => setStep("signIn")}
                      >
                        Try again
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full rounded-sm font-mono text-xs"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" /> Verifying…
                        </>
                      ) : (
                        <>
                          Verify code <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}
          </Card>

          <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[10px] text-stone-500">
            <ShieldCheck className="size-3 text-emerald-700" />
            Anonymous Worker IDs only · no facial recognition
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
