-- Binary capabilities are issued only after API quota/reservation checks.
-- Direct authenticated Storage calls would otherwise bypass quarantine and
-- reservation cancellation. The server's service role bypasses RLS; API callers
-- use signed, state-checked proxy URLs and never receive this credential.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY private_assets_api_only ON storage.objects
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (bucket_id <> 'private_assets')
      WITH CHECK (bucket_id <> 'private_assets');
  END IF;
END $$;
