import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Paperclip, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createSupportTicket } from "@/lib/support.functions";
import { useAuth } from "@/lib/auth-context";

const CATEGORIES = [
  { v: "bug", l: "Bug" },
  { v: "payment", l: "Paiement" },
  { v: "account", l: "Compte" },
  { v: "team", l: "Équipes / Joueurs" },
  { v: "event", l: "Événements" },
  { v: "feature_request", l: "Demande de fonctionnalité" },
  { v: "other", l: "Autre" },
] as const;

const PRIORITIES = [
  { v: "low", l: "Faible" },
  { v: "normal", l: "Normale" },
  { v: "high", l: "Élevée" },
  { v: "urgent", l: "Urgente" },
] as const;

export function SupportFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, activeClubId } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]["v"]>("bug");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]["v"]>("normal");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setSubject("");
    setCategory("bug");
    setPriority("normal");
    setDescription("");
    setIntent("");
    setFiles([]);
    setDone(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("not_authenticated");

      // Upload attachments first
      const paths: string[] = [];
      for (const f of files) {
        if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} dépasse 5 Mo`);
        const ext = f.name.split(".").pop() || "bin";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("support-attachments")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        paths.push(path);
      }

      const ctx = {
        url: typeof window !== "undefined" ? window.location.href : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : undefined,
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
        locale: typeof navigator !== "undefined" ? navigator.language : undefined,
        app_version: "web",
      };

      const res = await createSupportTicket({
        data: {
          subject: subject.trim(),
          description: description.trim(),
          category,
          priority,
          club_id: activeClubId ?? null,
          user_intent: intent.trim() || undefined,
          context: ctx,
          attachment_paths: paths,
        },
      });
      return res.id;
    },
    onSuccess: (id) => {
      setDone(id);
      toast.success("Demande envoyée");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <DialogTitle>Demande envoyée</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Nous reviendrons vers vous très vite. Vous pouvez suivre votre demande dans « Mes demandes ».
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={close}>Fermer</Button>
              <Button
                onClick={() => {
                  close();
                  navigate({ to: "/support/$ticketId", params: { ticketId: done } });
                }}
              >
                Voir le ticket
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Signaler un problème</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Sujet</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Décrivez le problème en quelques mots"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priorité</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Soyez le plus précis possible…"
                  rows={5}
                  maxLength={10000}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Que cherchiez-vous à faire ? <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                <Input
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="Ex. créer un événement"
                  maxLength={2000}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Captures d'écran <span className="text-muted-foreground font-normal">(max 5, 5 Mo)</span></Label>
                <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-dashed text-sm cursor-pointer hover:bg-accent/30">
                  <Paperclip className="h-4 w-4" />
                  Ajouter un fichier
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      setFiles((prev) => [...prev, ...list].slice(0, 5));
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
                        <span className="truncate flex-1">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={close} disabled={submit.isPending}>
                  Annuler
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending || !subject.trim() || !description.trim()}
                >
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
