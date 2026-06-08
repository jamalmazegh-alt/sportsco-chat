---
name: Privacy worker (RGPD)
description: Worker serveur traitant les demandes d'export/suppression RGPD, cron + validation superadmin
type: feature
---
Worker RGPD : `src/lib/privacy-worker.server.ts` (jamais importé côté client).

**Exports** : auto, traités par cron pg_cron `privacy-worker-process-exports` (*/5 min) qui POST sur `/api/public/hooks/privacy-worker` (auth = header `apikey` = anon key). Bundle JSON uploadé dans bucket privé `privacy-exports`, lien signé 7j, email template `data-export-ready`.

**Suppressions** : validation superadmin obligatoire (jamais auto). Approbation depuis dashboard superadmin → choix anonymisation (RPC `privacy_anonymize_user`) ou suppression dure (`auth.admin.deleteUser` + cascade). Email `account-deleted` envoyé avant perte d'accès. Anonymisation ban le user (876000h) + change email vers `deleted+<uuid>@clubero.app`.

**Tables modifiées** : `data_export_requests` (+processed_by, file_path), `account_deletion_requests` (+approved_at/by, processed_by, error, hard_delete).

**Dashboard** : composant `src/components/superadmin/privacy-requests-section.tsx` intégré dans `/superadmin` (index). Actions : Traiter (export pending/failed), Anonymiser, Suppr. dure, Rejeter.

Server fns admin dans `src/lib/privacy-admin.functions.ts` (vérification super_admin via ensureSuperAdmin avant chaque action).
