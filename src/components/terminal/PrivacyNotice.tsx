import { ShieldCheck } from "lucide-react";

export function PrivacyNotice({ variant }: { variant: "camera" | "location" }) {
  const text =
    variant === "camera"
      ? "Camera frames are processed only for PPE, tool and maintenance-action verification. No facial recognition is performed and workers are identified by anonymous Worker ID, not by face."
      : "Your location is used only to track the assigned job route and to confirm arrival. Position history is stored per job and is visible to your supervisor.";
  return (
    <p className="flex items-start gap-2 rounded-sm border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[10px] leading-relaxed text-stone-500">
      <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-700" />
      <span>
        <span className="font-bold tracking-widest text-stone-600 uppercase">Privacy notice · </span>
        {text}
      </span>
    </p>
  );
}
