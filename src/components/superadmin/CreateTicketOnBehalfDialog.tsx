import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Search, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchUsers } from "@/lib/superadmin.functions";
import { createSupportTicketOnBehalf } from "@/lib/support.functions";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from "@/lib/support-constants";

type UserRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

export function CreateTicketOnBehalfDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [priority, setPriority] = useState<string>("normal");
  const [channel, setChannel] = useState<string>("phone");
  const [notifyUser, setNotifyUser] = useState(false);

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ["superadmin-user-search", search],
    queryFn: () => searchUsers({ data: { search: search || undefined, limit: 15 } }),
    enabled: open && !selected && search.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createSupportTicketOnBehalf({
        data: {
          user_id: selected!.id,
          subject: subject.trim(),
          description: description.trim(),
          category: category as "other",
          priority: priority as "normal",
          channel: channel as "phone",
          notify_user: notifyUser,
        },
      }),
    onSuccess: (res) => {
      toast.success(t("superadmin.components.ticketCreated"));
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      reset();
      onOpenChange(false);
      navigate({
        to: "/superadmin/support-tickets/$ticketId",
        params: { ticketId: res.id },
      });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t("superadmin.components.createFailed"));
    },
  });

  function reset() {
    setSearch("");
    setSelected(null);
    setSubject("");
    setDescription("");
    setCategory("other");
    setPriority("normal");
    setChannel("phone");
    setNotifyUser(false);
  }

  const canSubmit =
    !!selected && subject.trim().length > 0 && description.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau ticket au nom d'un utilisateur</DialogTitle>
          <DialogDescription>
            Utilisé pour logger une demande reçue par téléphone, email ou en personne.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Utilisateur</Label>
            {selected ? (
              <div className="mt-1 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {selected.full_name ??
                        `${selected.first_name ?? ""} ${selected.last_name ?? ""}`.trim() ??
                        selected.id}
                    </div>
                    {selected.phone && (
                      <div className="text-xs text-muted-foreground truncate">{selected.phone}</div>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Rechercher par nom ou téléphone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {search.trim().length >= 2 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-card">
                    {isFetching ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Recherche…
                      </div>
                    ) : searchResult?.items.length ? (
                      <ul className="divide-y">
                        {searchResult.items.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(u as UserRow)}
                              className="w-full text-left px-3 py-2 hover:bg-accent/50"
                            >
                              <div className="text-sm">
                                {u.full_name ??
                                  `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() ??
                                  u.id}
                              </div>
                              {u.phone && (
                                <div className="text-xs text-muted-foreground">{u.phone}</div>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <Label className="text-xs" htmlFor="ob-subject">
              Sujet
            </Label>
            <Input
              id="ob-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Résumé de la demande"
              maxLength={200}
            />
          </div>

          <div>
            <Label className="text-xs" htmlFor="ob-desc">
              Description
            </Label>
            <Textarea
              id="ob-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ce que l'utilisateur a rapporté…"
              rows={5}
              maxLength={10000}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priorité</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Téléphone</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="in_person">En personne</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyUser}
              onChange={(e) => setNotifyUser(e.target.checked)}
              className="h-4 w-4"
            />
            Notifier l'utilisateur par email
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Créer le ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
