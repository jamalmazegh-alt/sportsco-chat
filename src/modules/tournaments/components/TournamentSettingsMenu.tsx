import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Info,
  Shuffle,
  ClipboardList,
  CreditCard,
  MapPin,
  Share2,
  Settings2,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroupsAndFixtures } from "./GroupsAndFixtures";
import { RegistrationSettingsPanel } from "./RegistrationSettingsPanel";
import { PaymentSettingsPanel } from "./PaymentSettingsPanel";
import { FieldsManager } from "./FieldsManager";
import { TournamentRulesEditor } from "./TournamentRulesEditor";
import { ShareDialog } from "./ShareDialog";

type Topic = "infos" | "format" | "registrations" | "payments" | "fields" | "share";

interface Props {
  tournament: any;
  teams: any[];
  matches: any[];
  groups: any[];
  publicUrl: string;
}

const TOPICS: { id: Topic; icon: typeof Info; labelKey: string; defaultLabel: string }[] = [
  { id: "infos", icon: Info, labelKey: "controlCenter.settings.infos", defaultLabel: "Informations & règles" },
  { id: "format", icon: Shuffle, labelKey: "controlCenter.settings.format", defaultLabel: "Format" },
  { id: "registrations", icon: ClipboardList, labelKey: "controlCenter.settings.registrations", defaultLabel: "Inscriptions" },
  { id: "payments", icon: CreditCard, labelKey: "controlCenter.settings.payments", defaultLabel: "Paiement" },
  { id: "fields", icon: MapPin, labelKey: "controlCenter.settings.fields", defaultLabel: "Terrains" },
  { id: "share", icon: Share2, labelKey: "controlCenter.settings.share", defaultLabel: "Partage" },
];

export function TournamentSettingsMenu({
  tournament,
  teams,
  matches,
  groups,
  publicUrl,
}: Props) {
  const { t } = useTranslation("tournaments");
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTopic(null);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("controlCenter.settings.title", { defaultValue: "Configuration" })}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-border flex-row items-center gap-2 space-y-0">
          {topic && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTopic(null)}
              aria-label={t("common.back", { defaultValue: "Retour" })}
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          )}
          <SheetTitle className="text-base">
            {topic
              ? t(TOPICS.find((x) => x.id === topic)!.labelKey, {
                  defaultValue: TOPICS.find((x) => x.id === topic)!.defaultLabel,
                })
              : t("controlCenter.settings.title", { defaultValue: "Configuration" })}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {topic === null && (
            <ul className="p-2">
              {TOPICS.map(({ id, icon: Icon, labelKey, defaultLabel }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setTopic(id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left",
                      "hover:bg-muted/60 transition-colors",
                    )}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">
                      {t(labelKey, { defaultValue: defaultLabel })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {topic === "infos" && (
            <div className="p-4">
              <TournamentRulesEditor
                tournamentId={tournament.id}
                settings={tournament.settings}
                sport={tournament.sport}
              />
            </div>
          )}

          {topic === "format" && (
            <div className="p-4">
              <GroupsAndFixtures
                view="format"
                tournamentId={tournament.id}
                format={tournament.format}
                status={tournament.status}
                numTeams={teams.length}
                teams={teams}
                groupsCount={groups.length}
                matchesCount={matches.length}
                startsOn={tournament.starts_on}
                matchDurationMin={tournament.match_duration_min}
                breakMin={tournament.break_min}
                dailyStartTime={tournament.daily_start_time}
                dailyEndTime={tournament.daily_end_time}
                fields={tournament.fields}
                settings={tournament.settings}
              />
            </div>
          )}

          {topic === "registrations" && (
            <div className="p-4">
              <RegistrationSettingsPanel
                tournamentId={tournament.id}
                tournamentSlug={tournament.slug}
                settings={tournament.settings}
              />
            </div>
          )}

          {topic === "payments" && (
            <div className="p-4">
              <PaymentSettingsPanel
                tournamentId={tournament.id}
                clubId={tournament.club_id ?? null}
                stripeAccountId={tournament.club_stripe_account_id ?? null}
                initial={{
                  registration_fee: tournament.registration_fee ?? 0,
                  registration_currency: tournament.registration_currency ?? "eur",
                  registration_fee_description: tournament.registration_fee_description ?? null,
                  payment_mode: tournament.payment_mode ?? "offline",
                }}
              />
            </div>
          )}

          {topic === "fields" && (
            <div className="p-4">
              <FieldsManager
                tournamentId={tournament.id}
                fields={tournament.fields}
                dailyStartTime={tournament.daily_start_time}
                dailyEndTime={tournament.daily_end_time}
                matches={matches}
                teams={teams}
              />
            </div>
          )}

          {topic === "share" && (
            <div className="p-4 space-y-3">
              <ShareDialog url={publicUrl} title={tournament.name} />
              <a
                href={`/tournament/${tournament.slug}`}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
              >
                {t("detail.viewPublic", { defaultValue: "Voir la page publique" })}
              </a>
              <a
                href={`/tournament/${tournament.slug}/tv`}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60"
              >
                {t("sections.openTv", { defaultValue: "Ouvrir l'écran live (TV)" })}
              </a>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
