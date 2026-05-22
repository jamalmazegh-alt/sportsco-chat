-- Extend match status enum with special outcomes
ALTER TYPE tournament_match_status ADD VALUE IF NOT EXISTS 'forfeit_a';
ALTER TYPE tournament_match_status ADD VALUE IF NOT EXISTS 'forfeit_b';
ALTER TYPE tournament_match_status ADD VALUE IF NOT EXISTS 'no_show_a';
ALTER TYPE tournament_match_status ADD VALUE IF NOT EXISTS 'no_show_b';
ALTER TYPE tournament_match_status ADD VALUE IF NOT EXISTS 'abandoned';