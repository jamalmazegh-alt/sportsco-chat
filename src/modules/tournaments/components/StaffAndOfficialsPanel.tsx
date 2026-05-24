import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserCog, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollaboratorsManager } from "./CollaboratorsManager";
import { MembersManager } from "./MembersManager";

type SubTab = "organizers" | "officials";

export function StaffAndOfficialsPanel({
  tournamentId,
  matches,
  teams,
}: {
  tournamentId: string;
  matches: any[];
  teams: any[];
}) {
  const { t } = useTranslation("tournaments");
  const [sub, setSub] = useState<SubTab>("organizers");

  const subs: { id: SubTab; label: string; icon: any }[] = [
    {
      id: "organizers",
      label: t("staff.organizers", { defaultValue: "Équipe d'organisation" }),
      icon: UserCog,
    },
    {
      id: "officials",
      label: t("staff.officials", { defaultValue: "Arbitres & bénévoles" }),
      icon: UserPlus,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border bg-muted/30 p-1">
        {subs.map((s) => {
          const Icon = s.icon;
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {sub === "organizers" && (
        <CollaboratorsManager tournamentId={tournamentId} />
      )}
      {sub === "officials" && (
        <MembersManager
          tournamentId={tournamentId}
          matches={matches}
          teams={teams}
        />
      )}
    </div>
  );
}
