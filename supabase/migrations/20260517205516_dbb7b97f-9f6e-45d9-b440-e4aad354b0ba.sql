-- Restrict allowed MIME types and enforce size limits server-side.
-- Supabase Storage validates these on upload, regardless of any client-side checks.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ],
  file_size_limit = 5 * 1024 * 1024  -- 5 MB
WHERE id IN ('player-photos', 'club-logos', 'team-images');

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ],
  file_size_limit = 10 * 1024 * 1024  -- 10 MB
WHERE id = 'attachments';