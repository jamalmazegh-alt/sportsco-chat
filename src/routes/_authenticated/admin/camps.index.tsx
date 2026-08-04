import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import i18nInstance from "@/lib/i18n";
import { Loader2, Plus, MapPin, CalendarDays, Users, Search } from "lucide-react";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampCreateChooser } from "@/components/camps/CampCreateChooser";
import { listClubCamps, type ClubCamp } from "@/lib/camps.functions";

export const Route = createFileRoute("/_authenticated/admin/camps/")({
  component: CampsListPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("camps:meta.list.title"),
      },
      {
        name: "description",
        content: i18nInstance.t("camps:meta.list.description"),
      },
    ],
  }),
});

const MANAGER_ROLES = new Set(["admin", "dirigeant", "coach"]);

type StatusFilter = "all" | ClubCamp["status"];
type SortMode = "startDesc" | "startAsc" | "titleAsc" | "createdDesc";

function statusTone(status: ClubCamp["status"]): string {
  switch (status) {
    case "published":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "closed":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "archived":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

function CampsListPage() {
  const { t } = useTranslation("camps");
  const { activeClubId } = useAuth();
  const roles = useMyRoles();

  const canManage = roles.some((r) => MANAGER_ROLES.has(r));
  const listFn = useServerFn(listClubCamps);

  const {
    data: camps,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["club-camps", activeClubId],
    queryFn: () => listFn({ data: { clubId: activeClubId!, includeArchived: true } }),
    enabled: !!activeClubId,
  });

  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("startDesc");
  const [search, setSearch] = useState("");

  const displayed = useMemo(() => {
    const all = camps ?? [];
    const q = search.trim().toLowerCase();
    const filtered = all.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      switch (sortMode) {
        case "startAsc":
          return a.start_date.localeCompare(b.start_date);
        case "titleAsc":
          return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        case "createdDesc":
          return b.created_at.localeCompare(a.created_at);
        case "startDesc":
        default:
          return b.start_date.localeCompare(a.start_date);
      }
    });
    return sorted;
  }, [camps, statusFilter, sortMode, search]);

  if (!canManage) return <Navigate to="/profile" replace />;

  const totalCount = camps?.length ?? 0;
  const showingCount = displayed.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("list.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("list.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t("list.new")}
        </Button>
      </div>

      {/* Filters / sort */}
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.status.all")}</SelectItem>
              <SelectItem value="draft">{t("status.draft")}</SelectItem>
              <SelectItem value="published">{t("status.published")}</SelectItem>
              <SelectItem value="closed">{t("status.closed")}</SelectItem>
              <SelectItem value="archived">{t("status.archived")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="startDesc">{t("filters.sort.startDesc")}</SelectItem>
              <SelectItem value="startAsc">{t("filters.sort.startAsc")}</SelectItem>
              <SelectItem value="titleAsc">{t("filters.sort.titleAsc")}</SelectItem>
              <SelectItem value="createdDesc">{t("filters.sort.createdDesc")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground ml-auto">
            {t("filters.count", {
              defaultValue: "{{shown}} / {{total}}",
              shown: showingCount,
              total: totalCount,
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground space-y-4">
          <p>{t("list.empty")}</p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("list.new")}
          </Button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("filters.noResults")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {displayed.map((c) => (
            <li key={c.id}>
              <Link
                to="/admin/camps/$campId"
                params={{ campId: c.id }}
                className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(c.start_date).toLocaleDateString()} →{" "}
                        {new Date(c.end_date).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {c.capacity}
                      </span>
                      {c.venue_id && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {t("list.hasVenue")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={statusTone(c.status)}>
                    {t(`status.${c.status}`, { defaultValue: c.status })}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {activeClubId && (
        <CampCreateChooser
          clubId={activeClubId}
          open={creating}
          onOpenChange={setCreating}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}
