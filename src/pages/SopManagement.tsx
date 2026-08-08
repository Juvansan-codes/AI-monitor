import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DemoTag } from "@/components/terminal/badges";
import { Panel } from "@/components/terminal/Panel";
import { Shell } from "@/components/terminal/Shell";
import { useAIMode } from "@/hooks/use-ai-mode";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ListPlus,
  Loader2,
  Pencil,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface StepDraft {
  action: string;
  actionCode: string;
  requiredTools: string;
  safetyCritical: boolean;
  description: string;
}

interface SopDraft {
  name: string;
  description: string;
  requiredTools: string;
  requiredPpe: string;
  steps: StepDraft[];
}

const emptyDraft = (): SopDraft => ({
  name: "",
  description: "",
  requiredTools: "",
  requiredPpe: "",
  steps: [],
});

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function SopManagement() {
  const { mode } = useAIMode();
  const sops = useQuery(api.sops.list);
  const createSop = useMutation(api.sops.create);
  const updateSop = useMutation(api.sops.update);
  const removeSop = useMutation(api.sops.remove);

  const [editing, setEditing] = useState<{ sopId?: Id<"sops"> } | null>(null);
  const [draft, setDraft] = useState<SopDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const nav = [
    { to: "/supervisor", label: "Command", end: true },
    { to: "/supervisor/sops", label: "SOPs" },
    { to: "/supervisor/reports", label: "Reports" },
  ];

  useEffect(() => {
    if (editing?.sopId && sops) {
      const sop = sops.find((s) => s._id === editing.sopId);
      if (sop) {
        setDraft({
          name: sop.name,
          description: sop.description,
          requiredTools: sop.requiredTools.join(", "),
          requiredPpe: sop.requiredPpe.join(", "),
          steps: sop.steps.map((st) => ({
            action: st.action,
            actionCode: st.actionCode,
            requiredTools: st.requiredTools.join(", "),
            safetyCritical: st.safetyCritical,
            description: st.description ?? "",
          })),
        });
      }
    }
  }, [editing, sops]);

  const openNew = () => {
    setDraft(emptyDraft());
    setEditing({});
  };

  const openEdit = (sopId: Id<"sops">) => {
    setEditing({ sopId });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("SOP name is required.");
      return;
    }
    if (draft.steps.length === 0) {
      toast.error("Add at least one step.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        requiredTools: splitList(draft.requiredTools),
        requiredPpe: splitList(draft.requiredPpe),
        steps: draft.steps.map((s, i) => ({
          stepNumber: i + 1,
          action: s.action.trim() || `Step ${i + 1}`,
          actionCode: (s.actionCode.trim() || s.action.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")),
          requiredTools: splitList(s.requiredTools),
          safetyCritical: s.safetyCritical,
          description: s.description.trim() || undefined,
        })),
      };
      if (editing?.sopId) {
        await updateSop({ sopId: editing.sopId, ...payload });
        toast.success("SOP updated.");
      } else {
        await createSop(payload);
        toast.success("SOP created.");
      }
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save SOP");
    } finally {
      setSaving(false);
    }
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const steps = [...d.steps];
      const target = idx + dir;
      if (target < 0 || target >= steps.length) return d;
      [steps[idx], steps[target]] = [steps[target], steps[idx]];
      return { ...d, steps };
    });
  };

  return (
    <Shell roleLabel="supervisor" nav={nav} aiMode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight text-stone-900">
            <span className="text-emerald-700">▌</span> SOP MANAGEMENT
          </h1>
          <p className="mt-1 font-mono text-xs text-stone-500">
            Standard operating procedures are stored in the database — never
            hard-coded in the UI.
          </p>
        </div>
        <Button className="gap-2 rounded-sm font-mono text-xs" onClick={openNew}>
          <ListPlus className="size-4" /> CREATE SOP
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {!sops ? (
          <Loader2 className="size-5 animate-spin text-stone-400" />
        ) : (
          sops.map((sop) => (
            <div key={sop._id} className="rounded-md border border-stone-300 bg-card">
              <div className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-sm font-bold text-stone-900">{sop.name}</h2>
                    {sop.isDemo && <DemoTag />}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-stone-500">{sop.description}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" className="rounded-sm" onClick={() => openEdit(sop._id)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="rounded-sm text-red-700 hover:text-red-800">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-mono text-sm">Delete SOP?</AlertDialogTitle>
                        <AlertDialogDescription className="font-mono text-xs">
                          "{sop.name}" will be permanently deleted. SOPs assigned
                          to a job cannot be deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-sm font-mono text-xs">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-sm bg-red-700 font-mono text-xs text-white hover:bg-red-800"
                          onClick={() => {
                            removeSop({ sopId: sop._id })
                              .then(() => toast.success("SOP deleted."))
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Delete failed"),
                              );
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <ol className="divide-y divide-stone-200/70 font-mono">
                {sop.steps.map((st) => (
                  <li key={st._id} className="flex items-center gap-2 px-4 py-1.5 text-xs">
                    <span className="w-5 text-stone-400">#{st.stepNumber}</span>
                    <span className="flex-1 text-stone-700">{st.action}</span>
                    {st.safetyCritical && (
                      <span className="flex items-center gap-0.5 rounded-sm bg-red-50 px-1.5 py-px text-[9px] font-bold text-red-700 ring-1 ring-red-700/30">
                        <ShieldAlert className="size-2.5" /> CRITICAL
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-200 px-4 py-2.5 font-mono text-[10px] text-stone-500">
                <span className="flex items-center gap-1">
                  <Wrench className="size-3" /> tools: {sop.requiredTools.join(", ") || "—"}
                </span>
                <span>PPE: {sop.requiredPpe.join(", ") || "—"}</span>
                <span>{sop.steps.length} steps</span>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl rounded-md font-mono">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {editing?.sopId ? "EDIT SOP" : "CREATE SOP"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Define steps, required tools/PPE and safety-critical flags.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">Name</Label>
                <Input
                  className="rounded-sm font-mono text-sm"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Motor Component Replacement"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">Required PPE (comma)</Label>
                <Input
                  className="rounded-sm font-mono text-sm"
                  value={draft.requiredPpe}
                  onChange={(e) => setDraft((d) => ({ ...d, requiredPpe: e.target.value }))}
                  placeholder="Helmet, Gloves, Safety shoes"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">Description</Label>
              <Textarea
                className="rounded-sm font-mono text-sm"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                Required tools (comma)
              </Label>
              <Input
                className="rounded-sm font-mono text-sm"
                value={draft.requiredTools}
                onChange={(e) => setDraft((d) => ({ ...d, requiredTools: e.target.value }))}
                placeholder="Screwdriver, Wrench, Torque wrench"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="font-mono text-[10px] tracking-widest text-stone-500 uppercase">
                  Steps ({draft.steps.length})
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-sm font-mono text-[10px]"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      steps: [
                        ...d.steps,
                        { action: "", actionCode: "", requiredTools: "", safetyCritical: false, description: "" },
                      ],
                    }))
                  }
                >
                  <ListPlus className="size-3" /> ADD STEP
                </Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {draft.steps.map((step, i) => (
                  <div key={i} className="rounded-md border border-stone-300 bg-stone-50 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-100">
                        {i + 1}
                      </span>
                      <Input
                        className="h-8 rounded-sm font-mono text-sm"
                        value={step.action}
                        onChange={(e) =>
                          setDraft((d) => {
                            const steps = [...d.steps];
                            steps[i] = { ...steps[i], action: e.target.value };
                            return { ...d, steps };
                          })
                        }
                        placeholder="Action (e.g. Power OFF)"
                      />
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon-sm" className="size-7 rounded-sm" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 rounded-sm"
                          onClick={() => moveStep(i, 1)}
                          disabled={i === draft.steps.length - 1}
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 rounded-sm text-red-700"
                          onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, x) => x !== i) }))}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Input
                        className="h-7 rounded-sm font-mono text-xs"
                        value={step.actionCode}
                        onChange={(e) =>
                          setDraft((d) => {
                            const steps = [...d.steps];
                            steps[i] = { ...steps[i], actionCode: e.target.value };
                            return { ...d, steps };
                          })
                        }
                        placeholder="action_code"
                      />
                      <Input
                        className="h-7 rounded-sm font-mono text-xs"
                        value={step.requiredTools}
                        onChange={(e) =>
                          setDraft((d) => {
                            const steps = [...d.steps];
                            steps[i] = { ...steps[i], requiredTools: e.target.value };
                            return { ...d, steps };
                          })
                        }
                        placeholder="required tools (comma)"
                      />
                    </div>
                    <label className="mt-2 flex items-center gap-2">
                      <Switch
                        checked={step.safetyCritical}
                        onCheckedChange={(v) =>
                          setDraft((d) => {
                            const steps = [...d.steps];
                            steps[i] = { ...steps[i], safetyCritical: v };
                            return { ...d, steps };
                          })
                        }
                      />
                      <span className="flex items-center gap-1 font-mono text-[10px] text-stone-600">
                        <ShieldAlert className="size-3 text-red-700" /> Safety-critical step
                      </span>
                    </label>
                  </div>
                ))}
                {draft.steps.length === 0 && (
                  <p className={cn("rounded-md border border-dashed border-stone-400/70 px-3 py-6 text-center font-mono text-xs text-stone-500")}>
                    No steps yet — add the first step.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-sm font-mono text-xs" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button className="rounded-sm font-mono text-xs" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              SAVE SOP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
