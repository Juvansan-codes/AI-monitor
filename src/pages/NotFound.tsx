import { Button } from "@/components/ui/button";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="term-grid flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="font-mono text-[11px] text-stone-500">
        <span className="text-emerald-700">$</span> amsq --route
        <span className="text-red-700"> [404]</span>
      </p>
      <h1 className="mt-3 font-mono text-4xl font-bold text-stone-900">
        ERROR: ROUTE NOT FOUND
      </h1>
      <p className="mt-2 max-w-sm font-mono text-xs leading-relaxed text-stone-500">
        The requested terminal route does not exist in the monitor.
      </p>
      <Button asChild className="mt-6 rounded-sm font-mono text-xs">
        <Link to="/">RETURN TO BASE →</Link>
      </Button>
    </div>
  );
}
