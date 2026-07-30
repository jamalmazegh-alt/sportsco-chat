-- Lot 3 mobile (Capacitor) : préparer push_subscriptions au push natif.
--
-- Migration STRICTEMENT ADDITIVE — déployable en prod avant l'app mobile :
--   - aucune colonne existante modifiée, renommée ou relâchée ;
--   - toutes les lignes existantes reçoivent channel='web' via le DEFAULT ;
--   - le code web actuel continue de fonctionner sans connaître `channel`.
--
-- Modèle par canal :
--   - 'web'  : Web Push VAPID — endpoint/p256dh/auth comme aujourd'hui.
--   - 'fcm'  : token FCM (Android) stocké dans `endpoint` (clé naturelle,
--              l'UNIQUE existant fait l'upsert) ; p256dh/auth = '' (les
--              contraintes NOT NULL restent inchangées, ces champs n'ont pas
--              d'équivalent natif).
--   - 'apns' : token APNs (iOS) — même convention que 'fcm'.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_sub_channel_check'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_sub_channel_check CHECK (channel IN ('web', 'fcm', 'apns'));
  END IF;
END $$;

COMMENT ON COLUMN public.push_subscriptions.channel IS
  'Canal de livraison : web (VAPID), fcm (Android natif), apns (iOS natif). '
  'Pour fcm/apns, le token natif est stocké dans endpoint et p256dh/auth valent ''''.';
