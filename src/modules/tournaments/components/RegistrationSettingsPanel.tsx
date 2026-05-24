import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Save, Loader2, ExternalLink, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { mergeRules, type TournamentRules } from "../lib/rules";
import { updateTournamentRules } from "../tournaments.functions";

interface Props {
  tournamentId: string;
  tournamentSlug: string;
  settings: unknown;
}

export function RegistrationSettingsPanel({
  tournamentId,
  tournamentSlug,
  settings,
}: Props) {
  const { t } = useTranslation("tournaments");
  const initial = useMemo(() => mergeRules(settings), [settings]);
  const [rules, setRules] = useState<TournamentRules>(initial);
  const updateFn = useServerFn(updateTournamentRules);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { tournament_id: tournamentId, rules: rules as any } }),
    onSuccess: () => {
      toast.success(t("rules.savedToast"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("rules.errorToast")),
  });

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/tournament/${tournamentSlug}`
      : `/tournament/${tournamentSlug}`;
  const registerUrl = `${publicUrl}/register`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registerUrl);
      toast.success(t("registrationSettings.linkCopied", { defaultValue: "Lien copié" }));
    } catch {
      toast.error(t("common.error", { defaultValue: "Erreur" }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("registrationSettings.title", { defaultValue: "Inscriptions en ligne" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-0">
              <Label className="text-sm">
                {t("registrationSettings.enableLabel", {
                  defaultValue: "Ouvrir les inscriptions au public",
                })}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("registrationSettings.enableHint", {
                  defaultValue:
                    "Active un bouton « S'inscrire » sur la page publique du tournoi.",
                })}
              </p>
            </div>
            <Switch
              checked={rules.registration.enabled}
              onCheckedChange={(v) =>
                setRules({
                  ...rules,
                  registration: { ...rules.registration, enabled: v },
                })
              }
            />
          </div>

          {rules.registration.enabled && (
            <>
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("registrationSettings.publicLink", {
                    defaultValue: "Lien public d'inscription",
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-background border rounded px-2 py-1.5 flex-1 truncate">
                    {registerUrl}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={registerUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("rules.opensAt")}</Label>
                  <Input
                    type="datetime-local"
                    value={rules.registration.opensAt ?? ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          opensAt: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("rules.closesAt")}</Label>
                  <Input
                    type="datetime-local"
                    value={rules.registration.closesAt ?? ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          closesAt: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("rules.maxTeams")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={rules.registration.maxTeams ?? 0}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        registration: {
                          ...rules.registration,
                          maxTeams: parseInt(e.target.value, 10) || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between text-sm">
                    <span>{t("rules.approval")}</span>
                    <Switch
                      checked={rules.registration.requiresApproval}
                      onCheckedChange={(v) =>
                        setRules({
                          ...rules,
                          registration: {
                            ...rules.registration,
                            requiresApproval: v,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between text-sm">
                    <span>{t("rules.collectPlayers")}</span>
                    <Switch
                      checked={rules.registration.collectPlayers}
                      onCheckedChange={(v) =>
                        setRules({
                          ...rules,
                          registration: {
                            ...rules.registration,
                            collectPlayers: v,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("rules.publicMessage")}</Label>
                <Input
                  value={rules.registration.publicMessage ?? ""}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      registration: {
                        ...rules.registration,
                        publicMessage: e.target.value,
                      },
                    })
                  }
                  maxLength={300}
                  placeholder={t("rules.publicMessagePlaceholder")}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
