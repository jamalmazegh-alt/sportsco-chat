-- Normes de sécurité des enfants (exigence Google Play « Child Safety
-- Standards » pour les apps à composante sociale) : nouveau kind de document
-- légal. Le contenu est seedé dans la migration suivante (un ADD VALUE ne
-- peut pas être utilisé dans la même transaction).
ALTER TYPE public.consent_kind ADD VALUE IF NOT EXISTS 'child_safety';
