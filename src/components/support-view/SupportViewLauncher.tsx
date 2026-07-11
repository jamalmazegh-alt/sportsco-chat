import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createSupportViewSession } from "@/lib/support-view/session.functions";
import { SUPPORT_VIEW_PERSONAS, type SupportViewPersona } from "@/lib/support-view/schemas";

export function SupportViewLauncher({
  targetUserId,
  clubId,
  clubName,
  targetName,
  defaultPersona,
  size = "sm",
  variant = "outline",
  label = "View as",
}: {
  targetUserId: string;
  clubId: string;
  clubName?: string | null;
  targetName?: string | null;
  defaultPersona?: SupportViewPersona;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  label?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<SupportViewPersona>(defaultPersona ?? "club_admin");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      toast.error("Please describe why you need this view (min 3 chars).");
      return;
    }
    setBusy(true);
    try {
      const s = await createSupportViewSession({
        data: {
          target_user_id: targetUserId,
          club_id: clubId,
          persona,
          reason: reason.trim(),
          duration_minutes: duration,
        },
      });
      setOpen(false);
      navigate({ to: "/support-view/$sessionId", params: { sessionId: s.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start session";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          <Eye className="h-3.5 w-3.5 mr-1.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Start support view</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              You'll see {targetName ?? "the user"}'s app read-only
              {clubName ? ` in ${clubName}` : ""}. The session is audited and expires automatically.
            </p>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Persona</Label>
            <Select value={persona} onValueChange={(v) => setPersona(v as SupportViewPersona)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_VIEW_PERSONAS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Must match a real role the user has in this club.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (audited)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ticket #123 — checking payment status"
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (min, max 60)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              max={60}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Math.min(60, Number(e.target.value) || 30)))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Start view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
