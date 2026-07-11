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
  parent2_first: string | null;
  parent2_last: string | null;
  parent2_email: string | null;
  parent2_phone: string | null;
};

type ExistingPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
  license_number: string | null;
  preferred_position: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
};

type PlayerPatch = {
  jersey_number?: number;
  license_number?: string;
  preferred_position?: string;
  birth_date?: string;
  email?: string;
  phone?: string;
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
  "parent2_first",
  "parent2_last",
  "parent2_email",
  "parent2_phone",
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

function normHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
}

function parseCsv(
  text: string,
  extraAliases: Record<string, (typeof HEADERS)[number]> = {},
): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Detect header line
  let startIdx = 0;
  let headerMap: Record<string, number> | null = null;
  const firstParts = splitLine(lines[0]);
  const firstLower = firstParts.map((s) => s.toLowerCase());
  const looksLikeHeader =
    firstLower.some((p) => /^(first_?name|prenom|prénom|last_?name|nom)$/i.test(p)) ||
    firstParts.some((p) => extraAliases[normHeader(p)]);
  if (looksLikeHeader) {
    headerMap = {};
    firstParts.forEach((raw, idx) => {
      const p = raw.toLowerCase();
      const norm = p.replace(/\s+/g, "_");
      headerMap![norm] = idx;
      const aliasKey = extraAliases[normHeader(raw)];
      if (aliasKey) headerMap![aliasKey] = idx;
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
      if (norm === "parent2_prenom" || norm === "parent2_prénom" || norm === "prenom_parent_2")
        headerMap!.parent2_first = idx;
      if (norm === "parent2_nom" || norm === "nom_parent_2") headerMap!.parent2_last = idx;
      if (norm === "parent2_email" || norm === "email_parent_2") headerMap!.parent2_email = idx;
      if (norm === "parent2_tel" || norm === "parent2_telephone" || norm === "telephone_parent_2")
        headerMap!.parent2_phone = idx;
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
      parent2_first: get(parts, "parent2_first", 12) || null,
      parent2_last: get(parts, "parent2_last", 13) || null,
      parent2_email: get(parts, "parent2_email", 14) || null,
      parent2_phone: get(parts, "parent2_phone", 15) || null,
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

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/[^+\d]/g, "");
}

function sameName(a: Pick<ExistingPlayer, "first_name" | "last_name">, row: ParsedRow): boolean {
  return (
    normalizeKey(a.first_name) === normalizeKey(row.first_name) &&
    normalizeKey(a.last_name) === normalizeKey(row.last_name)
  );
}

function findMatchingPlayer(roster: ExistingPlayer[], row: ParsedRow): ExistingPlayer | null {
  const license = normalizeKey(row.license_number);
  if (license) {
    const byLicense = roster.find((p) => normalizeKey(p.license_number) === license);
    if (byLicense) return byLicense;
  }

  const email = normalizeKey(row.email);
  if (email) {
    const byEmail = roster.find((p) => normalizeKey(p.email) === email);
    if (byEmail) return byEmail;
  }

  const phone = normalizePhone(row.phone);
  if (phone) {
    const byPhone = roster.find((p) => normalizePhone(p.phone) === phone);
    if (byPhone) return byPhone;
  }

  return roster.find((p) => sameName(p, row)) ?? null;
}

function playerPatch(existing: ExistingPlayer, row: ParsedRow): PlayerPatch {
  const patch: PlayerPatch = {};
  if (existing.jersey_number == null && row.jersey_number != null)
    patch.jersey_number = row.jersey_number;
  if (!existing.license_number && row.license_number) patch.license_number = row.license_number;
  if (!existing.preferred_position && row.position) patch.preferred_position = row.position;
  if (!existing.birth_date && row.birth_date) patch.birth_date = row.birth_date;
  if (!existing.email && row.email) patch.email = row.email;
  if (!existing.phone && row.phone) patch.phone = row.phone;
  return patch;
}

function parentDedupeKey(parent: {
  full_name: string | null;
  email: string | null;
  phone: string | null;
}) {
  return (
    normalizeKey(parent.email) || normalizePhone(parent.phone) || normalizeKey(parent.full_name)
  );
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
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const HEADER_TRANSLATIONS: Record<string, Record<(typeof HEADERS)[number], string>> = {
    fr: {
      first_name: "Prénom",
      last_name: "Nom",
      jersey: "Numéro",
      position: "Poste",
      license: "Licence",
      birth_date: "Date de naissance",
      email: "Email",
      phone: "Téléphone",
      parent_first: "Prénom parent",
      parent_last: "Nom parent",
      parent_email: "Email parent",
      parent_phone: "Téléphone parent",
      parent2_first: "Prénom parent 2",
      parent2_last: "Nom parent 2",
      parent2_email: "Email parent 2",
      parent2_phone: "Téléphone parent 2",
    },
    en: {
      first_name: "First name",
      last_name: "Last name",
      jersey: "Number",
      position: "Position",
      license: "License",
      birth_date: "Date of birth",
      email: "Email",
      phone: "Phone",
      parent_first: "Parent first name",
      parent_last: "Parent last name",
      parent_email: "Parent email",
      parent_phone: "Parent phone",
      parent2_first: "Parent 2 first name",
      parent2_last: "Parent 2 last name",
      parent2_email: "Parent 2 email",
      parent2_phone: "Parent 2 phone",
    },
    es: {
      first_name: "Nombre",
      last_name: "Apellido",
      jersey: "Número",
      position: "Posición",
      license: "Licencia",
      birth_date: "Fecha de nacimiento",
      email: "Correo",
      phone: "Teléfono",
      parent_first: "Nombre del padre",
      parent_last: "Apellido del padre",
      parent_email: "Correo del padre",
      parent_phone: "Teléfono del padre",
      parent2_first: "Nombre del padre 2",
      parent2_last: "Apellido del padre 2",
      parent2_email: "Correo del padre 2",
      parent2_phone: "Teléfono del padre 2",
    },
    de: {
      first_name: "Vorname",
      last_name: "Nachname",
      jersey: "Nummer",
      position: "Position",
      license: "Lizenz",
      birth_date: "Geburtsdatum",
      email: "E-Mail",
      phone: "Telefon",
      parent_first: "Vorname Elternteil",
      parent_last: "Nachname Elternteil",
      parent_email: "E-Mail Elternteil",
      parent_phone: "Telefon Elternteil",
      parent2_first: "Vorname Elternteil 2",
      parent2_last: "Nachname Elternteil 2",
      parent2_email: "E-Mail Elternteil 2",
      parent2_phone: "Telefon Elternteil 2",
    },
    it: {
      first_name: "Nome",
      last_name: "Cognome",
      jersey: "Numero",
      position: "Ruolo",
      license: "Licenza",
      birth_date: "Data di nascita",
      email: "Email",
      phone: "Telefono",
      parent_first: "Nome genitore",
      parent_last: "Cognome genitore",
      parent_email: "Email genitore",
      parent_phone: "Telefono genitore",
      parent2_first: "Nome genitore 2",
      parent2_last: "Cognome genitore 2",
      parent2_email: "Email genitore 2",
      parent2_phone: "Telefono genitore 2",
    },
    nl: {
      first_name: "Voornaam",
      last_name: "Achternaam",
      jersey: "Nummer",
      position: "Positie",
      license: "Licentie",
      birth_date: "Geboortedatum",
      email: "E-mail",
      phone: "Telefoon",
      parent_first: "Voornaam ouder",
      parent_last: "Achternaam ouder",
      parent_email: "E-mail ouder",
      parent_phone: "Telefoon ouder",
      parent2_first: "Voornaam ouder 2",
      parent2_last: "Achternaam ouder 2",
      parent2_email: "E-mail ouder 2",
      parent2_phone: "Telefoon ouder 2",
    },
    pt: {
      first_name: "Nome",
      last_name: "Sobrenome",
      jersey: "Número",
      position: "Posição",
      license: "Licença",
      birth_date: "Data de nascimento",
      email: "E-mail",
      phone: "Telefone",
      parent_first: "Nome do responsável",
      parent_last: "Sobrenome do responsável",
      parent_email: "E-mail do responsável",
      parent_phone: "Telefone do responsável",
      parent2_first: "Nome do responsável 2",
      parent2_last: "Sobrenome do responsável 2",
      parent2_email: "E-mail do responsável 2",
      parent2_phone: "Telefone do responsável 2",
    },
  };
  const lang = (i18n.language || "fr").slice(0, 2).toLowerCase();
  const HEADER_LABELS = HEADER_TRANSLATIONS[lang] ?? HEADER_TRANSLATIONS.fr;
  const localizedHeaders = HEADERS.map((k) => HEADER_LABELS[k]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = "";
  }

  function csvEscape(v: string) {
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function onDownloadTemplate() {
    const csv =
      localizedHeaders.map(csvEscape).join(",") +
      "\r\n" +
      "Léa,Martin,7,GK,L12345,2010-05-12,,,Sophie,Martin,sophie@example.com,+33600000000,Marc,Martin,marc@example.com,+33600000002\r\n" +
      "Paul,Dupont,10,ATT,,2003-09-01,paul@example.com,+33600000001,,,,,,,,";
    downloadCsv("players-template.csv", csv);
  }

  const aliasMap: Record<string, (typeof HEADERS)[number]> = {};
  HEADERS.forEach((k, i) => {
    aliasMap[normHeader(localizedHeaders[i])] = k;
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rows = parseCsv(text, aliasMap);
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

    const { data: currentMembers, error: currentMembersError } = await supabase
      .from("team_members")
      .select(
        "player_id, players:player_id(id, first_name, last_name, jersey_number, license_number, preferred_position, birth_date, email, phone)",
      )
      .eq("team_id", teamId)
      .eq("role", "player");

    if (currentMembersError) {
      setBusy(false);
      toast.error(currentMembersError.message);
      return;
    }

    const roster: ExistingPlayer[] = (currentMembers ?? [])
      .map((member: any) => member.players)
      .filter(Boolean);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const minor = isMinor(r.birth_date);

      // Build up to 2 parent candidates, then dedupe (email lowercase, then phone, then name)
      const parentCandidates = [
        {
          full_name: `${r.parent_first ?? ""} ${r.parent_last ?? ""}`.trim() || null,
          email: r.parent_email,
          phone: r.parent_phone,
        },
        {
          full_name: `${r.parent2_first ?? ""} ${r.parent2_last ?? ""}`.trim() || null,
          email: r.parent2_email,
          phone: r.parent2_phone,
        },
      ].filter((p) => p.full_name || p.email || p.phone);

      const seen = new Set<string>();
      const parents = parentCandidates.filter((p) => {
        const key = (
          p.email?.trim().toLowerCase() ||
          p.phone?.trim() ||
          p.full_name ||
          ""
        ).toString();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const hasParent = parents.length > 0;
      if (minor && !hasParent) {
        failed++;
        errors.push(`${r.first_name} ${r.last_name}: parent requis (mineur)`);
        setProgress({ done: i + 1, total: rows.length });
        continue;
      }
      let player = findMatchingPlayer(roster, r);
      let linkedToTeam = !!player;

      if (!player) {
        const byLicense = r.license_number
          ? await supabase
              .from("players")
              .select(
                "id, first_name, last_name, jersey_number, license_number, preferred_position, birth_date, email, phone",
              )
              .eq("club_id", clubId)
              .eq("license_number", r.license_number)
              .maybeSingle()
          : { data: null, error: null };
        const byEmail =
          !byLicense.data && r.email
            ? await supabase
                .from("players")
                .select(
                  "id, first_name, last_name, jersey_number, license_number, preferred_position, birth_date, email, phone",
                )
                .eq("club_id", clubId)
                .eq("email", r.email)
                .maybeSingle()
            : { data: null, error: null };
        if (byLicense.error || byEmail.error) {
          failed++;
          errors.push(
            `${r.first_name} ${r.last_name}: ${(byLicense.error ?? byEmail.error)?.message}`,
          );
          setProgress({ done: i + 1, total: rows.length });
          continue;
        }
        player = (byLicense.data ?? byEmail.data) as ExistingPlayer | null;
      }

      if (player) {
        const patch = playerPatch(player, r);
        if (Object.keys(patch).length > 0) {
          const { error: updateError } = await supabase
            .from("players")
            .update(patch)
            .eq("id", player.id);
          if (updateError) {
            failed++;
            errors.push(`${r.first_name} ${r.last_name}: ${updateError.message}`);
            setProgress({ done: i + 1, total: rows.length });
            continue;
          }
          player = { ...player, ...patch };
        }
      } else {
        const { data: newPlayer, error } = await supabase
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
          .select(
            "id, first_name, last_name, jersey_number, license_number, preferred_position, birth_date, email, phone",
          )
          .single();
        if (error || !newPlayer) {
          failed++;
          errors.push(`${r.first_name} ${r.last_name}: ${error?.message ?? "insert failed"}`);
          setProgress({ done: i + 1, total: rows.length });
          continue;
        }
        player = newPlayer as ExistingPlayer;
      }

      if (!linkedToTeam) {
        const { data: alreadyMember } = await supabase
          .from("team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("player_id", player.id)
          .eq("role", "player")
          .maybeSingle();
        linkedToTeam = !!alreadyMember;
      }

      if (!linkedToTeam) {
        const { error: tmErr } = await supabase
          .from("team_members")
          .insert({ team_id: teamId, player_id: player.id, role: "player" });
        if (tmErr) {
          failed++;
          const msg =
            (tmErr as any).code === "23505"
              ? t("players.alreadyInTeam", { defaultValue: "Ce joueur est déjà dans cette équipe" })
              : tmErr.message;
          errors.push(`${r.first_name} ${r.last_name}: ${msg}`);
          setProgress({ done: i + 1, total: rows.length });
          continue;
        }
      }

      roster.push(player);

      const { data: currentParents } = await supabase
        .from("player_parents")
        .select("full_name, email, phone")
        .eq("player_id", player.id);
      const parentKeys = new Set((currentParents ?? []).map(parentDedupeKey).filter(Boolean));
      for (const p of parents) {
        const key = parentDedupeKey(p);
        if (key && parentKeys.has(key)) continue;
        await supabase.from("player_parents").insert({
          player_id: player.id,
          parent_user_id: null,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          can_respond: true,
        });
        if (key) parentKeys.add(key);
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
                "Importez votre liste depuis un fichier CSV. Colonnes attendues : {{cols}}.",
              cols: localizedHeaders.join(", "),
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
        <p className="text-[11px] text-muted-foreground">
          {t("players.import.parentsHint", {
            defaultValue:
              "Jusqu'à 2 parents par joueur via le fichier. Pour en ajouter davantage, ouvrez la fiche du joueur après l'import.",
          })}
        </p>
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
            wrap="soft"
            placeholder={
              localizedHeaders.join(",") +
              "\nLéa,Martin,7,GK,L12345,2010-05-12,,,Sophie,Martin,sophie@example.com,+33600000000,Marc,Martin,marc@example.com,+33600000002"
            }
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
