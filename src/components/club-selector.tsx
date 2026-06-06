"use client";

import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RoleKey = "admin" | "coach" | "assistant_coach" | "dirigeant" | "parent" | "player";

const ROLE_PRIORITY: RoleKey[] = ["admin", "coach", "assistant_coach", "dirigeant", "parent", "player"];

function pickPrimaryRole(roles: string[] | undefined, fallback: string): RoleKey {
  const all = new Set<string>(roles && roles.length ? roles : [fallback]);
  for (const r of ROLE_PRIORITY) if (all.has(r)) return r;
  return (fallback as RoleKey) ?? "player";
}

function RoleBadge({ role, className }: { role: RoleKey; className?: string }) {
  const { t } = useTranslation();
  const label = t(`roles.${role}`, {
    defaultValue:
      role === "admin"
        ? "Admin"
        : role === "coach"
        ? "Coach"
        : role === "assistant_coach"
        ? "Adj."
        : role === "dirigeant"
        ? "Dirig."
        : role === "parent"
        ? "Parent"
        : "Joueur",
  });
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide leading-none",
        "border-primary/30 bg-primary/10 text-primary",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ClubSelector({ className }: { className?: string }) {
  const { memberships, activeClubId, setActiveClubId } = useAuth();
  const { t } = useTranslation();
  const active = memberships.find((m) => m.club_id === activeClubId);
  const activeRole = active ? pickPrimaryRole(active.roles, active.role) : null;

  if (memberships.length === 0) return null;
  if (memberships.length === 1 && !active?.club.logo_url) {
    // Single club, no logo: subtle text + role badge (replaces the old "·" separator).
    return (
      <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
        <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
          {active?.club.name}
        </span>
        {activeRole && <RoleBadge role={activeRole} />}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
          aria-label={t("clubSelector.label", { defaultValue: "Changer de club" })}
        >
          {active?.club.logo_url ? (
            <img
              src={active.club.logo_url}
              alt=""
              className="h-5 w-5 rounded-sm object-cover"
            />
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="max-w-[100px] truncate hidden sm:inline">
            {active?.club.name ?? t("clubSelector.noClub")}
          </span>
          {activeRole && <RoleBadge role={activeRole} className="hidden sm:inline-flex" />}
          {memberships.length > 1 && (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      {memberships.length > 1 && (
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("clubSelector.title", { defaultValue: "Mes clubs" })}
          </div>
          {memberships.map((m) => {
            const isActive = m.club_id === activeClubId;
            const role = pickPrimaryRole(m.roles, m.role);
            return (
              <DropdownMenuItem
                key={m.club_id}
                onClick={() => setActiveClubId(m.club_id)}
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  isActive && "bg-accent font-medium"
                )}
              >
                {m.club.logo_url ? (
                  <img
                    src={m.club.logo_url}
                    alt=""
                    className="h-5 w-5 rounded-sm object-cover"
                  />
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{m.club.name}</span>
                <RoleBadge role={role} />
                {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
