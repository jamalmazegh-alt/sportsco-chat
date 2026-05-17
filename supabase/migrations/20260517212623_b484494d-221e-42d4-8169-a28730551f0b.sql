-- Public buckets serve files via CDN URL directly (no policy check needed).
-- The broad SELECT policies allowed any client to enumerate ALL files via
-- the storage.objects API. Dropping them blocks listing while keeping
-- direct URL access intact.
DROP POLICY IF EXISTS attachments_public_read ON storage.objects;
DROP POLICY IF EXISTS club_logos_public_read ON storage.objects;
DROP POLICY IF EXISTS player_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS team_images_public_read ON storage.objects;