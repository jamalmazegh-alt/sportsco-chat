-- =========================================================================
-- CLUBERO — Normes de sécurité des enfants / Child Safety Standards (v1)
-- Page publique exigée par la politique « Child Safety Standards » de
-- Google Play (auto-certification CSAE). Document informatif : required=false,
-- il n'apparaît pas dans les consentements du profil (liste filtrée).
-- =========================================================================

INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md) VALUES

-- ===================== CHILD SAFETY — EN =====================
('child_safety', 1, 'en', false, 'Child Safety Standards',
$md$# Clubero — Child Safety Standards

_Last updated: 1 August 2026_

Clubero is a club management platform used by sports clubs whose members include minors. Protecting children is a core design requirement of the Service, not an afterthought. This page describes our standards against child sexual abuse and exploitation (CSAE) and how we enforce them.

## 1. Zero tolerance for CSAE

We prohibit any content or behaviour that sexualises, abuses, exploits or endangers minors, including but not limited to: child sexual abuse material (CSAM), grooming or solicitation of minors, sextortion, trafficking, and the sharing of a minor's personal information with intent to harm. Any such content or behaviour leads to immediate removal, account termination and reporting to the competent authorities.

## 2. How Clubero is designed to protect minors

- **Closed, invitation-only communities.** All interactions happen inside a club. Members join only through an invitation issued by club officials; there is no public discovery of members and no private messaging between arbitrary users.
- **Parental consent and control.** A minor is registered by their club and linked to a parent or legal guardian. A minor only receives their own login if a parent explicitly enables it. Photos of minors require recorded parental consent, and a minor's public profile requires explicit parental authorisation.
- **Limited communication channels.** Members communicate through the club wall and event chats — spaces visible to the group they belong to, never one-to-one private channels with strangers.

## 3. Reporting content or behaviour

- **In-app**: every wall post, comment and event chat message carries a report button, and any member can be reported from their profile or from the report dialog. Reports reach the club's officials immediately (in-app, push and email) and can be acted on by hiding or deleting content, or removing a member.
- **Blocking**: any member can block another member — their content and notifications disappear for the blocking user.
- **Direct contact**: anyone (including people without an account) can report a concern at **safety@clubero.app**. Reports are acknowledged and reviewed promptly by the Clubero team.

## 4. How we handle CSAE reports

1. Reported content is reviewed as a priority; content assessed as CSAE is removed immediately and the account involved is suspended.
2. Where content constitutes CSAM or indicates a child at risk, we preserve the evidence and report it to the competent authorities — in France via the PHAROS platform and, where applicable, to the relevant hotlines and law-enforcement bodies in the member's country. We cooperate fully with lawful requests from authorities.
3. Club officials involved in a case are informed to the extent necessary to protect the children in their club.

## 5. Legal compliance

Clubero complies with applicable child safety and data protection laws, including the GDPR (parental consent for minors' data) and national child protection regulations in the countries where the Service is used.

## 6. Designated point of contact

Questions or notifications regarding child safety, including from authorities and regulators: **safety@clubero.app**.
$md$),

-- ===================== CHILD SAFETY — FR =====================
('child_safety', 1, 'fr', false, 'Normes de sécurité des enfants',
$md$# Clubero — Normes de sécurité des enfants

_Dernière mise à jour : 1er août 2026_

Clubero est une plateforme de gestion de clubs sportifs dont les membres comptent des mineurs. La protection des enfants est une exigence de conception du Service, pas une option. Cette page décrit nos normes contre l'exploitation et les abus sexuels visant des enfants (CSAE) et la manière dont nous les appliquons.

## 1. Tolérance zéro envers la CSAE

Nous interdisons tout contenu ou comportement qui sexualise, abuse, exploite ou met en danger des mineurs, notamment : contenus d'abus sexuels sur mineurs (CSAM), grooming ou sollicitation de mineurs, sextorsion, traite, et partage d'informations personnelles d'un mineur dans une intention de nuire. Tout contenu ou comportement de ce type entraîne un retrait immédiat, la résiliation du compte et un signalement aux autorités compétentes.

## 2. Comment Clubero protège les mineurs par conception

- **Communautés fermées, sur invitation uniquement.** Toutes les interactions ont lieu au sein d'un club. On ne rejoint un club que par une invitation émise par ses responsables ; il n'existe ni découverte publique des membres, ni messagerie privée entre utilisateurs quelconques.
- **Consentement et contrôle parental.** Un mineur est inscrit par son club et rattaché à un parent ou représentant légal. Il n'obtient son propre accès que si un parent l'active explicitement. Les photos de mineurs exigent un consentement parental enregistré, et le profil public d'un mineur requiert une autorisation parentale explicite.
- **Canaux de communication limités.** Les membres communiquent via le mur du club et les chats d'événement — des espaces visibles du groupe concerné, jamais des canaux privés individuels avec des inconnus.

## 3. Signaler un contenu ou un comportement

- **Dans l'application** : chaque publication, commentaire et message de chat dispose d'un bouton de signalement, et tout membre peut être signalé depuis sa fiche ou depuis le formulaire de signalement. Les signalements parviennent immédiatement aux responsables du club (application, notification push et e-mail), qui peuvent masquer ou supprimer le contenu, ou exclure un membre.
- **Blocage** : tout membre peut masquer un autre membre — ses contenus et notifications disparaissent pour la personne qui bloque.
- **Contact direct** : toute personne (y compris sans compte) peut signaler une préoccupation à **safety@clubero.app**. Les signalements sont pris en compte et examinés rapidement par l'équipe Clubero.

## 4. Traitement des signalements CSAE

1. Les contenus signalés sont examinés en priorité ; tout contenu relevant de la CSAE est retiré immédiatement et le compte concerné est suspendu.
2. Lorsqu'un contenu constitue du CSAM ou révèle un enfant en danger, nous préservons les éléments de preuve et les signalons aux autorités compétentes — en France via la plateforme PHAROS et, le cas échéant, auprès des dispositifs et forces de l'ordre du pays du membre (ex. 3018 en France). Nous coopérons pleinement avec les demandes légales des autorités.
3. Les responsables du club concerné sont informés dans la mesure nécessaire à la protection des enfants de leur club.

## 5. Conformité légale

Clubero respecte les lois applicables en matière de protection de l'enfance et de protection des données, notamment le RGPD (consentement parental pour les données des mineurs) et les réglementations nationales de protection de l'enfance des pays où le Service est utilisé.

## 6. Point de contact désigné

Questions ou notifications relatives à la sécurité des enfants, y compris de la part des autorités et régulateurs : **safety@clubero.app**.
$md$)

ON CONFLICT (kind, version, locale) DO NOTHING;
