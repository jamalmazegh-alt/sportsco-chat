DO $$
DECLARE
  v_jobid bigint;
  v_token text := 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZW1haWwtY3JvbiIsInByb2plY3RfaWQiOiI2MTliMTNmMi05MWVmLTRkZWUtYjk2Yy1mNDliMzhkODZiMzkiLCJhY2Nlc3NfdHlwZSI6InByb2plY3QiLCJpc3MiOiJsb3ZhYmxlLWFwaSIsInN1YiI6IjYxOWIxM2YyLTkxZWYtNGRlZS1iOTZjLWY0OWIzOGQ4NmIzOSIsImF1ZCI6WyJsb3ZhYmxlLWFwcCJdLCJleHAiOjE3Nzg4NDc3NTAsIm5iZiI6MTc3ODc2MTM1MCwiaWF0IjoxNzc4NzYxMzUwfQ.VrpL33xUZl4dDVMbFFZZUpvNwdfg2MEOSYSQe2bk1ZsPCuSSSoXvvC4xs99DKBr1nKIVXIoc4WTLrI2TCq0Uefz7wA3Osx57_zNIJF9Xb1GbrMG0d7U8CJA3TQ8egZNDX-zBgtcYxQAdcJRdSD1k78kWusuN-l9qnCiDrhiHBetBr9C26KaAOJPR5V0yc3O7sS6cGE7XFFF3p5LjJ_Yg-qOEWpLYFJGd35mTnGR8v_LBlO2EabiImlt2FmVl2UrcxQB101ZuV06bRUmR6o5WnA98zFAePqw5v42sAj5J6RcemNBWByqlUwcc6Joij7g-yXg71VeHOAFVijLFxO60Rhn9f_Z34x4qBG_5XFUpUE7O6hpwO0LjrNkTG59ixx7iUzz4A5MTo_uYtKdYqCufQvK3IqlnHGlH-3ZlGU-p8hpyifN5TdNCEsAMbypp2MNCkg02nyi5KlGOjCmROKg5mUm5BTbeTQfmBVniQAFY6LopEFBle_KScvSd5ucvAfIEYQcKHdezsqEbU26iaj2Hst3ueCfqrkmlN6MivLWOgH8GlwXQC3OUfgkRtRn1JzH66vK9Ze-_ri5Gl0B-HqNYWxUdpPwaiU3NlLpBkQ0nXlJjmBduNzbMr_82e_uZJTPlTIDoJM3tPM-tMS392XHGY_28v2y1HvEClRQheAPbgdo';
  v_cmd text;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process-email-queue';
  v_cmd := format($cmd$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      THEN net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $cmd$, 'https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app/lovable/email/queue/process?__lovable_token=' || v_token);

  PERFORM cron.alter_job(job_id := v_jobid, command := v_cmd);
END $$;