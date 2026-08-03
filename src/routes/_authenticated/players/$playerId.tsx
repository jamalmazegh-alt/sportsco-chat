import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { PlayerSuspensions } from "@/components/player-suspensions";
import { getPublicOrigin } from "@/lib/native-platform";
import { PublicProfileCard } from "@/components/public-profile-card";
import { PlayerDetailSkeleton } from "@/components/skeletons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getParentInviteStatuses } from "@/lib/players/invite-status.functions";
import { resolveParentAccountBadge } from "@/lib/players/parent-account-status";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole, useMyRoles } from "@/lib/auth-context";
import { computeFffCategory } from "@/lib/fff-category";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhoneInput } from "@/components/phone-input";
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
import {
  Loader2,
  Camera,
  Plus,
  Trash2,
  UserCircle2,
  ShieldCheck,
  X,
  Send,
  ClipboardList,
  Trophy,
  CalendarDays,
  History,
  Globe,
  Copy,
  Palmtree,
  Pencil,
  Flag,
  UserX,
} from "lucide-react";
import { WallReportDialog } from "@/components/wall-report-dialog";
import { useUserMutes } from "@/lib/use-mutes";
import { Checkbox } from "@/components/ui/checkbox";
import { setChildPlatformAccess } from "@/lib/privacy.functions";
import { BackButton } from "@/components/back-link";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { PositionCombobox } from "@/components/position-combobox";
import { avatarGradient, initialsFrom } from "@/lib/avatar-color";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendTransactionalEmail } from "@/lib/email/send";
import i18n from "@/lib/i18n";
import { isV2 } from "@/config/features";

// PR4-WS1: profils publics enrichis (cross-club) sont gated derrière
// `public_player_profiles`. Le profil joueur club-scoped reste accessible.
const SHOW_PUBLIC_PROFILE_FEATURES = isV2("public_player_profiles");

export const Route = createFileRoute("/_authenticated/players/$playerId")({
  component: PlayerProfile,
  head: () => ({
    meta: [
      { title: i18n.t("meta.player.title") },
      { name: "description", content: i18n.t("meta.player.description") },
    ],
  }),
});

function isMinorFromBirthDate(birth: string | null | undefined): boolean {
  if (!birth) return false;
  const d = new Date(birth);
  const now = new Date();
  const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age < 18;
}

type PlayerParentRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  parent_user_id: string | null;
  can_respond: boolean;
  parent_profile?: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
  } | null;
};

function parentDisplayName(pp: PlayerParentRow): string | null {
  const manual = pp.full_name?.trim();
  if (manual) return manual;

  const prof = pp.parent_profile;
  if (prof) {
    const fromParts = [prof.first_name, prof.last_name]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" ");
    if (fromParts) return fromParts;
    const fromFull = prof.full_name?.trim();
    if (fromFull) return fromFull;
  }

  if (pp.email?.trim()) return pp.email.trim();
  if (pp.phone?.trim()) return pp.phone.trim();
  return null;
}

function parentContactLine(pp: PlayerParentRow, displayName: string | null): string {
  const parts = [pp.phone?.trim(), pp.email?.trim()].filter(Boolean) as string[];
  const unique = [...new Set(parts)].filter((p) => p !== displayName);
  return unique.join(" · ");
}

function PlayerProfile() {
  const { playerId } = Route.useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = useActiveRole();
  const roles = useMyRoles();
  const isCoach =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isFeedback = pathname === `/players/${playerId}/feedback`;
  const isAchievements = pathname === `/players/${playerId}/achievements`;
  const isSeasons = pathname === `/players/${playerId}/seasons`;
  const isTimeline = pathname === `/players/${playerId}/timeline`;
  const isAvailability = pathname === `/players/${playerId}/availability`;
  const isChallenges = pathname === `/players/${playerId}/challenges`;
  const isSubRoute =
    isFeedback || isAchievements || isSeasons || isTimeline || isAvailability || isChallenges;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Signalement du membre (compte lié à cette fiche) aux responsables du club.
  const [reportOpen, setReportOpen] = useState(false);
  // Masquage personnel des contenus de ce membre.
  const { muted: mutedUsers, mute: muteUser, unmute: unmuteUser } = useUserMutes();
  const [muteOpen, setMuteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);

  async function onDeletePlayer() {
    if (!player) return;
    setDeleting(true);
    const { data: mode, error } = await (supabase.rpc as any)("delete_player_smart", {
      _id: player.id,
    });
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const wasSoft = String(mode) === "soft";
    toast(t("players.deleted"), {
      action: wasSoft
        ? {
            label: t("common.undo", { defaultValue: "Undo" }),
            onClick: async () => {
              const { error: e2 } = await supabase.rpc("restore_entity", {
                _kind: "player",
                _id: player.id,
              });
              if (e2) toast.error(e2.message);
              else qc.invalidateQueries({ queryKey: ["team-players"] });
            },
          }
        : undefined,
    });
    qc.invalidateQueries({ queryKey: ["team-players"] });
    navigate({ to: "/teams" });
  }

  async function resendParentInvite(pp: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    parent_user_id: string | null;
  }) {
    if (!player || !user) return;
    if (!player.club_id) {
      toast.warning(t("players.inviteNoContact"));
      return;
    }
    const clubId = player.club_id;
    if (pp.parent_user_id) {
      toast.info(t("players.alreadyLinked"));
      return;
    }
    if (!pp.email && !pp.phone) {
      toast.warning(t("players.inviteNoContact"));
      return;
    }
    // Un compte existe déjà pour cette adresse : l'invitation mènerait à un
    // formulaire d'inscription qui refuse le nouveau mot de passe
    // ("identifiants invalides"). On oriente vers la connexion.
    if (pp.email) {
      const { data: exists } = await supabase.rpc("email_exists", { _email: pp.email });
      if (exists === true) {
        toast.info(
          t("players.inviteAccountExists", {
            defaultValue:
              "Un compte Clubero existe déjà avec cette adresse : la personne doit se connecter (ou utiliser « mot de passe oublié »).",
          }),
        );
        return;
      }
    }
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: invErr } = await supabase.from("member_invites").insert({
      club_id: clubId,
      created_by: user.id,
      token,
      parent_for_player_id: player.id,
      role: "parent",
      email: pp.email ?? null,
      phone: pp.phone ?? null,
    });

    if (invErr) {
      toast.error(invErr.message);
      return;
    }
    const inviteUrl = `${getPublicOrigin()}/register?invite=${encodeURIComponent(token)}`;
    if (pp.email) {
      try {
        const { data: clubRow } = await supabase
          .from("clubs")
          .select("name, logo_url")
          .eq("id", clubId)
          .maybeSingle();

        await sendTransactionalEmail({
          templateName: "player-invite",
          recipientEmail: pp.email,
          idempotencyKey: `member-invite-${token}`,
          templateData: {
            firstName: (pp.full_name ?? "").split(" ")[0] || undefined,
            clubName: clubRow?.name ?? undefined,
            clubLogoUrl: clubRow?.logo_url ?? undefined,
            inviteUrl,
            roleLabel: "parent",
          },
        });
        toast.success(t("players.inviteSent"));
        qc.invalidateQueries({ queryKey: ["player-parent-invite-statuses", playerId] });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed");
        qc.invalidateQueries({ queryKey: ["player-parent-invite-statuses", playerId] });
      }
    } else {
      toast.success(t("players.inviteSent"));
    }
  }

  const { data: player, refetch: refetchPlayer } = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("players")
        .select(
          "id, first_name, last_name, jersey_number, license_number, preferred_position, phone, email, photo_url, user_id, can_respond, club_id, birth_date, child_platform_access, media_consent_status, public_profile_enabled, public_slug",
        )
        .eq("id", playerId)
        .single();
      return data;
    },
  });

  const { data: parents, refetch: refetchParents } = useQuery({
    queryKey: ["player-parents", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_parents")
        .select("id, full_name, phone, email, parent_user_id, can_respond")
        .eq("player_id", playerId);
      if (error) throw error;

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((r) => r.parent_user_id).filter(Boolean))] as string[];

      const profileMap = new Map<
        string,
        { first_name: string | null; last_name: string | null; full_name: string | null }
      >();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, full_name")
          .in("id", userIds);
        for (const p of profiles ?? []) profileMap.set(p.id, p);
      }

      return rows.map((row) => ({
        ...row,
        parent_profile: row.parent_user_id ? (profileMap.get(row.parent_user_id) ?? null) : null,
      })) satisfies PlayerParentRow[];
    },
  });

  // Which parent emails have a recorded transactional-email attempt
  // (status "sent" or "pending" in email_send_log).
  const fetchParentInviteStatuses = useServerFn(getParentInviteStatuses);
  const { data: parentInviteStatuses } = useQuery({
    queryKey: ["player-parent-invite-statuses", playerId],
    queryFn: async () => fetchParentInviteStatuses({ data: { playerId } }),
    enabled: !!playerId,
  });
  const invitedEmails = new Set(
    (parentInviteStatuses?.sentEmails ?? []).map((e) => e.toLowerCase()),
  );
  const failedEmailsMap = new Map(
    (parentInviteStatuses?.failedEmails ?? []).map((f) => [
      f.email.toLowerCase(),
      { error: f.error, reason: f.reason ?? null },
    ]),
  );
  const unconfirmedParentIds = new Set(parentInviteStatuses?.unconfirmedUserIds ?? []);

  function formatSuppressionReason(reason: string | null): string {
    const r = (reason ?? "").toLowerCase();
    if (r.includes("bounce"))
      return t("players.suppressionBounce", {
        defaultValue: "rebond permanent (adresse invalide ou boîte inexistante)",
      });
    if (r.includes("complaint") || r.includes("spam"))
      return t("players.suppressionComplaint", { defaultValue: "plainte pour spam" });
    if (r.includes("unsubscribe"))
      return t("players.suppressionUnsubscribe", {
        defaultValue: "désinscription du destinataire",
      });
    if (r.includes("manual"))
      return t("players.suppressionManual", { defaultValue: "blocage manuel" });
    if (reason && reason.trim().length > 0) return reason;
    return t("players.suppressionUnknown", { defaultValue: "raison inconnue" });
  }

  // Used for sport-aware position suggestions. Falls back to free text when
  // the player isn't on any team yet.
  const { data: playerTeams } = useQuery({
    queryKey: ["player-teams", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("teams:team_id(id, name, sport)")
        .eq("player_id", playerId)
        .eq("role", "player");
      const teams = (data ?? []).map((r: any) => r?.teams).filter(Boolean) as {
        id: string;
        name: string;
        sport: string | null;
      }[];
      // De-dup by id in case of ambiguous joins.
      const seen = new Set<string>();
      return teams.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    },
  });
  const playerSport = playerTeams?.[0]?.sport ?? null;

  // Co-parents: names only, visible to a signed-in parent of this player.
  // RLS on player_parents hides other parents' contacts; this RPC only returns names.
  const { data: coParents } = useQuery({
    queryKey: ["player-coparents", playerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_coparents", {
        _player_id: playerId,
      });
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; has_account: boolean }[];
    },
    enabled: !!user,
  });

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [license, setLicense] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [canRespond, setCanRespond] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!player) return;
    setFirst(player.first_name ?? "");
    setLast(player.last_name ?? "");
    setJersey(player.jersey_number?.toString() ?? "");
    setLicense((player as any).license_number ?? "");
    setPosition(player.preferred_position ?? "");
    setPhone(player.phone ?? "");
    setEmail(player.email ?? "");
    setBirthDate(player.birth_date ?? "");
    setCanRespond(player.can_respond ?? true);
  }, [player]);

  const minor = isMinorFromBirthDate(player?.birth_date);
  const isParentOfThisPlayer = !!parents?.some((p) => p.parent_user_id === user?.id);
  const isSelf = !!player?.user_id && player.user_id === user?.id;
  const canSeePrivate = isCoach || isSelf || isParentOfThisPlayer;

  // Pending (unused) invites for this player or its parents — used to show the
  // same account status wording as the team roster.
  const { data: pendingInviteEmails } = useQuery({
    queryKey: ["player-pending-invites", playerId],
    enabled: !!playerId && canSeePrivate,
    queryFn: async () => {
      const { data } = await supabase
        .from("member_invites")
        .select("email, player_id, parent_for_player_id, used_at")
        .is("used_at", null)
        .or(`player_id.eq.${playerId},parent_for_player_id.eq.${playerId}`);
      return new Set(
        (data ?? [])
          .map((r: any) =>
            String(r.email ?? "")
              .toLowerCase()
              .trim(),
          )
          .filter(Boolean),
      );
    },
  });

  // Account status, aligned with the roster rules:
  // - a minor without personal access is "active" as soon as a parent account exists
  // - a minor WITH personal access but no own account shows "invitation joueur envoyée"
  const anyParentLinked = !!parents?.some((p) => p.parent_user_id);
  const accountStatus: "active" | "playerInviteSent" | "inviteSent" | "inactive" = (() => {
    if (player?.user_id) return "active";
    if (minor && !player?.child_platform_access && anyParentLinked) return "active";
    if (minor && player?.child_platform_access && anyParentLinked) return "playerInviteSent";
    const parentEmails = (parents ?? [])
      .map((p) => (p.email ?? "").toLowerCase().trim())
      .filter(Boolean);
    const own = (player?.email ?? "").toLowerCase().trim();
    const pending = pendingInviteEmails;
    if (pending && [...parentEmails, own].some((e) => e && pending.has(e))) return "inviteSent";
    return "inactive";
  })();
  const accountStatusLabel =
    accountStatus === "active"
      ? t("players.accountActive")
      : accountStatus === "playerInviteSent"
        ? t("players.playerInviteSentLabel", { defaultValue: "Invitation joueur envoyée" })
        : accountStatus === "inviteSent"
          ? t("players.inviteSentLabel", { defaultValue: "Invitation envoyée" })
          : t("players.accountInactive");

  async function sendChildOnboardingInvite(targetEmail: string) {
    if (!player || !user) return;
    if (!player.club_id) {
      toast.warning(t("players.inviteNoContact"));
      return;
    }
    const clubId = player.club_id;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: invErr } = await supabase.from("member_invites").insert({
      club_id: clubId,
      created_by: user.id,
      player_id: player.id,
      role: "player",
      token,
      email: targetEmail,
    });
    if (invErr) {
      toast.error(invErr.message);
      return;
    }
    const inviteUrl = `${getPublicOrigin()}/register?invite=${encodeURIComponent(token)}`;
    try {
      const { data: clubRow } = await supabase
        .from("clubs")
        .select("name, logo_url")
        .eq("id", clubId)
        .maybeSingle();

      await sendTransactionalEmail({
        templateName: "player-invite",
        recipientEmail: targetEmail,
        idempotencyKey: `member-invite-${token}`,
        templateData: {
          firstName: player.first_name || undefined,
          clubName: clubRow?.name ?? undefined,
          clubLogoUrl: clubRow?.logo_url ?? undefined,
          inviteUrl,
        },
      });
      toast.success(t("players.inviteSent", { defaultValue: "Invitation envoyée" }));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    setBusy(true);

    let photo_url = player.photo_url;
    if (photoFile) {
      // RGPD: parental consent required for photos of minors
      if (minor && player.media_consent_status !== "granted") {
        setBusy(false);
        toast.error(
          t("players.photoBlockedMinor", {
            defaultValue:
              "Le consentement parental pour l'image est requis avant tout upload de photo d'un mineur.",
          }),
        );
        return;
      }
      // Limite côté client : refuse > 5 Mo (le bucket impose aussi la limite côté serveur)
      if (photoFile.size > 5 * 1024 * 1024) {
        setBusy(false);
        toast.error(t("players.photoTooLarge", { defaultValue: "Photo trop lourde (max 5 Mo)." }));
        return;
      }
      if (!photoFile.type.startsWith("image/")) {
        setBusy(false);
        toast.error(
          t("players.photoInvalidType", { defaultValue: "Format de fichier non supporté." }),
        );
        return;
      }
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${player.club_id}/${player.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type });
      if (upErr) {
        setBusy(false);
        toast.error(
          t("players.photoUploadFailed", {
            defaultValue: "Échec de l'envoi de la photo : {{message}}",
            message: upErr.message,
          }),
        );
        return;
      }
      const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
      // cache-buster : le fichier est écrasé (upsert) sur la même URL
      photo_url = `${data.publicUrl}?v=${Date.now()}`;
    }

    const prevEmail = (player.email ?? "").toLowerCase().trim();
    const newEmail = (email ?? "").toLowerCase().trim();
    const emailChanged = newEmail && newEmail !== prevEmail;

    const { error } = await supabase
      .from("players")
      .update({
        first_name: first,
        last_name: last,
        jersey_number: jersey ? Number(jersey) : null,
        license_number: license.trim() || null,
        preferred_position: position || null,
        phone: phone || null,
        email: email || null,
        birth_date: birthDate || null,
        can_respond: minor ? canRespond : true,
        photo_url,
      })
      .eq("id", player.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["player", playerId] });
    qc.invalidateQueries({ queryKey: ["team-players"] });
    toast.success(t("common.saved"));

    // Note: sending the onboarding invite is now a manual action
    // (button under the "child platform access" switch). We never
    // auto-send emails on save or on toggling access.
  }

  // Activation de l'accès enfant : attestation « représentant légal » exigée
  // et tracée (consentement parental versionné) — la désactivation est
  // immédiate et tracée comme retrait.
  const setChildAccessFn = useServerFn(setChildPlatformAccess);
  const [childAccessDialog, setChildAccessDialog] = useState(false);
  const [childAccessAttested, setChildAccessAttested] = useState(false);
  const [childAccessBusy, setChildAccessBusy] = useState(false);

  async function applyChildAccess(value: boolean) {
    if (!player) return;
    setChildAccessBusy(true);
    try {
      const res = await setChildAccessFn({
        data: {
          player_id: player.id,
          enabled: value,
          attestation: value ? true : undefined,
          // Langue du document effectivement affiché au parent : c'est cette
          // version-là que la trace de consentement doit référencer.
          locale: i18n.language?.split("-")[0],
        },
      });
      if (!res.ok) {
        toast.error(
          res.error === "parent_required"
            ? t("players.childAccessParentOnly", {
                defaultValue: "Seul un parent ou représentant légal peut activer l'accès.",
              })
            : res.error === "attestation_required"
              ? t("players.childConsentParent", {
                  defaultValue:
                    "Je confirme être le représentant légal de ce joueur et j'autorise la création de son accès.",
                })
              : res.error,
        );
        return;
      }
      refetchPlayer();
      toast.success(t("common.saved"));
      setChildAccessDialog(false);
      setChildAccessAttested(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setChildAccessBusy(false);
    }
  }

  function toggleChildAccess(value: boolean) {
    if (!player) return;
    if (value) {
      // Activation réservée au représentant légal (garde-fou aussi côté
      // serveur et par trigger DB) ; le staff peut seulement désactiver.
      if (!isParentOfThisPlayer) {
        toast.error(
          t("players.childAccessParentOnly", {
            defaultValue: "Seul un parent ou représentant légal peut activer l'accès.",
          }),
        );
        return;
      }
      const target = (email || player.email || "").trim();
      if (!target) {
        toast.error(t("players.childAccessNeedsEmail"));
        return;
      }
      setChildAccessAttested(false);
      setChildAccessDialog(true);
      return;
    }
    void applyChildAccess(false);
  }

  // ---- Parent form (collapsed) — used for add AND edit ----
  const [showParentForm, setShowParentForm] = useState(false);
  const [editingParentId, setEditingParentId] = useState<string | null>(null);
  const [pFirstName, setPFirstName] = useState("");
  const [pLastName, setPLastName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pCanRespond, setPCanRespond] = useState(true);
  const [pBusy, setPBusy] = useState(false);

  function resetParentForm() {
    setEditingParentId(null);
    setPFirstName("");
    setPLastName("");
    setPPhone("");
    setPEmail("");
    setPCanRespond(true);
  }

  function startEditParent(pp: PlayerParentRow) {
    // Best-effort split of full_name into first/last for editing.
    const raw = (pp.full_name ?? "").trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    setEditingParentId(pp.id);
    setPFirstName(first);
    setPLastName(last);
    setPPhone(pp.phone ?? "");
    setPEmail(pp.email ?? "");
    setPCanRespond(!!pp.can_respond);
    setShowParentForm(true);
  }

  async function onSubmitParent(e: FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    setPBusy(true);
    const fullName = [pFirstName, pLastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    const payload = {
      full_name: fullName || null,
      phone: pPhone || null,
      email: pEmail || null,
      can_respond: pCanRespond,
    };
    const { error } = editingParentId
      ? await supabase.from("player_parents").update(payload).eq("id", editingParentId)
      : await supabase.from("player_parents").insert({
          player_id: playerId,
          parent_user_id: null,
          ...payload,
        });
    setPBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    resetParentForm();
    setShowParentForm(false);
    refetchParents();
    toast.success(t("common.saved"));
  }

  async function onDeleteParent(id: string) {
    await supabase.from("player_parents").delete().eq("id", id);
    refetchParents();
  }

  if (!player) {
    return <PlayerDetailSkeleton />;
  }

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <BackButton
        onClick={() => {
          const canGoBack = router.history.length > 1;
          if (canGoBack) {
            router.history.back();
            return;
          }
          const teamId = playerTeams?.[0]?.id;
          if (teamId) navigate({ to: "/teams/$teamId", params: { teamId } });
          else navigate({ to: "/teams" });
        }}
      />

      {/* PLAYER (main) */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 rounded-full overflow-hidden shrink-0 shadow-sm">
          {player.photo_url ? (
            <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className={`h-full w-full flex items-center justify-center text-lg font-bold ${avatarGradient(player.id)}`}
            >
              {initialsFrom(player.first_name, player.last_name)}
            </div>
          )}

          {(isCoach || isSelf || isParentOfThisPlayer) && (
            <span
              className={cn(
                "absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background",
                accountStatus === "active"
                  ? "bg-present"
                  : accountStatus === "inactive"
                    ? "bg-muted-foreground/40"
                    : "bg-uncertain",
              )}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">
            {player.first_name} {player.last_name}
          </h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {(isCoach || isSelf || isParentOfThisPlayer) && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
                  accountStatus === "active"
                    ? "bg-present/15 text-present"
                    : accountStatus === "inactive"
                      ? "bg-muted text-muted-foreground"
                      : "bg-uncertain/15 text-uncertain",
                )}
              >
                {accountStatusLabel}
              </span>
            )}
            {minor && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                {t("players.minor")}
              </span>
            )}
            {(() => {
              const now = new Date();
              const seasonEndYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
              const cat = computeFffCategory(player.birth_date ?? null, seasonEndYear);
              return cat ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {cat}
                </span>
              ) : null;
            })()}
          </div>
          {playerTeams && playerTeams.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">
                {t("players.teamsLabel")}
              </span>
              {playerTeams.map((tm) => (
                <Link
                  key={tm.id}
                  to="/teams/$teamId"
                  params={{ teamId: tm.id }}
                  className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                >
                  {tm.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {player.user_id && user?.id && player.user_id !== user.id && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-amber-600"
            onClick={() => setReportOpen(true)}
            aria-label={t("userReport.action", { defaultValue: "Signaler cette personne" })}
            title={t("userReport.action", { defaultValue: "Signaler cette personne" })}
          >
            <Flag className="h-4 w-4" />
          </Button>
        )}
        {player.user_id && user?.id && player.user_id !== user.id && (
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-9 w-9 shrink-0",
              mutedUsers.has(player.user_id)
                ? "text-destructive"
                : "text-muted-foreground hover:text-destructive",
            )}
            onClick={async () => {
              if (mutedUsers.has(player.user_id!)) {
                const { error } = await unmuteUser(player.user_id!);
                if (error)
                  toast.error(t("common.error", { defaultValue: "Une erreur est survenue" }));
                else toast.success(t("mutes.unmuted", { defaultValue: "Contenus réaffichés." }));
              } else {
                setMuteOpen(true);
              }
            }}
            aria-label={
              mutedUsers.has(player.user_id)
                ? t("mutes.unmute", { defaultValue: "Réafficher" })
                : t("mutes.action", { defaultValue: "Masquer cette personne" })
            }
            title={
              mutedUsers.has(player.user_id)
                ? t("mutes.unmute", { defaultValue: "Réafficher" })
                : t("mutes.action", { defaultValue: "Masquer cette personne" })
            }
          >
            <UserX className="h-4 w-4" />
          </Button>
        )}
        {isCoach && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {player.user_id && player.club_id && (
        <WallReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          postId={null}
          reportedUser={{
            userId: player.user_id,
            name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "—",
            clubId: player.club_id,
          }}
        />
      )}

      <AlertDialog
        open={childAccessDialog}
        onOpenChange={(v) => {
          setChildAccessDialog(v);
          if (!v) setChildAccessAttested(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("players.childConsentTitle", {
                defaultValue: "Activer l'accès plateforme de {{name}} ?",
                name: `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim() || "—",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("players.childConsentBody", {
                defaultValue:
                  "Le joueur mineur recevra une invitation pour créer son propre accès Clubero, sous la responsabilité de son représentant légal.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm cursor-pointer">
            <Checkbox
              checked={childAccessAttested}
              onCheckedChange={(v) => setChildAccessAttested(v === true)}
              className="mt-0.5"
            />
            <span>
              {t("players.childConsentParent", {
                defaultValue:
                  "Je confirme être le représentant légal de ce joueur et j'autorise la création de son accès.",
              })}
            </span>
          </label>
          <Link
            to="/legal/$kind"
            params={{ kind: "parental_consent" }}
            target="_blank"
            className="text-xs text-primary hover:underline"
          >
            {t("players.childConsentDoc", {
              defaultValue: "Lire le document « Consentement parental »",
            })}
          </Link>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!childAccessAttested || childAccessBusy}
              onClick={() => applyChildAccess(true)}
            >
              {t("players.childConsentConfirm", { defaultValue: "Activer l'accès" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={muteOpen} onOpenChange={setMuteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("mutes.confirmTitle", {
                defaultValue: "Masquer les contenus de {{name}} ?",
                name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "—",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("mutes.confirmBody", {
                defaultValue:
                  "Vous ne verrez plus ses publications, commentaires, réactions et messages. Les communications officielles (convocations, événements, notifications) restent visibles. Vous pourrez la réafficher à tout moment depuis Profil → Confidentialité.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!player.user_id) return;
                const { error } = await muteUser(player.user_id);
                if (error) {
                  toast.error(t("common.error", { defaultValue: "Une erreur est survenue" }));
                  return;
                }
                toast.success(
                  t("mutes.muted", {
                    defaultValue: "Les contenus de {{name}} sont masqués.",
                    name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "—",
                  }),
                );
                setMuteOpen(false);
              }}
            >
              {t("mutes.confirm", { defaultValue: "Masquer" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick action: declare absence (coach, self, parent) */}
      {(isCoach || isSelf || isParentOfThisPlayer) && (
        <>
          <Button variant="outline" className="w-full h-11" onClick={() => setAbsenceOpen(true)}>
            <Palmtree className="h-4 w-4" />
            {t("availability.declare", { defaultValue: "Déclarer une absence" })}
          </Button>
          <DeclareAbsenceDrawer
            open={absenceOpen}
            onOpenChange={setAbsenceOpen}
            playerId={player.id}
          />
        </>
      )}

      {/* Tabs */}
      {(isCoach || isSelf || isParentOfThisPlayer) && (
        <div className="flex gap-1 border-b border-border -mx-5 px-5 -mt-2 pt-1 overflow-x-auto">
          {isCoach && (
            <>
              <Link
                to="/players/$playerId"
                params={{ playerId }}
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                  !isSubRoute
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t("players.tabProfile", { defaultValue: "Profil" })}
              </Link>
              {SHOW_PUBLIC_PROFILE_FEATURES && (
                <>
                  <Link
                    to="/players/$playerId/seasons"
                    params={{ playerId }}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                      isSeasons
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t("journey.tab.season", { defaultValue: "Saison" })}
                  </Link>
                  <Link
                    to="/players/$playerId/achievements"
                    params={{ playerId }}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                      isAchievements
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    {t("journey.tab.achievements", { defaultValue: "Palmarès" })}
                  </Link>
                  <Link
                    to="/players/$playerId/timeline"
                    params={{ playerId }}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                      isTimeline
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <History className="h-3.5 w-3.5" />
                    {t("journey.tab.timeline", { defaultValue: "Timeline" })}
                  </Link>
                </>
              )}
            </>
          )}
          {(isCoach || isSelf || isParentOfThisPlayer) && (
            <Link
              to="/players/$playerId/challenges"
              params={{ playerId }}
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                isChallenges
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Trophy className="h-3.5 w-3.5" />
              {t("challenges:player_stats.title", { defaultValue: "Défis" })}
            </Link>
          )}
          {isCoach && (
            <>
              <Link
                to="/players/$playerId/feedback"
                params={{ playerId }}
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
                  isFeedback
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                {t("players.tabFeedback", { defaultValue: "Retours coach" })}
              </Link>
            </>
          )}
          <Link
            to="/players/$playerId/availability"
            params={{ playerId }}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap",
              isAvailability
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Palmtree className="h-3.5 w-3.5" />
            {t("availability.title", { defaultValue: "Disponibilités" })}
          </Link>
        </div>
      )}

      {isSubRoute ? (
        <Outlet />
      ) : (
        <>
          {SHOW_PUBLIC_PROFILE_FEATURES &&
            (isCoach || isSelf || isParentOfThisPlayer) &&
            !minor && (
              <PublicProfileCard
                playerId={player.id}
                enabled={!!(player as { public_profile_enabled?: boolean }).public_profile_enabled}
                slug={(player as { public_slug?: string | null }).public_slug ?? null}
                onChanged={() => qc.invalidateQueries({ queryKey: ["player", playerId] })}
              />
            )}
          <form
            onSubmit={onSave}
            className="space-y-4 rounded-2xl border border-border bg-card p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("players.details")}
            </h2>

            {(() => {
              const canUploadPhoto = isCoach || isParentOfThisPlayer || (isSelf && !minor);
              if (!canUploadPhoto) return null;
              return (
                <div className="space-y-1.5">
                  <Label>{t("players.photo")}</Label>
                  <label className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 cursor-pointer">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
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
                  {minor && player.media_consent_status !== "granted" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t("players.photoConsentRequired")}
                      <b>{player.media_consent_status}</b>
                    </p>
                  )}
                </div>
              );
            })()}

            {(() => {
              const canEditIdentity = isCoach;
              const canEditContact = isCoach || isParentOfThisPlayer || isSelf;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("players.firstName")}</Label>
                      <Input
                        required
                        value={first}
                        onChange={(e) => setFirst(e.target.value)}
                        disabled={!canEditIdentity}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("players.lastName")}</Label>
                      <Input
                        required
                        value={last}
                        onChange={(e) => setLast(e.target.value)}
                        disabled={!canEditIdentity}
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
                        disabled={!canEditIdentity}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("players.preferredPosition")}</Label>
                      <PositionCombobox
                        value={position}
                        onChange={setPosition}
                        sport={playerSport ?? null}
                        disabled={!canEditIdentity}
                      />
                    </div>
                  </div>
                  {canSeePrivate && (
                    <div className="space-y-1.5">
                      <Label>{t("players.licenseNumber")}</Label>
                      <Input
                        value={license}
                        onChange={(e) => setLicense(e.target.value)}
                        disabled={!canEditIdentity}
                        placeholder="FFF-2025-12345"
                      />
                    </div>
                  )}
                  {canSeePrivate && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{t("players.birthDate")}</Label>
                        <Input
                          type="date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          disabled={!canEditContact}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("players.phone")}</Label>
                        {canEditContact ? (
                          <PhoneInput value={phone} onChange={setPhone} />
                        ) : (
                          <Input value={phone} disabled />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("players.email")}</Label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={!canEditContact}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                        <span className="text-sm">
                          {t("players.canRespond")} ({t("players.respondPlayer")})
                        </span>
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-primary disabled:opacity-60"
                          checked={minor ? canRespond : true}
                          onChange={(e) => setCanRespond(e.target.checked)}
                          disabled={!canEditContact || !minor}
                        />
                      </div>
                    </>
                  )}

                  {(canEditIdentity || canEditContact) && (
                    <Button type="submit" className="w-full h-11" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
                    </Button>
                  )}

                  {(isCoach || isParentOfThisPlayer) && !player.user_id && !minor && (
                    <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {t("players.inviteAdultHint", {
                          defaultValue:
                            "Le joueur n'a pas encore de compte. Envoie-lui une invitation par email pour qu'il crée son accès.",
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={!(email || player.email)}
                        onClick={() => {
                          const target = (email || player.email || "").trim();
                          if (!target) {
                            toast.warning(t("players.inviteNoContact"));
                            return;
                          }
                          sendChildOnboardingInvite(target);
                        }}
                      >
                        {t("players.invitePlayer", {
                          defaultValue: "Inviter le joueur à créer son compte",
                        })}
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </form>

          {isCoach && player.club_id && (
            <PlayerSuspensions playerId={player.id} clubId={player.club_id} />
          )}

          {/* CHILD PLATFORM ACCESS — only meaningful for minors, controlled by their parent */}
          {minor && (isParentOfThisPlayer || isCoach) && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("players.childAccessTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("players.childAccessHint")}
                  </p>
                </div>
                <Switch
                  checked={!!player.child_platform_access}
                  onCheckedChange={toggleChildAccess}
                  disabled={
                    player.child_platform_access
                      ? !isParentOfThisPlayer && !isCoach
                      : !isParentOfThisPlayer
                  }
                />
              </div>

              {!player.child_platform_access && !isParentOfThisPlayer && (
                <p className="text-xs text-muted-foreground">
                  {t("players.childAccessParentOnly", {
                    defaultValue: "Seul un parent ou représentant légal peut activer l'accès.",
                  })}
                </p>
              )}

              {player.child_platform_access && !player.user_id && (
                <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("players.inviteMinorHint", {
                      defaultValue:
                        "L'accès plateforme est activé mais le joueur n'a pas encore de compte. Envoie-lui l'email d'invitation.",
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={!(email || player.email)}
                    onClick={() => {
                      const target = (email || player.email || "").trim();
                      if (!target) {
                        toast.warning(t("players.inviteNoContact"));
                        return;
                      }
                      sendChildOnboardingInvite(target);
                    }}
                  >
                    {t("players.sendChildInvite", {
                      defaultValue: "Envoyer l'invitation au joueur",
                    })}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* PARENTS — single card grouping the viewer's own record + co-parents */}

          {canSeePrivate && (minor || (parents ?? []).length > 0) && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("players.parents")}
                </h2>
                {isCoach && !showParentForm && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setShowParentForm(true)}
                  >
                    <Plus className="h-4 w-4" /> {t("players.addParent")}
                  </Button>
                )}
              </div>

              {(parents ?? []).length === 0 && !showParentForm && (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <UserCircle2 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {minor ? t("players.parentRequiredForMinor") : t("players.noParents")}
                  </p>
                </div>
              )}

              <ul className="space-y-2">
                {(parents ?? []).map((pp) => {
                  const linked = !!pp.parent_user_id;
                  const accountBadge = resolveParentAccountBadge({
                    parentUserId: pp.parent_user_id,
                    unconfirmedUserIds: unconfirmedParentIds,
                  });
                  const displayName = parentDisplayName(pp);
                  const contactLine = parentContactLine(pp, displayName);
                  const emailKey = pp.email?.trim().toLowerCase() ?? "";
                  const inviteSent = !linked && !!emailKey && invitedEmails.has(emailKey);
                  const inviteFailed =
                    !linked && !!emailKey && !inviteSent && failedEmailsMap.has(emailKey);
                  const inviteFailedEntry = inviteFailed
                    ? (failedEmailsMap.get(emailKey) ?? null)
                    : null;
                  const inviteFailedReasonLabel =
                    inviteFailedEntry && (inviteFailedEntry.reason || inviteFailedEntry.error)
                      ? formatSuppressionReason(inviteFailedEntry.reason ?? inviteFailedEntry.error)
                      : null;
                  return (
                    <li
                      key={pp.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3"
                    >
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate text-sm">
                            {displayName ?? t("players.linkedParentNoDetails")}
                          </p>
                          <span
                            className={cn(
                              "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                              accountBadge === "active"
                                ? "bg-present/15 text-present"
                                : accountBadge === "unconfirmed"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground",
                            )}
                            title={
                              accountBadge === "unconfirmed"
                                ? t("players.accountUnconfirmedHint")
                                : undefined
                            }
                          >
                            {accountBadge === "unconfirmed"
                              ? t("players.accountUnconfirmed")
                              : accountBadge === "active"
                                ? t("players.accountActive")
                                : t("players.accountInactive")}
                          </span>
                          {inviteSent && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                              title={t("players.inviteSentHint", {
                                defaultValue: "Un email d'invitation a été envoyé à ce parent",
                              })}
                            >
                              <Send className="h-3 w-3" />
                              {t("players.inviteSent", {
                                defaultValue: "Invitation envoyée",
                              })}
                            </span>
                          )}
                          {inviteFailed && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive"
                              title={
                                inviteFailedReasonLabel ??
                                t("players.inviteFailedHint", {
                                  defaultValue: "L'email d'invitation n'a pas pu être délivré",
                                })
                              }
                            >
                              <X className="h-3 w-3" />
                              {t("players.inviteFailed", {
                                defaultValue: "Envoi échoué",
                              })}
                            </span>
                          )}
                        </div>
                        {inviteFailed && inviteFailedReasonLabel && (
                          <p className="text-[11px] text-destructive mt-1 leading-snug">
                            {t("players.inviteFailedReason", {
                              defaultValue: "Raison : {{reason}}",
                              reason: inviteFailedReasonLabel,
                            })}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {[contactLine, pp.can_respond ? t("players.canRespond") : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      {isCoach && !linked && (pp.email || pp.phone) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => resendParentInvite(pp)}
                          title={t("players.resendInvite")}
                        >
                          <Send className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {(isCoach || pp.parent_user_id === user?.id) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => startEditParent(pp)}
                          title={t("common.edit", { defaultValue: "Modifier" })}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      {isCoach && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => onDeleteParent(pp.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </li>
                  );
                })}

                {/* Co-parents (parent viewer only) — names + account status, no private contacts */}
                {isParentOfThisPlayer &&
                  !isCoach &&
                  coParents
                    ?.filter(
                      (p) => p.id !== parents?.find((x) => x.parent_user_id === user?.id)?.id,
                    )
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3"
                      >
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate text-sm">
                              {p.full_name ??
                                t("players.unnamedParent", { defaultValue: "Parent" })}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                p.has_account
                                  ? "bg-present/15 text-present"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {p.has_account
                                ? t("players.parentOnPlatform", {
                                    defaultValue: "Sur la plateforme",
                                  })
                                : t("players.parentNotOnPlatform", {
                                    defaultValue: "Pas encore inscrit",
                                  })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {t("players.parentContactsHidden", {
                              defaultValue: "Coordonnées confidentielles",
                            })}
                          </p>
                        </div>
                      </li>
                    ))}
              </ul>

              {showParentForm && (isCoach || editingParentId) && (
                <form onSubmit={onSubmitParent} className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {editingParentId
                        ? t("common.edit", { defaultValue: "Modifier" })
                        : t("players.addParent")}
                    </p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        resetParentForm();
                        setShowParentForm(false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("players.parentFirstName")}</Label>
                      <Input
                        value={pFirstName}
                        onChange={(e) => setPFirstName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("players.parentLastName")}</Label>
                      <Input
                        value={pLastName}
                        onChange={(e) => setPLastName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t("players.phone")}</Label>
                      <PhoneInput value={pPhone} onChange={setPPhone} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("players.email")}</Label>
                      <Input
                        type="email"
                        value={pEmail}
                        onChange={(e) => setPEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                    <span className="text-sm">{t("players.canRespond")}</span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={pCanRespond}
                      onChange={(e) => setPCanRespond(e.target.checked)}
                    />
                  </div>
                  <Button type="submit" className="w-full h-10" disabled={pBusy}>
                    {pBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editingParentId ? (
                      t("common.save")
                    ) : (
                      t("players.addParent")
                    )}
                  </Button>
                </form>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("players.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("players.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeletePlayer}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
