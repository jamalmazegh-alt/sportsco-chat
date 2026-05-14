
-- Extend consent_kind enum with legal notice + parental consent
ALTER TYPE public.consent_kind ADD VALUE IF NOT EXISTS 'legal_notice';
ALTER TYPE public.consent_kind ADD VALUE IF NOT EXISTS 'parental_consent';
