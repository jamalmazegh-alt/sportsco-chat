import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Star,
  ShieldAlert,
  Upload,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/tournament/$slug_/roster/$token")({
  component: RosterPage,
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("roster.metaTitle", {
          ns: "tournaments",
          defaultValue: "Composition de l'effectif",
          slug: params.slug,
        }),
      },
    ],
  }),
});

type Player = {
  id?: string;
  first_name: string;
  last_name: string;
  jersey_number: string;
  position: string;
  is_captain: boolean;
};

const TEMPLATE_CSV =
  "first_name,last_name,jersey_number,position,is_captain\nJean,Dupont,10,Attaquant,true\nPaul,Martin,7,Milieu,false\n";

function normalizeHeader(h: string): string {
  const s = h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (["first_name", "firstname", "prenom", "prénom", "first"].includes(s)) return "first_name";
  if (["last_name", "lastname", "nom", "name", "last"].includes(s)) return "last_name";
  if (["jersey", "jersey_number", "number", "numero", "n", "#", "dossard"].includes(s))
    return "jersey_number";
  if (["position", "poste", "role"].includes(s)) return "position";
  if (["captain", "capitaine", "is_captain", "c"].includes(s)) return "is_captain";
  return s;
}

function parseCSV(text: string): Player[] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  // Detect separator
  const firstLine = clean.split(/\r?\n/)[0];
  const sep = firstLine.includes(";")
    ? ";"
    : firstLine.includes("\t")
      ? "\t"
      : ",";
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === sep && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = splitLine(lines[0]).map(normalizeHeader);
  const hasHeader =
    headers.includes("first_name") ||
    headers.includes("last_name") ||
    headers.includes("jersey_number");
  const startIdx = hasHeader ? 1 : 0;
  const cols = hasHeader
    ? headers
    : ["first_name", "last_name", "jersey_number", "position", "is_captain"];

  const players: Player[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const fields = splitLine(lines[i]);
    const row: Record<string, string> = {};
    cols.forEach((c, j) => (row[c] = fields[j] ?? ""));
    const fn = (row.first_name || "").trim();
    const ln = (row.last_name || "").trim();
    if (!fn && !ln) continue;
    const jersey = (row.jersey_number || "").replace(/[^0-9]/g, "");
    const cap = (row.is_captain || "").toLowerCase().trim();
    players.push({
      first_name: fn,
      last_name: ln,
      jersey_number: jersey,
      position: (row.position || "").trim(),
      is_captain: ["1", "true", "vrai", "oui", "yes", "y", "x"].includes(cap),
    });
  }
  return players;
}

function RosterPage() {
  const { slug, token } = Route.useParams();
  const { t } = useTranslation("tournaments");
  const [players, setPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"replace" | "append">("append");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["roster", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/tournament-roster?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      return data.registration as {
        registration_id: string;
        tournament_name: string;
        tournament_slug: string;
        team_name: string;
        contact_name: string;
        status: "pending" | "approved" | "rejected";
        tournament_team_id: string | null;
        roster_submitted_at: string | null;
        max_players: number;
        players: Array<{
          id?: string;
          first_name: string;
          last_name: string;
          jersey_number: number | null;
          position: string | null;
          is_captain: boolean | null;
        }>;
      };
    },
  });

  useEffect(() => {
    if (q.data?.players) {
      setPlayers(
        q.data.players.map((p) => ({
          id: p.id,
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          jersey_number: p.jersey_number != null ? String(p.jersey_number) : "",
          position: p.position ?? "",
          is_captain: !!p.is_captain,
        })),
      );
    }
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-md">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-medium">
            {t("roster.invalidTitle", { defaultValue: "Lien invalide" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("roster.invalidBody", {
              defaultValue: "Ce lien d'effectif est invalide ou a expiré.",
            })}
          </p>
        </div>
      </div>
    );
  }

  const reg = q.data;
  const approved = reg.status === "approved" && !!reg.tournament_team_id;
  const maxPlayers = reg.max_players ?? 16;
  const remaining = Math.max(0, maxPlayers - players.length);
  const overLimit = players.length > maxPlayers;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!approved) return;
    if (overLimit) {
      toast.error(
        t("roster.tooMany", {
          defaultValue: "Effectif limité à {{max}} joueurs.",
          max: maxPlayers,
        }),
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/public/tournament-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          players: players
            .filter((p) => p.first_name.trim() && p.last_name.trim())
            .map((p) => ({
              first_name: p.first_name.trim(),
              last_name: p.last_name.trim(),
              jersey_number: p.jersey_number ? parseInt(p.jersey_number, 10) : null,
              position: p.position.trim() || null,
              is_captain: p.is_captain,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? t("common.error", { defaultValue: "Erreur" }));
        return;
      }
      toast.success(t("roster.saved", { defaultValue: "Effectif enregistré" }));
      q.refetch();
    } finally {
      setSaving(false);
    }
  }

  function handleImportText(text: string) {
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      toast.error(
        t("roster.import.empty", { defaultValue: "Aucun joueur détecté dans le fichier." }),
      );
      return;
    }
    const base = importMode === "replace" ? [] : players;
    const merged = [...base, ...parsed];
    if (merged.length > maxPlayers) {
      toast.error(
        t("roster.import.blocked", {
          defaultValue:
            "Import bloqué : {{total}} joueurs dépassent la limite de {{max}}. Réduisez le fichier ou choisissez « Remplacer ».",
          total: merged.length,
          max: maxPlayers,
        }),
      );
      return;
    }
    // Ensure single captain
    let captainSeen = false;
    const finalList = merged.map((p) => {
      if (p.is_captain && !captainSeen) {
        captainSeen = true;
        return p;
      }
      return { ...p, is_captain: false };
    });

    setPlayers(finalList);
    setImportOpen(false);
    setImportText("");
    toast.success(
      t("roster.import.ok", {
        defaultValue: "{{n}} joueur(s) importé(s){{note}}",
        n: parsed.length,
        note: truncatedNote,
      }),
    );
  }

  async function handleFile(file: File) {
    const text = await file.text();
    handleImportText(text);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-2xl mx-auto p-5 pb-12">
      <Link
        to="/tournament/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("register.backTournament")}
      </Link>
      <h1 className="text-2xl font-semibold mb-1">
        {t("roster.heading", { defaultValue: "Composition — {{team}}", team: reg.team_name })}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">{reg.tournament_name}</p>

      {!approved ? (
        <div className="rounded-md border bg-muted/40 p-4 text-sm">
          <p className="font-medium mb-1">
            {t("roster.pendingTitle", { defaultValue: "Candidature en cours de validation" })}
          </p>
          <p className="text-muted-foreground">
            {t("roster.pendingBody", {
              defaultValue:
                "Dès que l'organisation aura validé votre inscription, vous pourrez ajouter ou modifier vos joueurs depuis ce même lien.",
            })}
          </p>
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label>
              {t("roster.playersLabelMax", {
                defaultValue: "Joueurs ({{count}} / {{max}})",
                count: players.length,
                max: maxPlayers,
              })}
            </Label>
            <div className="flex gap-2 flex-wrap">
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button type="button" size="sm" variant="outline">
                    <Upload className="h-4 w-4" />
                    {t("roster.import.button", { defaultValue: "Importer CSV" })}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      {t("roster.import.title", { defaultValue: "Importer des joueurs" })}
                    </DialogTitle>
                    <DialogDescription>
                      {t("roster.import.desc", {
                        defaultValue:
                          "Format CSV : first_name, last_name, jersey_number, position, is_captain. Séparateurs , ; ou tab acceptés.",
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {t("roster.import.file", { defaultValue: "Choisir un fichier" })}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(f);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={downloadTemplate}
                      >
                        <FileDown className="h-4 w-4" />
                        {t("roster.import.template", { defaultValue: "Modèle" })}
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("roster.import.orPaste", { defaultValue: "Ou collez le contenu CSV :" })}
                    </div>
                    <Textarea
                      rows={6}
                      placeholder="first_name,last_name,jersey_number,position,is_captain"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                    />
                    <div className="flex gap-2 text-xs">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          checked={importMode === "append"}
                          onChange={() => setImportMode("append")}
                        />
                        {t("roster.import.append", { defaultValue: "Ajouter à l'effectif" })}
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          checked={importMode === "replace"}
                          onChange={() => setImportMode("replace")}
                        />
                        {t("roster.import.replace", { defaultValue: "Remplacer l'effectif" })}
                      </label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setImportOpen(false)}
                    >
                      {t("common.cancel", { defaultValue: "Annuler" })}
                    </Button>
                    <Button
                      type="button"
                      disabled={!importText.trim()}
                      onClick={() => handleImportText(importText)}
                    >
                      {t("roster.import.confirm", { defaultValue: "Importer" })}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={players.length >= maxPlayers}
                onClick={() =>
                  setPlayers([
                    ...players,
                    {
                      first_name: "",
                      last_name: "",
                      jersey_number: "",
                      position: "",
                      is_captain: false,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                {t("register.addPlayer", { defaultValue: "Ajouter" })}
              </Button>
            </div>
          </div>

          {overLimit ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {t("roster.tooMany", {
                defaultValue: "Effectif limité à {{max}} joueurs.",
                max: maxPlayers,
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("roster.remaining", {
                defaultValue: "{{n}} place(s) restante(s)",
                n: remaining,
              })}
            </p>
          )}

          {players.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              {t("roster.empty", {
                defaultValue: "Aucun joueur pour le moment. Cliquez sur Ajouter ou Importer CSV.",
              })}
            </p>
          )}

          <div className="space-y-2">
            {players.map((p, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-6 sm:col-span-5"
                    placeholder={t("register.fields.firstName")}
                    value={p.first_name}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].first_name = e.target.value;
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-6 sm:col-span-5"
                    placeholder={t("register.fields.lastName")}
                    value={p.last_name}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].last_name = e.target.value;
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-4 sm:col-span-1"
                    placeholder="#"
                    inputMode="numeric"
                    value={p.jersey_number}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].jersey_number = e.target.value.replace(/[^0-9]/g, "");
                      setPlayers(next);
                    }}
                  />
                  <Input
                    className="col-span-7 sm:col-span-5"
                    placeholder={t("register.fields.position")}
                    value={p.position}
                    onChange={(e) => {
                      const next = [...players];
                      next[i].position = e.target.value;
                      setPlayers(next);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={p.is_captain ? "default" : "outline"}
                    className="col-span-7 sm:col-span-5 gap-1"
                    onClick={() => {
                      const next = players.map((pp, j) => ({
                        ...pp,
                        is_captain: j === i ? !pp.is_captain : false,
                      }));
                      setPlayers(next);
                    }}
                  >
                    <Star className="h-3.5 w-3.5" />
                    {p.is_captain
                      ? t("roster.captain", { defaultValue: "Capitaine" })
                      : t("roster.setCaptain", { defaultValue: "Définir capitaine" })}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="col-span-1"
                    onClick={() => setPlayers(players.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            {reg.roster_submitted_at && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {t("roster.lastSaved", {
                  defaultValue: "Dernier enregistrement : {{date}}",
                  date: new Date(reg.roster_submitted_at).toLocaleString(),
                })}
              </p>
            )}
            <Button type="submit" disabled={saving || overLimit} className="ml-auto">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("roster.save", { defaultValue: "Enregistrer" })
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
