DO $$
DECLARE
  v_secret text := 'KpNRyeIAA1kXXaZRCC4DSKrrmPuw7xTivno9-ePMuQA-GNSQ_54qAkTJKVYeG-Hi';
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'data_retention_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'data_retention_secret', 'Secret for data retention cron endpoint');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret);
  END IF;
END $$;