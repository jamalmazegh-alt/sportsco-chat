import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv";

type ParsedRow = {
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
  license_number: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  parent_first: string | null;
  parent_last: string | null;
  parent_email: string | null;
  parent_phone: string | null;
};

const HEADERS = [
  "first_name",
  "last_name",
  "jersey",
  "position",
  "license",
  "birth_date",
  "email",
  "phone",
  "parent_first",
  "parent_last",
  "parent_email",
  "parent_phone",
] as const;

function splitLine(line: string): string[] {
  // simple split supporting , ; \t — values trimmed; quoted values respected.
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === "," || ch === ";" || ch === "\t") {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Detect header line
  let startIdx = 0;
  let headerMap: Record<string, number> | null = null;
  const firstParts = splitLine(lines[0]).map((s) => s.toLowerCase());
  const looksLikeHeader = firstParts.some((p) =>
    /^(first_?name|prenom|prénom|last_?name|nom)$/i.test(p),
  );
  if (looksLikeHeader) {
    headerMap = {};
    firstParts.forEach((p, idx) => {
      const norm = p.replace(/\s+/g, "_");
      headerMap![norm] = idx;
      if (norm === "prenom" || norm === "prénom" || norm === "firstname")
        headerMap!.first_name = idx;
      if (norm === "nom" || norm === "lastname") headerMap!.last_name = idx;
      if (norm === "numero" || norm === "numéro" || norm === "n°") headerMap!.jersey = idx;
      if (norm === "poste") headerMap!.position = idx;
      if (norm === "licence") headerMap!.license = idx;
      if (norm === "date_de_naissance" || norm === "naissance") headerMap!.birth_date = idx;
      if (norm === "telephone" || norm === "téléphone" || norm === "tel") headerMap!.phone = idx;
      if (norm === "parent_prenom" || norm === "parent_prénom") headerMap!.parent_first = idx;
      if (norm === "parent_nom") headerMap!.parent_last = idx;
      if (norm === "parent_tel" || norm === "parent_telephone") headerMap!.parent_phone = idx;
    });
    startIdx = 1;
  }

  const get = (parts: string[], key: string, fallbackIdx: number) => {
    const idx = headerMap ? headerMap[key] : fallbackIdx;
    if (idx === undefined || idx < 0) return "";
    return (parts[idx] ?? "").trim();
  };

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    const first = get(parts, "first_name", 0);
    const last = get(parts, "last_name", 1);
    if (!first || !last) continue;
    const jerseyRaw = get(parts, "jersey", 2);
    const jersey = jerseyRaw ? parseInt(jerseyRaw, 10) : NaN;
    const birth = get(parts, "birth_date", 5);
    let birthIso: string | null = null;
    if (birth) {
      // Accept ISO yyyy-mm-dd or dd/mm/yyyy
      const m = birth.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
      if (m) birthIso = `${m[3]}-${m[2]}-${m[1]}`;
      else if (/^\d{4}-\d{2}-\d{2}$/.test(birth)) birthIso = birth;
    }
    rows.push({
      first_name: first,
      last_name: last,
      jersey_number: Number.isFinite(jersey) && jersey >= 0 ? jersey : null,
      position: get(parts, "position", 3) || null,
      license_number: get(parts, "license", 4) || null,
      birth_date: birthIso,
      email: get(parts, "email", 6) || null,
      phone: get(parts, "phone", 7) || null,
      parent_first: get(parts, "parent_first", 8) || null,
      parent_last: get(parts, "parent_last", 9) || null,
      parent_email: get(parts, "parent_email", 10) || null,
      parent_phone: get(parts, "parent_phone", 11) || null,
    });
  }
  return rows;
}

function isMinor(birth: string | null): boolean {
  if (!birth) return false;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age < 18;
}

export function ImportPlayersCsvDialog({
  open,
  onOpenChange,
  teamId,
  clubId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  clubId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = "";
  }

  function onDownloadTemplate() {
    const csv =
      HEADERS.join(",") +
      "\r\n" +
      "Léa,Martin,7,GK,L12345,2010-05-12,,,Sophie,Martin,sophie@example.com,+33600000000\r\n" +
      "Paul,Dupont,10,ATT,,2003-09-01,paul@example.com,+33600000001,,,,";
    downloadCsv("players-template.csv", csv);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error(
        t("players.import.noneDetected", {
          defaultValue: "Aucun joueur détecté dans le fichier.",
        }),
      );
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: rows.length });
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const minor = isMinor(r.birth_date);
      const hasParent = (r.parent_first || r.parent_last) && (r.parent_email || r.parent_phone);
      if (minor && !hasParent) {
        failed++;
        errors.push(`${r.first_name} ${r.last_name}: parent requis (mineur)`);
        setProgress({ done: i + 1, total: rows.length });
        continue;
      }
      const { data: player, error } = await supabase
        .from("players")
        .insert({
          club_id: clubId,
          first_name: r.first_name,
          last_name: r.last_name,
          jersey_number: r.jersey_number,
          license_number: r.license_number,
          preferred_position: r.position,
          phone: r.phone,
          email: r.email,
          birth_date: r.birth_date,
          can_respond: minor ? false : true,
          child_platform_access: false,
        })
        .select("id")
        .single();
      if (error || !player) {
        failed++;
        errors.push(`${r.first_name} ${r.last_name}: ${error?.message ?? "insert failed"}`);
        setProgress({ done: i + 1, total: rows.length });
        continue;
      }
      const { error: tmErr } = await supabase
        .from("team_members")
        .insert({ team_id: teamId, player_id: player.id, role: "player" });
      if (tmErr) {
        failed++;
        errors.push(`${r.first_name} ${r.last_name}: ${tmErr.message}`);
        setProgress({ done: i + 1, total: rows.length });
        continue;
      }
      const parentName = `${r.parent_first ?? ""} ${r.parent_last ?? ""}`.trim();
      if (parentName || r.parent_email || r.parent_phone) {
        await supabase.from("player_parents").insert({
          player_id: player.id,
          parent_user_id: null,
          full_name: parentName || null,
          email: r.parent_email,
          phone: r.parent_phone,
          can_respond: true,
        });
      }
      inserted++;
      setProgress({ done: i + 1, total: rows.length });
    }

    setBusy(false);
    if (inserted > 0) {
      toast.success(
        t("players.import.done", {
          defaultValue: "{{inserted}} joueur(s) importé(s)",
          inserted,
        }),
      );
    }
    if (failed > 0) {
      toast.error(
        t("players.import.failed", {
          defaultValue: "{{failed}} ligne(s) en erreur",
          failed,
        }) + (errors.length ? ` — ${errors.slice(0, 3).join(" · ")}` : ""),
      );
    }
    if (inserted > 0) {
      onDone();
      setText("");
      onOpenChange(false);
    }
  }

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("players.import.title", { defaultValue: "Importer des joueurs (CSV)" })}
    >
      <form onSubmit={onSubmit} className="space-y-3 mt-3 pb-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("players.import.intro", {
              defaultValue:
                "Importez votre liste depuis un fichier CSV. Colonnes attendues : first_name, last_name, jersey, position, license, birth_date, email, phone, parent_first, parent_last, parent_email, parent_phone.",
            })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDownloadTemplate}
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
            {t("players.import.template", { defaultValue: "Modèle" })}
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label>{t("players.import.fileLabel", { defaultValue: "Fichier CSV" })}</Label>
          <Input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("players.import.pasteLabel", { defaultValue: "ou collez vos lignes" })}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder="first_name,last_name,jersey,position,license,birth_date,email,phone"
          />
        </div>
        {progress && (
          <p className="text-xs text-muted-foreground">
            {progress.done}/{progress.total}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !text.trim()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("players.import.submit", { defaultValue: "Importer" })
          )}
        </Button>
      </form>
    </ResponsiveFormDialog>
  );
}
