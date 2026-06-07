import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  MapPin,
  Clock,
  Loader2,
  GripVertical,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateTournament,
  updateMatchSchedule,
} from "@/modules/tournaments/tournaments.functions";

type Match = {
  id: string;
  match_number: number;
  scheduled_at: string | null;
  field: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  status: string;
};

type Team = { id: string; name: string };

interface Props {
  tournamentId: string;
  fields: string[] | null | undefined;
  dailyStartTime: string;
  dailyEndTime: string;
  matches: Match[];
  teams: Team[];
  /** Map terrain → URL de streaming (un lien par terrain). */
  fieldStreams?: Record<string, string> | null;
}

const UNASSIGNED = "__unassigned__";

export function FieldsManager({
  tournamentId,
  fields,
  dailyStartTime,
  dailyEndTime,
  matches,
  teams,
  fieldStreams,
}: Props) {
  const { t, i18n } = useTranslation("tournaments");
  const initial = (fields && fields.length > 0 ? fields : [t("common.field") + " 1"]).map(
    (f) => String(f),
  );
  const [localFields, setLocalFields] = useState<string[]>(initial);
  const [streams, setStreams] = useState<Record<string, string>>(
    () => ({ ...(fieldStreams ?? {}) }),
  );
  const [startTime, setStartTime] = useState<string>(
    (dailyStartTime ?? "09:00:00").slice(0, 5),
  );
  const [endTime, setEndTime] = useState<string>(
    (dailyEndTime ?? "20:00:00").slice(0, 5),
  );
  const [newField, setNewField] = useState("");

  const updateFn = useServerFn(updateTournament);
  const moveFn = useServerFn(updateMatchSchedule);
  const qc = useQueryClient();

  const saveSettings = useMutation({
    mutationFn: () => {
      // Ne conserver que les streams des terrains encore présents
      const cleanedStreams: Record<string, string> = {};
      for (const f of localFields) {
        const v = (streams[f] ?? "").trim();
        if (v) cleanedStreams[f] = v;
      }
      return updateFn({
        data: {
          tournament_id: tournamentId,
          patch: {
            fields: localFields,
            daily_start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
            daily_end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
            field_streams: cleanedStreams,
          } as any,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("fields.savedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("fields.errorToast")),
  });

  const reassign = useMutation({
    mutationFn: (vars: { matchId: string; field: string | null }) =>
      moveFn({
        data: {
          match_id: vars.matchId,
          field: vars.field,
        },
      }),
    onSuccess: () => {
      toast.success(t("fields.fieldUpdatedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("fields.errorToast")),
  });

  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name ?? "?" : "?";

  const matchesByField = useMemo(() => {
    const map = new Map<string, Match[]>();
    localFields.forEach((f) => map.set(f, []));
    map.set(UNASSIGNED, []);
    for (const m of matches) {
      const key = m.field && localFields.includes(m.field) ? m.field : UNASSIGNED;
      map.get(key)!.push(m);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        if (!a.scheduled_at && !b.scheduled_at) return a.match_number - b.match_number;
        if (!a.scheduled_at) return 1;
        if (!b.scheduled_at) return -1;
        return a.scheduled_at.localeCompare(b.scheduled_at);
      });
    }
    return map;
  }, [matches, localFields]);

  const addField = () => {
    const v = newField.trim();
    if (!v) return;
    if (localFields.includes(v)) {
      toast.error(t("fields.duplicate"));
      return;
    }
    setLocalFields([...localFields, v]);
    setNewField("");
  };

  const renameField = (idx: number, value: string) => {
    const next = [...localFields];
    next[idx] = value;
    setLocalFields(next);
  };

  const removeField = (idx: number) => {
    const f = localFields[idx];
    const used = matches.some((m) => m.field === f);
    if (used) {
      toast.error(t("fields.removeUsed"));
      return;
    }
    setLocalFields(localFields.filter((_, i) => i !== idx));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= localFields.length) return;
    const next = [...localFields];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLocalFields(next);
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(i18n.language === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Settings card */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{t("fields.title")}</h2>
        </div>

        <div className="space-y-2">
          {localFields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveField(i, -1)}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  aria-label={t("fields.moveUp")}
                >
                  <GripVertical className="h-3 w-3 rotate-90" />
                </button>
              </div>
              <Input
                value={f}
                onChange={(e) => renameField(i, e.target.value)}
                maxLength={60}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeField(i)}
                aria-label={t("fields.remove")}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {localFields.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("fields.none")}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            placeholder={t("fields.newPlaceholder")}
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addField();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addField}>
            <Plus className="h-4 w-4" />
            {t("fields.add")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label className="text-xs">{t("fields.dayStart")}</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t("fields.dayEnd")}</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending || localFields.length === 0}
          >
            {saveSettings.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t("fields.save")}
          </Button>
        </div>
      </section>

      {/* Per-field planning */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">{t("fields.planningTitle")}</h2>
        </div>

        {localFields.map((f) => {
          const list = matchesByField.get(f) ?? [];
          return (
            <div
              key={f}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="px-4 py-2 bg-muted/40 flex items-center justify-between">
                <span className="font-medium text-sm">{f}</span>
                <span className="text-xs text-muted-foreground">
                  {t("fields.matchCount", { count: list.length })}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  {t("fields.noneAssigned")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((m) => (
                    <li
                      key={m.id}
                      className="px-4 py-2.5 flex items-center gap-3"
                    >
                      <div className="text-xs text-muted-foreground w-28 shrink-0">
                        {formatTime(m.scheduled_at)}
                      </div>
                      <div className="flex-1 min-w-0 text-sm truncate">
                        <span className="text-muted-foreground mr-2">
                          #{m.match_number}
                        </span>
                        {teamName(m.team_a_id)}{" "}
                        <span className="text-muted-foreground">vs</span>{" "}
                        {teamName(m.team_b_id)}
                      </div>
                      <Select
                        value={m.field ?? UNASSIGNED}
                        onValueChange={(v) =>
                          reassign.mutate({
                            matchId: m.id,
                            field: v === UNASSIGNED ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>
                            {t("fields.unassigned")}
                          </SelectItem>
                          {localFields.map((ff) => (
                            <SelectItem key={ff} value={ff}>
                              {ff}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {(matchesByField.get(UNASSIGNED) ?? []).length > 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card overflow-hidden">
            <div className="px-4 py-2 bg-muted/20 flex items-center justify-between">
              <span className="font-medium text-sm">{t("fields.unassignedSection")}</span>
              <span className="text-xs text-muted-foreground">
                {(matchesByField.get(UNASSIGNED) ?? []).length}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {(matchesByField.get(UNASSIGNED) ?? []).map((m) => (
                <li key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="text-xs text-muted-foreground w-28 shrink-0">
                    {formatTime(m.scheduled_at)}
                  </div>
                  <div className="flex-1 min-w-0 text-sm truncate">
                    <span className="text-muted-foreground mr-2">
                      #{m.match_number}
                    </span>
                    {teamName(m.team_a_id)}{" "}
                    <span className="text-muted-foreground">vs</span>{" "}
                    {teamName(m.team_b_id)}
                  </div>
                  <Select
                    value={UNASSIGNED}
                    onValueChange={(v) =>
                      reassign.mutate({
                        matchId: m.id,
                        field: v === UNASSIGNED ? null : v,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue placeholder={t("fields.assignPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>{t("fields.unassigned")}</SelectItem>
                      {localFields.map((ff) => (
                        <SelectItem key={ff} value={ff}>
                          {ff}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
