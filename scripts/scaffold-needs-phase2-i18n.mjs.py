#!/usr/bin/env python3
"""
Phase 2 UI i18n scaffolding.

- Merge NEW_KEYS_FR / NEW_KEYS_EN into src/locales/{fr,en}/needs.json
- Clone EN into de/es/it/nl/pt (per project rule: EN clone, tracked in TODO)
- Append a Phase 2 UI section into TODO-i18n-pending.md
"""
import json, os, sys
from pathlib import Path

ROOT = Path("src/locales")

# NEW / OVERRIDDEN keys for Phase 2 UI.
# We MERGE deeply — do not clobber existing keys, but override where the spec
# renames wording (e.g. "publish.preview_*" → keep, add new "publishStep.*").
FR = {
    "card": {
        "publishedAt_one": "Publié il y a {{time}} · {{count}} destinataire",
        "publishedAt_other": "Publié il y a {{time}} · {{count}} destinataires",
        "unpublishedMeta": "Non publié — personne n'a encore été prévenu",
        "seatsRemaining_one": "{{count}} place restante",
        "seatsRemaining_other": "{{count}} places restantes",
        "seatsFullConfirmed_one": "Complet ✓ · {{count}} confirmé",
        "seatsFullConfirmed_other": "Complet ✓ · {{count}} confirmés",
        "applicationsCta": "Candidatures",
        "republish": "Relancer",
        "menuLabel": "Options",
    },
    "badge": {
        "unpublished": "Non publié",
        "closed": "Fermé",
        "cancelled": "Annulé",
    },
    "wizard": {
        "step": "Étape {{current}}/{{total}}",
        "step1Title": "Ajouter un besoin",
        "step2Title": "Qui prévenir ?",
        "commentLabel": "Commentaire ou consignes (optionnel)",
        "commentPlaceholder": "Ex. : Merci d'arriver 30 minutes avant le match",
        "minorReminder": "🛡️ Un candidat mineur est toujours validé par le staff, même en confirmation automatique.",
        "continueToRecipients": "Continuer → Destinataires",
        "back": "Retour",
        "cancel": "Annuler",
    },
    "audiencePicker": {
        "forThisMatch": "Pour ce match",
        "clubGroups": "Groupes du club",
        "teamsCategories": "Équipes & catégories",
        "otherOption": "Autre…",
        "otherOptionMenu": "Autres audiences",
        "chipConvokedPlayers": "Joueurs convoqués",
        "chipConvokedParents": "Parents des convoqués",
        "chipTeamPlayers": "Joueurs · {{team}}",
        "chipTeamParents": "Parents · {{team}}",
        "chipTeamEducators": "Éducateurs · {{team}}",
        "chipCategoryEducators": "Éducateurs · {{category}}",
        "chipClubMembers": "Tous les membres",
        "chipClubStaff": "Staff / bénévoles",
        "chipClubAdmins": "Administrateurs",
        "chipClubEducators": "Éducateurs du club",
        "chipClubTournamentManagers": "Responsables tournois",
    },
    "publishStep": {
        "title": "Qui prévenir ?",
        "recipientsCount_one": "{{count}} personne sera prévenue",
        "recipientsCount_other": "{{count}} personnes seront prévenues",
        "recipientsLoading": "Calcul en cours…",
        "needSummaryLabel": "{{label}}",
        "needSummarySeats_one": "{{count}} place",
        "needSummarySeats_other": "{{count}} places",
        "publishCta": "Publier et prévenir",
        "republishCta_one": "Relancer ({{count}} personne)",
        "republishCta_other": "Relancer ({{count}} personnes)",
        "emptyConvocation": "Personne à prévenir pour l'instant — la convocation n'est pas encore faite. Convoquez d'abord, ou choisissez une autre audience.",
        "emptyGeneric": "Personne à prévenir avec cette sélection. Choisissez une autre audience.",
    },
    "applications": {
        "title": "Candidatures — {{label}}",
        "summary_one": "{{pending}} en attente · {{confirmed}} confirmé · {{seats}} place",
        "summary_other": "{{pending}} en attente · {{confirmed}} confirmés · {{seats}} places",
        "pendingSection": "En attente",
        "confirmedSection": "Confirmés",
        "unavailableSection_one": "Indisponibles ({{count}})",
        "unavailableSection_other": "Indisponibles ({{count}})",
        "confirmedEmpty": "Personne pour l'instant.",
        "assignSection": "Assigner directement",
        "assignHelp": "Vous en avez déjà parlé avec quelqu'un ? Assignez-le : il sera confirmé et prévenu, et pourra se désister.",
        "searchPlaceholder": "Rechercher un membre…",
        "assignCta": "Assigner",
        "removeConfirmed": "Retirer",
        "licenseMissing": "Licence non renseignée",
        "licenseLabel": "Licence {{n}}",
        "minorTag": "Mineur — validation adulte requise",
        "emptyStateActive_one": "Aucune candidature pour le moment. {{recipients}} destinataire prévenu {{ago}} — vous pouvez relancer ou assigner directement quelqu'un ci-dessous.",
        "emptyStateActive_other": "Aucune candidature pour le moment. {{recipients}} destinataires prévenus {{ago}} — vous pouvez relancer ou assigner directement quelqu'un ci-dessous.",
        "emptyStateNotPublished": "Ce besoin n'a pas encore été publié. Publiez-le pour prévenir des volontaires.",
        "close": "Fermer",
    },
    "memberCard": {
        "applyCta": "Je me propose",
        "unavailableCta": "Pas dispo",
        "pending": "Proposition envoyée — en attente de validation",
        "confirmed": "Confirmé ✓ — rappel la veille",
        "cancelledByClub": "Annulé par le club",
        "expandComment": "Voir la consigne",
        "collapseComment": "Réduire",
        "commentApplyPlaceholder": "Un mot pour le staff (optionnel)",
        "applyDialogTitle": "Je me propose",
        "applyDialogConfirm": "Envoyer ma proposition",
    },
    "unavailable": {
        "sectionTitle": "Indisponibles",
        "sectionTitleCount_one": "Indisponibles ({{count}})",
        "sectionTitleCount_other": "Indisponibles ({{count}})",
        "backToApply": "Je me propose finalement",
        "confirmed": "Marqué indisponible",
    },
    "editDialog": {
        "title": "Modifier le besoin",
        "labelLabel": "Libellé",
        "capacityLabel": "Places",
        "modeLabel": "Validation",
        "commentLabel": "Commentaire ou consignes",
        "audienceNote": "👥 L'audience se modifie via « Relancer » (la sélection y est rééditable avant l'envoi).",
        "save": "Enregistrer",
        "cancel": "Annuler",
        "capacityBelowConfirmed_one": "Impossible de passer à {{capacity}} place : {{confirmed}} personne est déjà confirmée. Retirez d'abord un confirmé.",
        "capacityBelowConfirmed_other": "Impossible de passer à {{capacity}} places : {{confirmed}} personnes sont déjà confirmées. Retirez d'abord un confirmé.",
    },
    "deleteDraft": {
        "title": "Supprimer ce brouillon ?",
        "description": "Le brouillon sera supprimé définitivement. Aucun destinataire ne sera prévenu.",
        "confirm": "Supprimer",
        "abort": "Retour",
        "success": "Brouillon supprimé.",
    },
    "closeDialog2": {
        "title": "Fermer le besoin ?",
        "description_one": "Plus besoin de volontaires (poste pourvu autrement). Les candidatures s'arrêtent ; le {{confirmed}} confirmé reste attendu et garde son rappel.",
        "description_other": "Plus besoin de volontaires (poste pourvu autrement). Les {{confirmed}} confirmés restent attendus et gardent leur rappel.",
        "descriptionEmpty": "Plus besoin de volontaires (poste pourvu autrement). Les candidatures s'arrêtent.",
        "confirm": "Fermer le besoin",
        "abort": "Retour",
    },
    "cancelDialog2": {
        "title": "Annuler le besoin ?",
        "descriptionMany": "Ce besoin n'aura plus lieu. {{confirmed}} confirmés et {{pending}} candidatures en attente seront prévenus qu'ils ne sont plus attendus.",
        "descriptionOnlyConfirmed_one": "Ce besoin n'aura plus lieu. {{confirmed}} personne confirmée sera prévenue qu'elle n'est plus attendue.",
        "descriptionOnlyConfirmed_other": "Ce besoin n'aura plus lieu. {{confirmed}} personnes confirmées seront prévenues qu'elles ne sont plus attendues.",
        "descriptionOnlyPending_one": "Ce besoin n'aura plus lieu. {{pending}} candidature en attente sera prévenue.",
        "descriptionOnlyPending_other": "Ce besoin n'aura plus lieu. {{pending}} candidatures en attente seront prévenues.",
        "descriptionNone": "Ce besoin n'aura plus lieu. Personne n'a candidaté, aucune notification ne sera envoyée.",
        "confirm": "Annuler le besoin",
        "abort": "Retour",
    },
    "menu": {
        "edit": "Modifier",
        "closeNeed": "Fermer le besoin",
        "cancelNeed": "Annuler le besoin",
        "delete": "Supprimer",
    },
    "assignNotification": {
        "assignedAs": "Vous avez été inscrit comme {{role}}",
    },
}

EN = {
    "card": {
        "publishedAt_one": "Published {{time}} ago · {{count}} recipient",
        "publishedAt_other": "Published {{time}} ago · {{count}} recipients",
        "unpublishedMeta": "Not published — nobody has been notified yet",
        "seatsRemaining_one": "{{count}} spot left",
        "seatsRemaining_other": "{{count}} spots left",
        "seatsFullConfirmed_one": "Full ✓ · {{count}} confirmed",
        "seatsFullConfirmed_other": "Full ✓ · {{count}} confirmed",
        "applicationsCta": "Applications",
        "republish": "Re-notify",
        "menuLabel": "Options",
    },
    "badge": {
        "unpublished": "Not published",
        "closed": "Closed",
        "cancelled": "Cancelled",
    },
    "wizard": {
        "step": "Step {{current}}/{{total}}",
        "step1Title": "Add a need",
        "step2Title": "Who should we notify?",
        "commentLabel": "Comment or instructions (optional)",
        "commentPlaceholder": "e.g. Please arrive 30 minutes before the match",
        "minorReminder": "🛡️ A minor applicant always requires staff approval, even in auto-confirm mode.",
        "continueToRecipients": "Continue → Recipients",
        "back": "Back",
        "cancel": "Cancel",
    },
    "audiencePicker": {
        "forThisMatch": "For this match",
        "clubGroups": "Club groups",
        "teamsCategories": "Teams & categories",
        "otherOption": "Other…",
        "otherOptionMenu": "Other audiences",
        "chipConvokedPlayers": "Called-up players",
        "chipConvokedParents": "Parents of called-up players",
        "chipTeamPlayers": "Players · {{team}}",
        "chipTeamParents": "Parents · {{team}}",
        "chipTeamEducators": "Coaches · {{team}}",
        "chipCategoryEducators": "Coaches · {{category}}",
        "chipClubMembers": "All members",
        "chipClubStaff": "Staff / volunteers",
        "chipClubAdmins": "Administrators",
        "chipClubEducators": "Club coaches",
        "chipClubTournamentManagers": "Tournament managers",
    },
    "publishStep": {
        "title": "Who should we notify?",
        "recipientsCount_one": "{{count}} person will be notified",
        "recipientsCount_other": "{{count}} people will be notified",
        "recipientsLoading": "Calculating…",
        "needSummaryLabel": "{{label}}",
        "needSummarySeats_one": "{{count}} spot",
        "needSummarySeats_other": "{{count}} spots",
        "publishCta": "Publish and notify",
        "republishCta_one": "Re-notify ({{count}} person)",
        "republishCta_other": "Re-notify ({{count}} people)",
        "emptyConvocation": "Nobody to notify right now — the call-up hasn't been sent yet. Send call-ups first, or choose a different audience.",
        "emptyGeneric": "Nobody to notify with this selection. Choose a different audience.",
    },
    "applications": {
        "title": "Applications — {{label}}",
        "summary_one": "{{pending}} pending · {{confirmed}} confirmed · {{seats}} spot",
        "summary_other": "{{pending}} pending · {{confirmed}} confirmed · {{seats}} spots",
        "pendingSection": "Pending",
        "confirmedSection": "Confirmed",
        "unavailableSection_one": "Unavailable ({{count}})",
        "unavailableSection_other": "Unavailable ({{count}})",
        "confirmedEmpty": "Nobody yet.",
        "assignSection": "Assign directly",
        "assignHelp": "Already agreed with someone? Assign them: they'll be confirmed and notified, and can still withdraw.",
        "searchPlaceholder": "Search a member…",
        "assignCta": "Assign",
        "removeConfirmed": "Remove",
        "licenseMissing": "License not provided",
        "licenseLabel": "License {{n}}",
        "minorTag": "Minor — adult approval required",
        "emptyStateActive_one": "No applications yet. {{recipients}} recipient was notified {{ago}} — you can re-notify or directly assign someone below.",
        "emptyStateActive_other": "No applications yet. {{recipients}} recipients were notified {{ago}} — you can re-notify or directly assign someone below.",
        "emptyStateNotPublished": "This need hasn't been published yet. Publish it to reach volunteers.",
        "close": "Close",
    },
    "memberCard": {
        "applyCta": "I'll help",
        "unavailableCta": "Not available",
        "pending": "Application sent — waiting for approval",
        "confirmed": "Confirmed ✓ — reminder the day before",
        "cancelledByClub": "Cancelled by the club",
        "expandComment": "Show note",
        "collapseComment": "Hide",
        "commentApplyPlaceholder": "A word for the staff (optional)",
        "applyDialogTitle": "I'll help",
        "applyDialogConfirm": "Send my application",
    },
    "unavailable": {
        "sectionTitle": "Unavailable",
        "sectionTitleCount_one": "Unavailable ({{count}})",
        "sectionTitleCount_other": "Unavailable ({{count}})",
        "backToApply": "Actually, I'll help",
        "confirmed": "Marked unavailable",
    },
    "editDialog": {
        "title": "Edit need",
        "labelLabel": "Label",
        "capacityLabel": "Spots",
        "modeLabel": "Approval",
        "commentLabel": "Comment or instructions",
        "audienceNote": "👥 The audience is edited via \"Re-notify\" (the selection is editable before sending).",
        "save": "Save",
        "cancel": "Cancel",
        "capacityBelowConfirmed_one": "Can't reduce to {{capacity}} spot: {{confirmed}} person is already confirmed. Remove a confirmed volunteer first.",
        "capacityBelowConfirmed_other": "Can't reduce to {{capacity}} spots: {{confirmed}} people are already confirmed. Remove a confirmed volunteer first.",
    },
    "deleteDraft": {
        "title": "Delete this draft?",
        "description": "The draft will be permanently deleted. Nobody will be notified.",
        "confirm": "Delete",
        "abort": "Back",
        "success": "Draft deleted.",
    },
    "closeDialog2": {
        "title": "Close this need?",
        "description_one": "No more volunteers needed (spot filled otherwise). Applications stop; the {{confirmed}} confirmed volunteer is still expected and keeps their reminder.",
        "description_other": "No more volunteers needed (spot filled otherwise). The {{confirmed}} confirmed volunteers are still expected and keep their reminders.",
        "descriptionEmpty": "No more volunteers needed (spot filled otherwise). Applications stop.",
        "confirm": "Close need",
        "abort": "Back",
    },
    "cancelDialog2": {
        "title": "Cancel this need?",
        "descriptionMany": "This need won't happen. {{confirmed}} confirmed and {{pending}} pending applicants will be notified they're no longer expected.",
        "descriptionOnlyConfirmed_one": "This need won't happen. {{confirmed}} confirmed person will be notified they're no longer expected.",
        "descriptionOnlyConfirmed_other": "This need won't happen. {{confirmed}} confirmed people will be notified they're no longer expected.",
        "descriptionOnlyPending_one": "This need won't happen. {{pending}} pending applicant will be notified.",
        "descriptionOnlyPending_other": "This need won't happen. {{pending}} pending applicants will be notified.",
        "descriptionNone": "This need won't happen. Nobody applied, so no notification will be sent.",
        "confirm": "Cancel need",
        "abort": "Back",
    },
    "menu": {
        "edit": "Edit",
        "closeNeed": "Close need",
        "cancelNeed": "Cancel need",
        "delete": "Delete",
    },
    "assignNotification": {
        "assignedAs": "You've been assigned as {{role}}",
    },
}


def deep_merge(dst: dict, src: dict) -> dict:
    """Merge src into dst, adding only missing keys (never clobbers existing)."""
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            deep_merge(dst[k], v)
        elif k not in dst:
            dst[k] = v
    return dst


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p: Path, data: dict) -> None:
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# 1) FR + EN — merge NEW keys (never overwrite existing wording).
fr_path = ROOT / "fr" / "needs.json"
en_path = ROOT / "en" / "needs.json"
fr = load(fr_path); dump(fr_path, deep_merge(fr, FR))
en = load(en_path); dump(en_path, deep_merge(en, EN))

# 2) Clone EN into 5 other langs (DE/ES/IT/NL/PT) — MERGE, don't overwrite native wording.
for lang in ("de", "es", "it", "nl", "pt"):
    p = ROOT / lang / "needs.json"
    if not p.exists():
        continue
    d = load(p)
    dump(p, deep_merge(d, EN))

# 3) TODO-i18n-pending.md entry
todo = Path("TODO-i18n-pending.md")
existing = todo.read_text(encoding="utf-8") if todo.exists() else ""
STAMP = "## needs.json — Phase 2 UI (Coups de main v2)"
if STAMP not in existing:
    added = "\n" + STAMP + "\n\n" + (
        "Clones EN → DE/ES/IT/NL/PT pour les namespaces ajoutés :\n"
        "`card`, `badge`, `wizard`, `audiencePicker`, `publishStep`, "
        "`applications`, `memberCard`, `unavailable`, `editDialog`, "
        "`deleteDraft`, `closeDialog2`, `cancelDialog2`, `menu`, "
        "`assignNotification`.\n\n"
        "→ Traductions natives DE/ES/IT/NL/PT à fournir.\n"
    )
    todo.write_text(existing + added, encoding="utf-8")

print("i18n Phase 2 scaffolding: OK")
