import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
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
import { SUPPORT_CATEGORIES, type SupportCategory } from "@/lib/support-constants";

export function SupportFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation("support");
  const { user, activeClubId } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("bug");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setSubject("");
    setCategory("bug");
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
        if (f.size > 5 * 1024 * 1024) {
          throw new Error(t("form.file_too_large", { name: f.name }));
        }
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
          // Users always submit at normal priority; staff can escalate later.
          priority: "normal",
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
      toast.success(t("form.sent"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("form.error")),
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
            <DialogTitle>{t("form.sent")}</DialogTitle>
            <p className="text-sm text-muted-foreground">{t("form.sent_desc")}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={close}>{t("form.close")}</Button>
              <Button
                onClick={() => {
                  close();
                  navigate({ to: "/support/$ticketId", params: { ticketId: done } });
                }}
              >
                {t("form.view")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("form.title")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("form.subject")}</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("form.subject_placeholder")}
                  maxLength={200}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("form.category")}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{t(`category.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("form.description")}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("form.description_placeholder")}
                  rows={5}
                  maxLength={10000}
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t("form.intent")}{" "}
                  <span className="text-muted-foreground font-normal">{t("form.intent_optional")}</span>
                </Label>
                <Input
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder={t("form.intent_placeholder")}
                  maxLength={2000}
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  {t("form.attachments")}{" "}
                  <span className="text-muted-foreground font-normal">{t("form.attachments_hint")}</span>
                </Label>
                <label className="flex items-center gap-2 h-10 px-3 rounded-md border border-dashed text-sm cursor-pointer hover:bg-accent/30">
                  <Paperclip className="h-4 w-4" />
                  {t("form.add_file")}
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
                  {t("form.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending || !subject.trim() || !description.trim()}
                >
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("form.send")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
