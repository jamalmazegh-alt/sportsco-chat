import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PhoneInput } from "@/components/phone-input";
import { SportSelect } from "@/components/sport-select";
import { AgeGroupSelect } from "@/components/age-group-select";
import { isCanonicalTeamAgeCategory } from "@/lib/team-age-group";
import { PositionCombobox } from "@/components/position-combobox";
import { notifyCoachAssigned } from "@/lib/coach-notify.functions";
import { createSignedTeamImageUpload, updateTeamImageFromUpload } from "@/lib/team-image.functions";
import { sendPlayerInvitations, listTeamInviteFailures } from "@/lib/team-invitations.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Plus,
  UserCircle2,
  Loader2,
  Camera,
  Pencil,
  Send,
  X,
  CheckSquare,
  Trash2,
  Download,
  Upload,
  BarChart3,
  Trophy,
  Lock as LockIcon,
} from "lucide-react";

import { BackLink } from "@/components/back-link";
import { toCsv, downloadCsv } from "@/lib/csv";
import { ImportPlayersCsvDialog } from "@/components/import-players-csv-dialog";
import { ExistingPlayerPicker } from "@/components/existing-player-picker";
import { SwipeableRow } from "@/components/swipeable-row";
import { TeamAttendanceStats } from "@/components/team-attendance-stats";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";

import { UpcomingAbsencesWidget } from "@/components/upcoming-absences-widget";
import { TeamChampionshipsSection } from "@/components/team-championships-section";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Archive, ArchiveRestore, CalendarDays } from "lucide-react";

import { TeamInviteShareButton } from "@/components/team-invite-share-button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import i18n from "@/lib/i18n";
import { CallUpVisibilityField } from "@/components/call-up-visibility-field";

export const Route = createFileRoute("/_authenticated/teams/$teamId")({
  component: TeamDetail,
  head: () => ({
    meta: [
      { title: i18n.t("meta.team.title") },
      { name: "description", content: i18n.t("meta.team.description") },
    ],
  }),
});

type RespondBy = "player" | "parent" | "both";

function TeamDetail() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();
  const { activeClubId, user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const sendPlayerInvitationsFn = useServerFn(sendPlayerInvitations);
  const listTeamInviteFailuresFn = useServerFn(listTeamInviteFailures);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isStatsRoute = pathname.endsWith("/stats");
  const isAvailabilityRoute = pathname.endsWith("/availability");
  const isSubRoute = isStatsRoute || isAvailabilityRoute;

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select(
          "id, name, age_group, championship, competitions, sport, season, image_url, club_id, archived_at, is_internal",
        )
        .eq("id", teamId)
        .single();
      return data;
    },
  });

  const { data: clubTeamCount } = useQuery({
    queryKey: ["club-team-count", activeClubId],
    queryFn: async () => {
      if (!activeClubId) return 0;
      const { count, error } = await supabase
        .from("teams")
        .select("id", { count: "exact" })
        .eq("club_id", activeClubId)
        .is("archived_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!activeClubId,
  });

  const isArchived = !!team?.archived_at;

  const { data: teamHasHistory } = useQuery({
    queryKey: ["team-has-history", teamId],
    enabled: isAdmin && !!team,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_has_history", { _id: teamId });
      if (error) throw error;
      return !!data;
    },
  });

  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(false);
  const [confirmArchiveTeam, setConfirmArchiveTeam] = useState(false);
  const [teamActionBusy, setTeamActionBusy] = useState(false);

  async function onDeleteTeam() {
    if (!team) return;
    setTeamActionBusy(true);
    const { error } = await supabase.rpc("delete_team_if_empty", { _id: teamId });
    setTeamActionBusy(false);
    setConfirmDeleteTeam(false);
    if (error) {
      if ((error.message ?? "").includes("team_has_history")) {
        toast.error(t("teams.deleteBlockedHasHistory"));
        qc.invalidateQueries({ queryKey: ["team-has-history", teamId] });
        return;
      }
      toast.error(error.message);
      return;
    }
    toast(t("teams.deleted"), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("restore_entity", {
            _kind: "team",
            _id: teamId,
          });
          if (e2) toast.error(e2.message);
          else {
            qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
            qc.invalidateQueries({ queryKey: ["teams"] });
          }
        },
      },
    });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    navigate({ to: "/teams" });
  }

  async function onArchiveTeam() {
    setTeamActionBusy(true);
    const { error } = await supabase.rpc("archive_team", { _id: teamId });
    setTeamActionBusy(false);
    setConfirmArchiveTeam(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast(t("teams.archived"), {
      action: {
        label: t("common.undo", { defaultValue: "Undo" }),
        onClick: async () => {
          const { error: e2 } = await supabase.rpc("unarchive_team", { _id: teamId });
          if (e2) toast.error(e2.message);
          else {
            qc.invalidateQueries({ queryKey: ["team", teamId] });
            qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
          }
        },
      },
    });
    qc.invalidateQueries({ queryKey: ["team", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  }

  async function onUnarchiveTeam() {
    setTeamActionBusy(true);
    const { error } = await supabase.rpc("unarchive_team", { _id: teamId });
    setTeamActionBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("teams.unarchived"));
    qc.invalidateQueries({ queryKey: ["team", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  }

  const { data: players, isLoading } = useQuery({
    queryKey: ["team-players", teamId],
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("team_members")
        .select(
          "player_id, players:player_id(id, first_name, last_name, jersey_number, license_number, preferred_position, photo_url, user_id, email, phone, birth_date, child_platform_access, deleted_at)",
        )
        .eq("team_id", teamId)
        .eq("role", "player");
      const seenIds = new Set<string>();
      const byKey = new Map<string, any>();
      const norm = (s: string | null | undefined) =>
        (s ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const score = (p: any) =>
        (p.jersey_number != null ? 4 : 0) +
        (p.license_number ? 2 : 0) +
        (p.photo_url ? 1 : 0) +
        (p.preferred_position ? 1 : 0);
      for (const r of tm ?? []) {
        const p = (r as any).players;
        if (!p || p.deleted_at || seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        const key = p.license_number
          ? `lic:${norm(p.license_number)}`
          : `nm:${norm(p.first_name)}|${norm(p.last_name)}`;
        const prev = byKey.get(key);
        if (!prev || score(p) > score(prev)) byKey.set(key, p);
      }
      return Array.from(byKey.values()).sort((a: any, b: any) =>
        (a.last_name ?? "").localeCompare(b.last_name ?? ""),
      );
    },
  });

  // Active suspensions for players in this team, used to display unavailability badge.
  const { data: activeSuspensionsByPlayer } = useQuery({
    queryKey: ["team-active-suspensions", teamId],
    enabled: !!players && players.length > 0,
    queryFn: async () => {
      const ids = (players ?? []).map((p: any) => p.id);
      if (ids.length === 0) return new Map<string, { remaining: number; reason: string }>();
      const { data } = await supabase
        .from("player_suspensions")
        .select("player_id, matches_to_serve, matches_served, suspension_reason, status")
        .in("player_id", ids)
        .eq("team_id", teamId)
        .eq("status", "active");
      const map = new Map<string, { remaining: number; reason: string }>();
      for (const row of (data ?? []) as any[]) {
        const remaining = Math.max(0, (row.matches_to_serve ?? 0) - (row.matches_served ?? 0));
        if (remaining <= 0) continue;
        const prev = map.get(row.player_id);
        if (!prev || remaining > prev.remaining) {
          map.set(row.player_id, { remaining, reason: row.suspension_reason });
        }
      }
      return map;
    },
  });

  // Active absences (player_availabilities) overlapping today — badge in roster.
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: activeAbsencesByPlayer } = useQuery({
    queryKey: ["team-active-absences", teamId, todayStr],
    enabled: !!players && players.length > 0,
    queryFn: async () => {
      const ids = (players ?? []).map((p: any) => p.id);
      if (ids.length === 0) return new Map<string, UnavailableReason>();
      const { data, error } = await supabase
        .from("player_availabilities")
        .select("player_id, reason")
        .in("player_id", ids)
        .eq("status", "active")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr);
      if (error) throw error;
      const map = new Map<string, UnavailableReason>();
      for (const row of (data ?? []) as { player_id: string; reason: string }[]) {
        map.set(row.player_id, row.reason as UnavailableReason);
      }
      return map;
    },
  });

  // Pending (unused) invites for the team's players, keyed by playerId, with
  // the contact points (email/phone) already invited so we can avoid blocking
  // a player when only *some* of its contacts have been invited/accepted.
  const { data: pendingInvitesByPlayer, isPending: pendingInvitesLoading } = useQuery({
    queryKey: ["team-pending-invites", teamId, activeClubId],
    enabled: !!activeClubId && !!players && players.length > 0 && isCoach,
    queryFn: async () => {
      const ids = (players ?? []).map((p: any) => p.id);
      const map = new Map<string, { emails: Set<string>; phones: Set<string> }>();
      if (ids.length === 0) return map;
      const { data } = await supabase
        .from("member_invites")
        .select("player_id, parent_for_player_id, email, phone, used_at")
        .eq("club_id", activeClubId!)
        .is("used_at", null);
      (data ?? []).forEach((r: any) => {
        const pid = r.player_id ?? r.parent_for_player_id;
        if (!pid || !ids.includes(pid)) return;
        if (!map.has(pid)) map.set(pid, { emails: new Set(), phones: new Set() });
        const entry = map.get(pid)!;
        if (r.email) entry.emails.add(String(r.email).toLowerCase().trim());
        if (r.phone) entry.phones.add(String(r.phone).trim());
      });
      return map;
    },
  });

  // Failed invite emails per player (bounced/failed/dlq/complained/suppressed).
  const { data: inviteFailuresByPlayer, isPending: inviteFailuresLoading } = useQuery({
    queryKey: ["team-invite-failures", teamId, activeClubId],
    enabled: !!activeClubId && !!players && players.length > 0 && isCoach,
    queryFn: async () => {
      try {
        const r = await listTeamInviteFailuresFn({ data: { teamId } });
        return r.failuresByPlayer ?? {};
      } catch (e) {
        console.error("listTeamInviteFailures failed", e);
        return {} as Record<
          string,
          Array<{ email: string; status: string; error: string | null; at: string }>
        >;
      }
    },
  });

  // Parents grouped by player — used to know which contacts remain to invite.
  const { data: parentsByPlayer, isPending: parentsByPlayerLoading } = useQuery({
    queryKey: ["team-parents-by-player", teamId],
    enabled: !!players && players.length > 0 && isCoach,
    queryFn: async () => {
      const ids = (players ?? []).map((p: any) => p.id);
      const map = new Map<
        string,
        Array<{ email: string | null; phone: string | null; parent_user_id: string | null }>
      >();
      if (ids.length === 0) return map;
      const { data } = await supabase
        .from("player_parents")
        .select("player_id, email, phone, parent_user_id")
        .in("player_id", ids);
      (data ?? []).forEach((r: any) => {
        if (!map.has(r.player_id)) map.set(r.player_id, []);
        map.get(r.player_id)!.push({
          email: r.email ?? null,
          phone: r.phone ?? null,
          parent_user_id: r.parent_user_id ?? null,
        });
      });
      return map;
    },
  });

  // Players linked to the current user (as player or parent) — pinned at top
  // when the viewer is not a coach.
  const { data: myPlayerIds } = useQuery({
    queryKey: ["team-my-player-ids", teamId, user?.id],
    enabled: !!user && !isCoach && !!players && players.length > 0,
    queryFn: async () => {
      const set = new Set<string>();
      for (const p of (players ?? []) as any[]) {
        if (p.user_id && p.user_id === user!.id) set.add(p.id);
      }
      const ids = (players ?? []).map((p: any) => p.id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("player_parents")
          .select("player_id")
          .eq("parent_user_id", user!.id)
          .in("player_id", ids);
        (data ?? []).forEach((r: any) => set.add(r.player_id));
      }
      return set;
    },
  });

  // Selection state for bulk invitations
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Add player form state
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [license, setLicense] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [parentFirst, setParentFirst] = useState("");
  const [parentLast, setParentLast] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [respondBy, setRespondBy] = useState<RespondBy>("both");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [addMode, setAddMode] = useState<"new" | "existing">("new");

  const minor = (() => {
    if (!birthDate) return false;
    const d = new Date(birthDate);
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age < 18;
  })();

  // Edit team form state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  // editChamp removed — championships are managed via TeamChampionshipsSection.
  const [editCompetitions, setEditCompetitions] = useState(["friendly", "championship", "cup"]);
  const [editSeason, setEditSeason] = useState("");
  const [editSport, setEditSport] = useState("");
  const [editWhatsappUrl, setEditWhatsappUrl] = useState("");
  const [editCommMode, setEditCommMode] = useState<"app" | "whatsapp" | "hybrid">("app");
  const [editBusy, setEditBusy] = useState(false);

  function openEdit() {
    setEditName(team?.name ?? "");
    setEditAge(team?.age_group ?? "");
    // championship handled by TeamChampionshipsSection (teams.championship deprecated)
    setEditCompetitions((team as any)?.competitions ?? ["friendly", "championship", "cup"]);
    setEditSeason(team?.season ?? "");
    setEditSport(team?.sport ?? "");
    setEditWhatsappUrl((team as any)?.whatsapp_group_url ?? "");
    setEditCommMode(((team as any)?.communication_mode as any) ?? "app");
    setEditOpen(true);
  }

  function toggleEditCompetition(value: string, checked: boolean) {
    setEditCompetitions((current) =>
      checked ? Array.from(new Set([...current, value])) : current.filter((c) => c !== value),
    );
  }

  async function onSaveTeam(e: FormEvent) {
    e.preventDefault();
    const isInternalTeam = Boolean((team as { is_internal?: boolean } | null)?.is_internal);
    // Équipe technique « Réunions internes » : pas de catégorie sportive.
    if (!isInternalTeam && !isCanonicalTeamAgeCategory(editAge)) {
      toast.error(
        t("teams.ageGroupRequired", {
          defaultValue: "Choisissez une catégorie d'âge dans la liste officielle.",
        }),
      );
      return;
    }
    setEditBusy(true);
    // NOTE: teams.championship is deprecated (kept for backward compatibility).
    // New writes go to team_championships via TeamChampionshipsSection.
    const { error } = await supabase
      .from("teams")
      .update({
        name: editName,
        age_group: isInternalTeam ? null : editAge,
        championship: null,
        competitions: editCompetitions,
        season: editSeason || null,
        sport: editSport || null,
        whatsapp_group_url: editWhatsappUrl.trim() || null,
        communication_mode: editCommMode,
      } as any)
      .eq("id", teamId);
    setEditBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["team", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    toast.success(t("common.saved"));
  }

  function reset() {
    setFirst("");
    setLast("");
    setJersey("");
    setLicense("");
    setPosition("");
    setPhone("");
    setEmail("");
    setBirthDate("");
    setParentFirst("");
    setParentLast("");
    setParentPhone("");
    setParentEmail("");
    setRespondBy("both");
    setPhotoFile(null);
  }

  async function uploadPhoto(playerId: string, file: File): Promise<string | null> {
    // Limite côté client : refuse > 5 Mo (le bucket impose aussi la limite côté serveur)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("players.photoTooLarge", { defaultValue: "Photo trop lourde (max 5 Mo)." }));
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(
        t("players.photoInvalidType", { defaultValue: "Format de fichier non supporté." }),
      );
      return null;
    }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${activeClubId}/${playerId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("player-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast.error(upErr.message);
      return null;
    }
    const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function sendInvitesForPlayer(playerId: string): Promise<{
    sent: number;
    failed: number;
    skipped: number;
    reason?: "no_contact" | "already_active";
    suppressedEmails?: string[];
    suppressedDetails?: { email: string; reason: string | null }[];
  }> {
    if (!activeClubId || !user) return { sent: 0, failed: 0, skipped: 1, reason: "no_contact" };
    try {
      return await sendPlayerInvitationsFn({ data: { teamId, playerId } });
    } catch (error) {
      console.error("sendInvitesForPlayer failed", error);
      return { sent: 0, failed: 1, skipped: 0 };
    }
  }

  function toastSuppressed(
    details: { email: string; reason: string | null }[],
    fallbackEmails: string[],
  ) {
    const emails = details.length ? details.map((d) => d.email) : fallbackEmails;
    const count = emails.length;
    toast.error(
      t("players.inviteSuppressedSimple", {
        defaultValue:
          "{{count}} invitation(s) bloquée(s) : l'adresse est en suppression (bounce, spam ou désinscription). Corrigez l'e-mail ou contactez le support.",
        count,
      }),
    );
  }

  async function inviteOne(playerId: string) {
    if (!user) return;
    setInviting(true);
    const r = await sendInvitesForPlayer(playerId);
    setInviting(false);
    const suppressed = r.suppressedEmails ?? [];
    if (suppressed.length > 0 && !r.sent) {
      toastSuppressed(r.suppressedDetails ?? [], suppressed);
    } else if (r.skipped)
      toast.warning(
        t(
          r.reason === "already_active" ? "players.inviteAlreadyActive" : "players.inviteNoContact",
        ),
      );
    else if (r.failed && !r.sent) toast.error(t("players.inviteFailed"));
    else if (r.failed)
      toast.warning(t("players.invitePartial", { sent: r.sent, failed: r.failed }));
    else toast.success(t("players.inviteSent"));
    qc.invalidateQueries({ queryKey: ["team-pending-invites", teamId] });
    qc.invalidateQueries({ queryKey: ["team-invite-failures", teamId] });
  }

  async function removeFromTeam(playerId: string, fullName: string) {
    if (
      !confirm(
        t("players.removeConfirm", {
          defaultValue: `Retirer ${fullName} de l'équipe ?`,
          name: fullName,
        }),
      )
    )
      return;
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("player_id", playerId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("players.removed"));
    qc.invalidateQueries({ queryKey: ["team-players", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
  }

  async function inviteSelected() {
    if (!user || selectedIds.size === 0) return;
    setInviting(true);
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let alreadyActiveSkipped = 0;
    let noContactSkipped = 0;
    const allSuppressed: string[] = [];
    const allSuppressedDetails: { email: string; reason: string | null }[] = [];
    for (const id of selectedIds) {
      const r = await sendInvitesForPlayer(id);
      totalSent += r.sent;
      totalFailed += r.failed;
      totalSkipped += r.skipped;
      if (r.reason === "already_active") alreadyActiveSkipped += r.skipped;
      if (r.reason === "no_contact") noContactSkipped += r.skipped;
      if (r.suppressedEmails?.length) allSuppressed.push(...r.suppressedEmails);
      if (r.suppressedDetails?.length) allSuppressedDetails.push(...r.suppressedDetails);
    }
    setInviting(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    if (allSuppressed.length > 0) {
      toastSuppressed(allSuppressedDetails, allSuppressed);
    }

    if (totalSent === 0 && totalFailed === 0)
      toast.warning(
        t(
          alreadyActiveSkipped >= noContactSkipped
            ? "players.inviteAlreadyActive"
            : "players.inviteNoContact",
        ),
      );
    else if (totalFailed)
      toast.warning(
        t("players.inviteBulkResult", {
          sent: totalSent,
          failed: totalFailed,
          skipped: totalSkipped,
        }),
      );
    else toast.success(t("players.inviteBulkSent", { count: totalSent }));
    qc.invalidateQueries({ queryKey: ["team-pending-invites", teamId] });
    qc.invalidateQueries({ queryKey: ["team-invite-failures", teamId] });
  }

  // Helper used only for secondary labels. Sending eligibility is decided on
  // the server so stale/orphaned invite rows cannot grey out retries.
  const hasOpenContact = useCallback(
    (p: any): boolean => {
      // Minor without platform access is managed by parents — the player
      // himself is never invitable, only parents count.
      const isMinor = (() => {
        if (!p.birth_date) return false;
        const dob = new Date(p.birth_date);
        if (Number.isNaN(dob.getTime())) return false;
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const m = now.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
        return age < 18;
      })();
      const canInvitePlayer = !isMinor || !!p.child_platform_access;
      if (canInvitePlayer && !p.user_id && (p.email || p.phone)) return true;
      const parents = parentsByPlayer?.get(p.id) ?? [];
      return parents.some((pr) => !pr.parent_user_id && (pr.email || pr.phone));
    },
    [parentsByPlayer],
  );

  // Players who can be retried from the UI. The server will skip people that
  // are already active or truly have no usable contact.
  const invitableIds = useMemo(() => {
    return ((players ?? []) as any[]).filter((p) => !p.user_id).map((p) => p.id as string);
  }, [players]);

  async function inviteWholeTeam() {
    if (!user || invitableIds.length === 0) return;
    setInviting(true);
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let alreadyActiveSkipped = 0;
    let noContactSkipped = 0;
    const allSuppressed: string[] = [];
    const allSuppressedDetails: { email: string; reason: string | null }[] = [];
    for (const id of invitableIds) {
      const r = await sendInvitesForPlayer(id);
      totalSent += r.sent;
      totalFailed += r.failed;
      totalSkipped += r.skipped;
      if (r.reason === "already_active") alreadyActiveSkipped += r.skipped;
      if (r.reason === "no_contact") noContactSkipped += r.skipped;
      if (r.suppressedEmails?.length) allSuppressed.push(...r.suppressedEmails);
      if (r.suppressedDetails?.length) allSuppressedDetails.push(...r.suppressedDetails);
    }
    setInviting(false);
    if (allSuppressed.length > 0) {
      toastSuppressed(allSuppressedDetails, allSuppressed);
    }

    if (totalSent === 0 && totalFailed === 0)
      toast.warning(
        t(
          alreadyActiveSkipped >= noContactSkipped
            ? "players.inviteAlreadyActive"
            : "players.inviteNoContact",
        ),
      );
    else if (totalFailed)
      toast.warning(
        t("players.inviteBulkResult", {
          sent: totalSent,
          failed: totalFailed,
          skipped: totalSkipped,
        }),
      );
    else toast.success(t("players.inviteBulkSent", { count: totalSent }));
    qc.invalidateQueries({ queryKey: ["team-pending-invites", teamId] });
    qc.invalidateQueries({ queryKey: ["team-invite-failures", teamId] });
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!activeClubId || !user) return;

    // Validate: minor requires a parent with at least name + (email or phone)
    const hasParentInfo =
      (parentFirst.trim() || parentLast.trim()) && (parentEmail.trim() || parentPhone.trim());
    if (minor && !hasParentInfo) {
      toast.error(t("players.parentRequiredForMinor"));
      return;
    }

    setBusy(true);

    const playerCanRespond = respondBy === "player" || respondBy === "both";
    const parentCanRespond = respondBy === "parent" || respondBy === "both";

    const { data: player, error } = await supabase
      .from("players")
      .insert({
        club_id: activeClubId,
        first_name: first,
        last_name: last,
        jersey_number: jersey ? Number(jersey) : null,
        license_number: license.trim() || null,
        preferred_position: position || null,
        phone: phone || null,
        email: email || null,
        birth_date: birthDate || null,
        // For minors, the player has no platform access by default — only the parent decides later.
        can_respond: minor ? false : playerCanRespond,
        child_platform_access: false,
      })
      .select("id")
      .single();
    if (error || !player) {
      setBusy(false);
      toast.error(error?.message ?? "Failed");
      return;
    }

    if (photoFile) {
      const url = await uploadPhoto(player.id, photoFile);
      if (url) {
        await supabase.from("players").update({ photo_url: url }).eq("id", player.id);
      }
    }

    const { error: tmErr } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, player_id: player.id, role: "player" });
    if (tmErr) {
      setBusy(false);
      if ((tmErr as any).code === "23505") {
        toast.error(t("players.alreadyInTeam"));
      } else {
        toast.error(tmErr.message);
      }
      return;
    }

    const parentFullName = `${parentFirst.trim()} ${parentLast.trim()}`.trim();
    if (parentFullName || parentPhone || parentEmail) {
      await supabase.from("player_parents").insert({
        player_id: player.id,
        parent_user_id: null,
        full_name: parentFullName || null,
        phone: parentPhone || null,
        email: parentEmail || null,
        can_respond: parentCanRespond,
      });
    }

    // Auto-send invites: parent (always for minor); player too if adult and contactable.
    try {
      const r = await sendInvitesForPlayer(player.id);
      if (r.sent > 0) {
        toast.success(minor ? t("players.autoInviteParentSent") : t("players.autoInviteSent"));
      }
    } catch {
      /* non-blocking */
    }

    setBusy(false);
    setOpen(false);
    reset();
    qc.invalidateQueries({ queryKey: ["team-players", teamId] });
    qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
    toast.success(t("teams.addPlayer"));
  }

  if (isSubRoute) return <Outlet />;

  return (
    <div className="px-5 pt-6 pb-6 space-y-5">
      {clubTeamCount && clubTeamCount > 1 ? <BackLink to="/teams" /> : null}

      <div className="flex items-start gap-4">
        <TeamImage
          team={team as any}
          isCoach={isCoach}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["team", teamId] })}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold truncate">{team?.name ?? ""}</h1>
                {isArchived && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("teams.badgeArchived")}
                  </Badge>
                )}
              </div>
              {team && (
                <p className="text-xs text-muted-foreground mt-1">
                  {[team.age_group, team.sport, team.season].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {roles.includes("admin") && team?.club_id && !isArchived && (
                <TeamInviteShareButton
                  clubId={team.club_id}
                  teamId={team.id}
                  teamName={team.name}
                />
              )}
              {isCoach && team && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isAdmin && isArchived && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {t("teams.cannotCreateEventArchived")}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await onUnarchiveTeam();
              navigate({ to: "/events" });
            }}
            disabled={teamActionBusy}
          >
            <ArchiveRestore className="h-4 w-4 mr-1" />
            {t("teams.unarchiveToAddEvent")}
          </Button>
        </div>
      )}

      {isAdmin && team && (
        <div className="flex flex-wrap gap-2">
          {isArchived ? (
            <Button size="sm" variant="outline" onClick={onUnarchiveTeam} disabled={teamActionBusy}>
              <ArchiveRestore className="h-4 w-4 mr-1" />
              {t("teams.unarchive")}
            </Button>
          ) : teamHasHistory ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmArchiveTeam(true)}
              disabled={teamActionBusy}
            >
              <Archive className="h-4 w-4 mr-1" />
              {t("teams.archive")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDeleteTeam(true)}
              disabled={teamActionBusy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("teams.delete")}
            </Button>
          )}
        </div>
      )}

      <TeamChampionshipsSection teamId={teamId} canManage={isCoach} />

      <AlertDialog open={confirmDeleteTeam} onOpenChange={setConfirmDeleteTeam}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teams.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(players?.length ?? 0) > 0
                ? t("teams.deleteConfirmWithRoster", { count: players!.length })
                : t("teams.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteTeam}
              disabled={teamActionBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {teamActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchiveTeam} onOpenChange={setConfirmArchiveTeam}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teams.archiveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("teams.archiveConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onArchiveTeam} disabled={teamActionBusy}>
              {teamActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("teams.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isCoach && (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[92dvh] rounded-t-3xl p-0 flex flex-col overflow-hidden"
          >
            <SheetHeader className="shrink-0 px-6 pt-6 pb-3 pr-14 border-b bg-background">
              <SheetTitle>{t("common.edit")}</SheetTitle>
            </SheetHeader>
            <form
              onSubmit={onSaveTeam}
              className="flex-1 overflow-y-auto overscroll-contain space-y-4 px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
              <div className="space-y-1.5">
                <Label>{t("teams.name")}</Label>
                <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              {!(team as { is_internal?: boolean } | null)?.is_internal && (
                <div className="space-y-1.5">
                  <Label>{t("teams.ageGroup")}</Label>
                  <AgeGroupSelect value={editAge} onValueChange={setEditAge} allowEmpty={false} />
                  {editAge && !isCanonicalTeamAgeCategory(editAge) && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("teams.ageGroupLegacyHint", {
                        defaultValue:
                          "Ancienne valeur — choisissez une catégorie officielle (ex. U7). Une plage du type U6-U7 peut rester dans le nom de l'équipe.",
                      })}
                    </p>
                  )}
                </div>
              )}
              {/* teams.championship is deprecated — championships now live in TeamChampionshipsSection. */}
              <div className="space-y-1.5 rounded-xl border border-dashed border-border bg-muted/30 p-3">
                <Label className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  {t("championships.title", { defaultValue: "Championnats" })}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("championships.editHint", {
                    defaultValue:
                      "Les championnats sont gérés dans une section dédiée sur la page de l'équipe (plusieurs championnats possibles, avec archivage).",
                  })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditOpen(false);
                    setTimeout(() => {
                      document
                        .getElementById("team-championships-section")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 150);
                  }}
                >
                  {t("championships.manage", { defaultValue: "Gérer les championnats" })}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{t("teams.competitions")}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["friendly", "championship", "cup"] as const).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={editCompetitions.includes(key)}
                        onCheckedChange={(checked) => toggleEditCompetition(key, checked === true)}
                      />
                      {t(`events.competitionTypes.${key}`)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.sport")}</Label>
                <SportSelect value={editSport || undefined} onValueChange={setEditSport} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("teams.season")}</Label>
                <Input value={editSeason} onChange={(e) => setEditSeason(e.target.value)} />
              </div>
              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <Label>{t("teams.whatsappGroupLink")}</Label>
                <Input
                  type="url"
                  placeholder="https://chat.whatsapp.com/..."
                  value={editWhatsappUrl}
                  onChange={(e) => setEditWhatsappUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("teams.whatsappGroupHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("teams.communicationMode")}</Label>
                <Select value={editCommMode} onValueChange={(v) => setEditCommMode(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="app">{t("teams.commMode.app")}</SelectItem>
                    <SelectItem value="hybrid">{t("teams.commMode.hybrid")}</SelectItem>
                    <SelectItem value="whatsapp">{t("teams.commMode.whatsapp")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("teams.commModeHint")}</p>
              </div>
              {/*
               * Team-level override for call-up list visibility. Read/write
               * both go through RPCs (staff-gated). No raw select on
               * teams.show_called_up_players_override anywhere in the UI.
               */}
              <div className="pt-2 border-t border-border/60">
                <CallUpVisibilityField scope="team" id={teamId} isStaff={isCoach} />
              </div>

              <Button type="submit" className="w-full h-11" disabled={editBusy}>
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
              </Button>
            </form>
          </SheetContent>
        </Sheet>
      )}

      <Link
        to="/teams/$teamId/stats"
        params={{ teamId }}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:scale-[0.99] transition-transform hover:bg-accent/40"
      >
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BarChart3 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {t("stats.teamStats", { defaultValue: "Statistiques de l'équipe" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("stats.teamStatsHint", {
              defaultValue: "Présence, buts, défis",
            })}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Link>

      {isCoach && team?.club_id && <UpcomingAbsencesWidget clubId={team.club_id} teamId={teamId} />}

      {team?.club_id &&
        (roles.includes("admin") ||
          roles.includes("dirigeant") ||
          roles.includes("coach") ||
          roles.includes("assistant_coach")) && (
          <Link
            to="/teams/$teamId/staff"
            params={{ teamId }}
            className="flex items-center gap-3 rounded-lg border border-violet-200 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 p-3 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
          >
            <LockIcon className="h-5 w-5 text-violet-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {t("teams.staffWall", { defaultValue: "Mur Staff" })}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("teams.staffWallHint", {
                  defaultValue:
                    "Espace privé des éducateurs et dirigeants de l'équipe. Non visible par les joueurs ni les parents.",
                })}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        )}

      <TeamCoaches
        teamId={teamId}
        clubId={(team as any)?.club_id}
        isAdmin={roles.includes("admin")}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("teams.players")}
        </h2>
        {isCoach && (
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {selectMode ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={inviting || selectedIds.size === 0}
                  onClick={inviteSelected}
                >
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {t("players.inviteSelected", { count: selectedIds.size })}
                </Button>
              </>
            ) : (
              <>
                {isCoach && (players ?? []).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      const csv = toCsv(
                        (players ?? []).map((p: any) => ({
                          last_name: p.last_name ?? "",
                          first_name: p.first_name ?? "",
                          jersey_number: p.jersey_number ?? "",
                          license_number: p.license_number ?? "",
                          position: p.preferred_position ?? "",
                          email: p.email ?? "",
                          phone: p.phone ?? "",
                          account: p.user_id ? "active" : "inactive",
                        })),
                        [
                          {
                            key: "last_name",
                            header: t("players.lastName", { defaultValue: "Last name" }),
                          },
                          {
                            key: "first_name",
                            header: t("players.firstName", { defaultValue: "First name" }),
                          },
                          { key: "jersey_number", header: "#" },
                          {
                            key: "license_number",
                            header: t("players.licenseNumber", { defaultValue: "License #" }),
                          },
                          {
                            key: "position",
                            header: t("players.position", { defaultValue: "Position" }),
                          },
                          { key: "email", header: "Email" },
                          { key: "phone", header: t("players.phone", { defaultValue: "Phone" }) },
                          {
                            key: "account",
                            header: t("players.account", { defaultValue: "Account" }),
                          },
                        ],
                      );
                      downloadCsv(`${team?.name ?? "team"}-players`, csv);
                    }}
                    aria-label={t("common.exportCsv", { defaultValue: "Export CSV" })}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {invitableIds.length > 0 && (
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      setSelectedIds(new Set(invitableIds));
                      setSelectMode(true);
                    }}
                    title={t("players.inviteWholeTeamHint", {
                      defaultValue:
                        "Envoie une invitation à chaque joueur/parent sans compte. Les personnes déjà inscrites ou déjà invitées sont ignorées.",
                    })}
                  >
                    <Send className="h-4 w-4" />
                    {t("players.inviteWholeTeam", {
                      defaultValue: "Inviter ({{count}})",
                      count: invitableIds.length,
                    })}
                  </Button>
                )}
                {isCoach && activeClubId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload className="h-4 w-4" />
                    {t("players.import.button", { defaultValue: "Import CSV" })}
                  </Button>
                )}
                <Sheet
                  open={open}
                  onOpenChange={(o) => {
                    setOpen(o);
                    if (!o) {
                      reset();
                      setAddMode("new");
                    }
                  }}
                >
                  <SheetTrigger asChild>
                    <Button size="sm" className="h-9">
                      <Plus className="h-4 w-4" />
                      {t("teams.addPlayer")}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>{t("teams.addPlayer")}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                      <button
                        type="button"
                        onClick={() => setAddMode("new")}
                        className={cn(
                          "text-sm font-medium py-2 rounded-lg transition-colors",
                          addMode === "new"
                            ? "bg-card shadow-sm text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {t("players.tabNew")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddMode("existing")}
                        className={cn(
                          "text-sm font-medium py-2 rounded-lg transition-colors",
                          addMode === "existing"
                            ? "bg-card shadow-sm text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {t("players.tabExisting")}
                      </button>
                    </div>
                    {addMode === "existing" && activeClubId ? (
                      <div className="mt-4 pb-8">
                        <ExistingPlayerPicker
                          clubId={activeClubId}
                          teamId={teamId}
                          onDone={() => {
                            setOpen(false);
                            setAddMode("new");
                          }}
                        />
                      </div>
                    ) : (
                      <form onSubmit={onAdd} className="space-y-4 mt-4 pb-8">
                        {/* Photo */}
                        <div className="space-y-1.5">
                          <Label>{t("players.photo")}</Label>
                          <label className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 cursor-pointer">
                            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                              {photoFile ? (
                                <img
                                  src={URL.createObjectURL(photoFile)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Camera className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {t("players.uploadPhoto")}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>{t("players.firstName")}</Label>
                            <Input
                              data-testid="player-first-name-input"
                              required
                              value={first}
                              onChange={(e) => setFirst(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t("players.lastName")}</Label>
                            <Input
                              data-testid="player-last-name-input"
                              required
                              value={last}
                              onChange={(e) => setLast(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>{t("players.jerseyNumber")}</Label>
                            <Input
                              type="number"
                              value={jersey}
                              onChange={(e) => setJersey(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t("players.preferredPosition")}</Label>
                            <PositionCombobox
                              value={position}
                              onChange={setPosition}
                              sport={team?.sport ?? null}
                              placeholder="GK / DF / MF / FW"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t("players.licenseNumber")}</Label>
                          <Input
                            value={license}
                            onChange={(e) => setLicense(e.target.value)}
                            placeholder="FFF-2025-12345"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t("players.birthDate")}</Label>
                          <Input
                            type="date"
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                          />
                        </div>

                        <div className="pt-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            {t("players.contact")}
                          </p>
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label>{t("players.phone")}</Label>
                              <PhoneInput value={phone} onChange={setPhone} />
                            </div>
                            <div className="space-y-1.5">
                              <Label>{t("players.email")}</Label>
                              <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {t("players.parents")}
                              {minor && <span className="text-destructive ml-1">*</span>}
                            </p>
                          </div>
                          {minor && (
                            <p className="text-xs text-muted-foreground bg-accent/40 rounded-lg px-3 py-2 mb-3">
                              {t("players.minorParentNotice")}
                            </p>
                          )}
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>{t("players.firstName")}</Label>
                                <Input
                                  required={minor}
                                  value={parentFirst}
                                  onChange={(e) => setParentFirst(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label>{t("players.lastName")}</Label>
                                <Input
                                  required={minor}
                                  value={parentLast}
                                  onChange={(e) => setParentLast(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label>{t("players.phone")}</Label>
                                <PhoneInput value={parentPhone} onChange={setParentPhone} />
                              </div>
                              <div className="space-y-1.5">
                                <Label>{t("players.email")}</Label>
                                <Input
                                  type="email"
                                  value={parentEmail}
                                  onChange={(e) => setParentEmail(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>{t("players.canRespond")}</Label>
                          <Select
                            value={respondBy}
                            onValueChange={(v) => setRespondBy(v as RespondBy)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="player">{t("players.respondPlayer")}</SelectItem>
                              <SelectItem value="parent">{t("players.respondParent")}</SelectItem>
                              <SelectItem value="both">{t("players.respondBoth")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button type="submit" className="w-full h-11" disabled={busy}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("players.save")}
                        </Button>
                      </form>
                    )}
                  </SheetContent>
                </Sheet>
                {activeClubId && (
                  <ImportPlayersCsvDialog
                    open={importOpen}
                    onOpenChange={setImportOpen}
                    teamId={teamId}
                    clubId={activeClubId}
                    onDone={() => {
                      qc.invalidateQueries({ queryKey: ["team-players", teamId] });
                      qc.invalidateQueries({ queryKey: ["teams-with-counts"] });
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : !players || players.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <UserCircle2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{t("players.noPlayers")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {(() => {
            const list = [...(players ?? [])] as any[];
            if (!isCoach && myPlayerIds && myPlayerIds.size > 0) {
              list.sort((a, b) => {
                const am = myPlayerIds.has(a.id) ? 0 : 1;
                const bm = myPlayerIds.has(b.id) ? 0 : 1;
                return am - bm;
              });
            }
            return list;
          })().map((p: any, idx: number) => {
            const isMine = !isCoach && myPlayerIds?.has(p.id);
            const isFirstOther =
              !isCoach &&
              myPlayerIds &&
              myPlayerIds.size > 0 &&
              !isMine &&
              idx === myPlayerIds.size;
            const inviteStatusesLoading =
              isCoach && (pendingInvitesLoading || inviteFailuresLoading || parentsByPlayerLoading);
            const hasContactHint = hasOpenContact(p);

            const parentsForP = parentsByPlayer?.get(p.id) ?? [];
            const isMinorP = (() => {
              if (!p.birth_date) return false;
              const dob = new Date(p.birth_date);
              if (Number.isNaN(dob.getTime())) return false;
              const now = new Date();
              let age = now.getFullYear() - dob.getFullYear();
              const md = now.getMonth() - dob.getMonth();
              if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
              return age < 18;
            })();
            // A minor without direct platform access is considered "linked"
            // as soon as at least one parent has an active account — the
            // parent handles the child on the platform.
            const anyParentLinked = parentsForP.some((pp: any) => !!pp.parent_user_id);
            const coveredByParent = isMinorP && !p.child_platform_access && anyParentLinked;
            const linked = !!p.user_id || coveredByParent;
            const canInvite = !linked;
            // Minor without direct platform access: only parent invites matter.
            // Failures on the player's own (possibly bogus) email are hidden in
            // favor of the parent-account activation status.
            const minorParentMode = isMinorP && !p.child_platform_access;
            const parentEmailsSet = new Set(
              parentsForP
                .map((pp: any) => (pp.email ?? "").toLowerCase().trim())
                .filter((e: string) => !!e),
            );
            const pendingForP = pendingInvitesByPlayer?.get(p.id);
            const hasParentPendingInvite =
              !!pendingForP && [...pendingForP.emails].some((e) => parentEmailsSet.has(e));
            const hasPendingInvite =
              !linked && (minorParentMode ? hasParentPendingInvite : !!pendingForP);
            const allFailures = inviteFailuresByPlayer?.[p.id] ?? [];
            const failures = minorParentMode
              ? allFailures.filter((f: any) =>
                  parentEmailsSet.has((f.email ?? "").toLowerCase().trim()),
                )
              : allFailures;
            const hasFailedInvite = !linked && failures.length > 0;
            const showParentActivationPending =
              minorParentMode &&
              !linked &&
              parentsForP.length > 0 &&
              !hasFailedInvite &&
              !hasPendingInvite;
            // When a minor has direct platform access, parents are already
            // active, and the player's own invitation is pending, make it
            // explicit that we are waiting for the child account.
            const showPlayerInviteSent =
              isMinorP &&
              !!p.child_platform_access &&
              anyParentLinked &&
              !linked &&
              hasPendingInvite;

            const checked = selectedIds.has(p.id);
            const rowClass = cn(
              "flex items-center gap-3 rounded-2xl border bg-card p-3",
              isMine ? "border-primary/40 ring-1 ring-primary/20 shadow-sm p-4" : "border-border",
              !isCoach && myPlayerIds && myPlayerIds.size > 0 && !isMine && "py-2 px-3 opacity-95",
            );

            const susp = activeSuspensionsByPlayer?.get(p.id);
            const absenceReason = activeAbsencesByPlayer?.get(p.id);
            const inner = (
              <>
                <div className="relative h-12 w-12 shrink-0 rounded-full bg-muted overflow-hidden">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                      {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                    </div>
                  )}
                  {isCoach && (
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                        linked
                          ? "bg-emerald-500"
                          : hasFailedInvite
                            ? "bg-red-500"
                            : hasPendingInvite
                              ? "bg-amber-400"
                              : "bg-muted-foreground/40",
                      )}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {p.first_name} {p.last_name}
                    {p.jersey_number ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · #{p.jersey_number}
                      </span>
                    ) : null}
                  </p>
                  {susp && (
                    <div className="mt-1">
                      <UnavailableBadge
                        reason="suspension"
                        detail={t("discipline.matchesLeft", { count: susp.remaining })}
                      />
                    </div>
                  )}
                  {!susp && absenceReason && (
                    <div className="mt-1">
                      <UnavailableBadge reason={absenceReason} />
                    </div>
                  )}
                  <p className="text-xs mt-0.5 truncate">
                    {linked ? (
                      <span className="text-muted-foreground">
                        {isCoach ? (
                          <>
                            {t("players.accountActive")}
                            {p.preferred_position ? (
                              <span className="opacity-70"> · {p.preferred_position}</span>
                            ) : null}
                          </>
                        ) : (
                          (p.preferred_position ?? "")
                        )}
                      </span>
                    ) : isCoach ? (
                      inviteStatusesLoading ? (
                        <span className="text-muted-foreground opacity-60">…</span>
                      ) : hasFailedInvite ? (
                        <span
                          className="inline-flex items-center gap-1 text-red-600"
                          title={failures
                            .map((f) => `${f.email}${f.error ? ` — ${f.error}` : ""} (${f.status})`)
                            .join("\n")}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {t("players.inviteFailedLabel", {
                            defaultValue: "Envoi échoué",
                          })}
                          <span className="text-muted-foreground truncate">
                            · {failures.map((f) => f.email).join(", ")}
                          </span>
                        </span>
                      ) : hasPendingInvite ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {showPlayerInviteSent
                            ? t("players.playerInviteSentLabel", {
                                defaultValue: "Invitation joueur envoyée",
                              })
                            : t("players.inviteSentLabel", { defaultValue: "Invitation envoyée" })}
                        </span>
                      ) : showParentActivationPending ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {t("players.parentActivationPending", {
                            defaultValue: "En attente d'activation du compte parent",
                          })}
                        </span>
                      ) : canInvite ? (
                        <span className="text-muted-foreground">
                          {hasContactHint
                            ? t("players.inviteNotSent", { defaultValue: "Invitation non envoyée" })
                            : t("players.accountInactive")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {p.preferred_position ?? t("players.accountInactive")}
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{p.preferred_position ?? ""}</span>
                    )}
                  </p>
                </div>
              </>
            );
            return (
              <Fragment key={p.id}>
                {isMine && idx === 0 && (
                  <li
                    key={`hdr-mine-${p.id}`}
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pt-1"
                  >
                    {t("teams.myProfile", { defaultValue: "Mon profil" })}
                  </li>
                )}
                {isFirstOther && (
                  <li
                    key={`hdr-others-${p.id}`}
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pt-3"
                  >
                    {t("teams.myTeammates", { defaultValue: "Mes coéquipiers" })}
                  </li>
                )}
                <li key={p.id}>
                  {selectMode
                    ? (() => {
                        const selectable = canInvite;
                        return (
                          <button
                            type="button"
                            disabled={!selectable}
                            onClick={() => selectable && toggleSelected(p.id)}
                            className={cn(
                              rowClass,
                              "w-full text-left",
                              !selectable && "opacity-50 grayscale",
                            )}
                          >
                            <Checkbox
                              checked={checked && selectable}
                              disabled={!selectable}
                              className="shrink-0"
                            />
                            {inner}
                          </button>
                        );
                      })()
                    : (() => {
                        const rowContent = (
                          <div className={rowClass}>
                            <Link
                              to="/players/$playerId"
                              params={{ playerId: p.id }}
                              className="contents"
                            >
                              {inner}
                            </Link>
                            {isCoach && canInvite && (
                              <Button
                                size="sm"
                                variant={hasPendingInvite ? "outline" : "default"}
                                className="h-8 px-3 shrink-0 text-xs"
                                title={
                                  hasPendingInvite
                                    ? t("players.resendAction")
                                    : t("players.inviteSentAction")
                                }
                                disabled={inviting}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  inviteOne(p.id);
                                }}
                              >
                                <Send className="h-3.5 w-3.5" />
                                {hasPendingInvite
                                  ? t("players.resendAction", { defaultValue: "Renvoyer" })
                                  : t("players.inviteSentAction", { defaultValue: "Inviter" })}
                              </Button>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        );
                        if (!isCoach) return rowContent;
                        const actions = [
                          ...(canInvite
                            ? [
                                {
                                  label: t("players.invite"),
                                  icon: <Send className="h-4 w-4" />,
                                  onClick: () => inviteOne(p.id),
                                },
                              ]
                            : []),
                          {
                            label: t("common.remove", { defaultValue: "Retirer" }),
                            icon: <Trash2 className="h-4 w-4" />,
                            variant: "destructive" as const,
                            onClick: () =>
                              removeFromTeam(
                                p.id,
                                `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
                              ),
                          },
                        ];
                        return <SwipeableRow actions={actions}>{rowContent}</SwipeableRow>;
                      })()}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TeamImage({
  team,
  isCoach,
  onUploaded,
}: {
  team: any;
  isCoach: boolean;
  onUploaded: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const createImageUpload = useServerFn(createSignedTeamImageUpload);
  const updateTeamImage = useServerFn(updateTeamImageFromUpload);

  async function onPick(file: File) {
    if (!team?.club_id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("teams.imageTooLarge", { defaultValue: "Image trop lourde (max 5 Mo)." }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("teams.imageInvalidType", { defaultValue: "Format de fichier non supporté." }));
      return;
    }
    setBusy(true);
    try {
      const signed = await createImageUpload({
        data: {
          clubId: team.club_id,
          teamId: team.id,
          fileName: file.name,
          contentType: file.type || "image/jpeg",
          size: file.size,
        },
      });
      const { error: upErr } = await supabase.storage
        .from("team-images")
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || "image/jpeg",
        });
      if (upErr) throw upErr;
      await updateTeamImage({ data: { clubId: team.club_id, teamId: team.id, path: signed.path } });
      onUploaded();
      toast.success(t("common.saved"));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : null;
      toast.error(message ?? t("common.error", { defaultValue: "Erreur" }));
    } finally {
      setBusy(false);
    }
  }

  const inner = team?.image_url ? (
    <img src={team.image_url} alt={team?.name ?? ""} className="h-full w-full object-cover" />
  ) : busy ? (
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  ) : (
    <Camera className="h-5 w-5 text-muted-foreground" />
  );

  if (!isCoach) {
    return (
      <div className="h-20 w-20 rounded-2xl bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {inner}
      </div>
    );
  }

  return (
    <label
      className="h-20 w-20 rounded-2xl bg-muted overflow-hidden flex items-center justify-center shrink-0 cursor-pointer relative group"
      title={t("teams.uploadImage")}
    >
      {inner}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

function CollapsibleTeamStats({
  teamId,
  defaultOpen = false,
}: {
  teamId: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40"
      >
        <span>
          {t("stats.showAttendance", { defaultValue: "Voir les statistiques de présence" })}
        </span>
        <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <TeamAttendanceStats teamId={teamId} />
        </div>
      )}
    </div>
  );
}

function TeamCoaches({
  teamId,
  clubId,
  isAdmin,
}: {
  teamId: string;
  clubId?: string;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const notifyCoachAssignedFn = useServerFn(notifyCoachAssigned);

  const { data: coaches } = useQuery({
    queryKey: ["team-coaches", teamId, clubId],
    queryFn: async () => {
      const { data: tm } = await supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", teamId)
        .in("role", ["coach", "admin"]);
      const ids = Array.from(new Set((tm ?? []).map((m: any) => m.user_id).filter(Boolean)));
      if (ids.length === 0) return [] as any[];
      const [{ data: profs }, { data: cm }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, avatar_url")
          .in("id", ids),
        clubId
          ? supabase
              .from("club_members")
              .select("user_id, role")
              .eq("club_id", clubId)
              .in("user_id", ids)
              .in("role", ["admin", "coach"])
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const clubRolesByUser = new Map<string, Set<string>>();
      for (const m of (cm ?? []) as any[]) {
        if (!m.user_id) continue;
        if (!clubRolesByUser.has(m.user_id)) clubRolesByUser.set(m.user_id, new Set());
        clubRolesByUser.get(m.user_id)!.add(m.role);
      }
      return (tm ?? [])
        .filter((m: any) => m.user_id && byId.has(m.user_id))
        .map((m: any) => ({
          ...byId.get(m.user_id),
          role: m.role,
          clubRoles: Array.from(clubRolesByUser.get(m.user_id) ?? []),
        }));
    },
  });

  // Club staff available to attach (admins + coaches not already on this team)
  const { data: availableStaff } = useQuery({
    queryKey: ["club-staff-available", clubId, teamId, coaches?.length ?? 0],
    enabled: isAdmin && !!clubId && pickerOpen,
    queryFn: async () => {
      const { data: cm } = await supabase
        .from("club_members")
        .select("user_id, role")
        .eq("club_id", clubId!)
        .in("role", ["coach", "admin"]);
      const taken = new Set((coaches ?? []).map((c: any) => c.id));
      const rolesByUser = new Map<string, Set<string>>();
      for (const m of cm ?? []) {
        if (!m.user_id || taken.has(m.user_id)) continue;
        if (!rolesByUser.has(m.user_id)) rolesByUser.set(m.user_id, new Set());
        rolesByUser.get(m.user_id)!.add(m.role);
      }
      const ids = Array.from(rolesByUser.keys());
      if (ids.length === 0) return [] as any[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, avatar_url")
        .in("id", ids);
      return (profs ?? []).map((p: any) => ({
        ...p,
        roles: Array.from(rolesByUser.get(p.id) ?? []),
      }));
    },
  });

  async function attach(uid: string) {
    setBusyUid(uid);
    const { error } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, user_id: uid, role: "coach" });
    setBusyUid(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("teams.coachAttached", { defaultValue: "Coach attaché" }));
    qc.invalidateQueries({ queryKey: ["team-coaches", teamId] });

    // Fire-and-forget email notification (in-app notification handled by DB trigger).
    notifyCoachAssignedFn({
      data: { teamId, coachUserId: uid, origin: window.location.origin },
    }).catch(() => {
      /* non-blocking */
    });
  }

  async function detach(uid: string) {
    if (!confirm(t("teams.coachDetachConfirm"))) return;
    setBusyUid(uid);
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", uid)
      .in("role", ["coach", "admin"]);
    setBusyUid(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("teams.coachDetached", { defaultValue: "Coach retiré" }));
    qc.invalidateQueries({ queryKey: ["team-coaches", teamId] });
  }

  const hasCoaches = (coaches ?? []).length > 0;
  if (!hasCoaches && !isAdmin) return null;

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
            <UserCircle2 className="h-4 w-4" />
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            {(coaches?.length ?? 0) > 1
              ? t("teams.coaches", { defaultValue: "Coaches" })
              : t("teams.coach", { defaultValue: "Coach" })}
          </h2>
        </div>
        {isAdmin && (
          <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("teams.attachCoach", { defaultValue: "Attacher" })}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>
                  {t("teams.attachCoachTitle", { defaultValue: "Attacher un coach" })}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 pb-6 space-y-2">
                {(availableStaff ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t("teams.noAvailableCoach", {
                      defaultValue:
                        "Aucun coach disponible. Invitez d'abord un coach depuis Admin → Utilisateurs.",
                    })}
                  </p>
                ) : (
                  (availableStaff ?? []).map((s: any) => {
                    const name =
                      s.full_name ?? [s.first_name, s.last_name].filter(Boolean).join(" ") ?? "—";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busyUid === s.id}
                        onClick={async () => {
                          await attach(s.id);
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition disabled:opacity-50"
                      >
                        <div className="h-9 w-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-semibold text-muted-foreground">
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (name?.[0] ?? "?").toUpperCase()
                          )}
                        </div>
                        <span className="text-sm font-medium flex-1 text-left truncate">
                          {name}
                        </span>
                        {(s.roles ?? []).includes("admin") && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary mr-1">
                            {t("roles.admin", { defaultValue: "Admin" })}
                          </span>
                        )}

                        {busyUid === s.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      </button>
                    );
                  })
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
      {hasCoaches ? (
        <ul className="flex flex-wrap gap-2">
          {(coaches ?? []).map((c: any) => {
            const name =
              c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(" ") ?? "—";
            return (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full bg-card border border-amber-500/30 pl-1 pr-2 py-1"
              >
                <div className="h-7 w-7 rounded-full bg-muted overflow-hidden flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (name?.[0] ?? "?").toUpperCase()
                  )}
                </div>
                <span className="text-sm font-medium truncate max-w-[140px]">{name}</span>
                {(c.role === "admin" || (c.clubRoles ?? []).includes("admin")) && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                    {t("roles.admin")}
                  </span>
                )}
                {isAdmin && c.role !== "admin" && (
                  <button
                    type="button"
                    onClick={() => detach(c.id)}
                    disabled={busyUid === c.id}
                    className="ml-1 h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-destructive/15 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label={t("teams.coachDetach", { defaultValue: "Retirer" })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("teams.noCoachYet", {
            defaultValue: "Aucun coach attaché. Cliquez sur Attacher pour en ajouter.",
          })}
        </p>
      )}
    </section>
  );
}
