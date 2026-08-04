/**
 * Read-only view of assigned staff for an event.
 *
 * Rendered for parents / players (non-coaches). Data comes from the event's
 * embedded `event_staff_assignments` — no extra RPC calls, no interactive
 * controls. Hidden when no staff has been assigned yet.
 */
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Row = {
  user_id: string;
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null;
};

export function StaffAssignmentReadOnly({
  assignments,
}: {
  assignments: Row[] | null | undefined;
}) {
  const { t } = useTranslation();
  const names = (assignments ?? [])
    .map((r) => {
      const p = r.profiles ?? {};
      const built = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      return built || p.full_name || "";
    })
    .filter(Boolean);

  if (names.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{t("staffAssignment.title")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("staffAssignment.readOnlyHint")}</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {names.map((name, i) => (
          <li key={i} className="py-2 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{name}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
