-- 00076_feedback_triage_notes_audit_and_retention.sql
-- Phase 83: Developer feedback triage, internal notes, audit trail, and bounded retention.

-- 1. Extend app.feedback_reports with triage fields
ALTER TABLE app.feedback_reports
  DROP CONSTRAINT IF EXISTS feedback_reports_status_check;

ALTER TABLE app.feedback_reports
  ADD CONSTRAINT feedback_reports_status_check
  CHECK (status IN (
    'new',
    'received',
    'acknowledged',
    'investigating',
    'triaged',
    'in_progress',
    'resolved',
    'closed',
    'dismissed',
    'duplicate'
  ));

ALTER TABLE app.feedback_reports
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES app.feedback_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES app.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_text text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_by uuid REFERENCES app.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_reports_priority
  ON app.feedback_reports (priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_assigned
  ON app.feedback_reports (assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_duplicate
  ON app.feedback_reports (duplicate_of_id);

-- 2. Operator RLS policies on feedback_reports
DROP POLICY IF EXISTS p_feedback_reports_operator_select ON app.feedback_reports;
CREATE POLICY p_feedback_reports_operator_select ON app.feedback_reports
  FOR SELECT
  USING (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  );

DROP POLICY IF EXISTS p_feedback_reports_operator_update ON app.feedback_reports;
CREATE POLICY p_feedback_reports_operator_update ON app.feedback_reports
  FOR UPDATE
  USING (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  )
  WITH CHECK (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  );

-- 3. Internal notes table (strictly operator-only)
CREATE TABLE IF NOT EXISTS app.feedback_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES app.feedback_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_internal_notes_report
  ON app.feedback_internal_notes (report_id, created_at ASC);

ALTER TABLE app.feedback_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feedback_internal_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_feedback_internal_notes_operator ON app.feedback_internal_notes;
CREATE POLICY p_feedback_internal_notes_operator ON app.feedback_internal_notes
  FOR ALL
  USING (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  )
  WITH CHECK (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_internal_notes TO daynori_runtime;

-- 4. Triage audit table (strictly operator-only)
CREATE TABLE IF NOT EXISTS app.feedback_triage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES app.feedback_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_triage_audit_report
  ON app.feedback_triage_audit (report_id, created_at DESC);

ALTER TABLE app.feedback_triage_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feedback_triage_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_feedback_triage_audit_operator ON app.feedback_triage_audit;
CREATE POLICY p_feedback_triage_audit_operator ON app.feedback_triage_audit
  FOR ALL
  USING (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  )
  WITH CHECK (
    (nullif(current_setting('app.is_platform_operator', true), '')::boolean IS TRUE)
  );

GRANT SELECT, INSERT ON app.feedback_triage_audit TO daynori_runtime;

-- 5. Bounded retention purge procedure
CREATE OR REPLACE FUNCTION app.purge_expired_feedback_reports(retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_purged integer := 0;
  v_cutoff timestamptz;
BEGIN
  IF retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be at least 1';
  END IF;
  v_cutoff := now() - (retention_days || ' days')::interval;

  WITH deleted AS (
    DELETE FROM app.feedback_reports
    WHERE status IN ('resolved', 'closed', 'dismissed', 'duplicate')
      AND (
        (resolved_at IS NOT NULL AND resolved_at < v_cutoff)
        OR (resolved_at IS NULL AND updated_at < v_cutoff)
      )
    RETURNING id
  )
  SELECT count(*) INTO v_purged FROM deleted;

  RETURN v_purged;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.purge_expired_feedback_reports(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired_feedback_reports(integer) TO daynori_runtime;

-- 6. Grant daynori_worker access if role exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_internal_notes TO daynori_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_triage_audit TO daynori_worker;
    GRANT EXECUTE ON FUNCTION app.purge_expired_feedback_reports(integer) TO daynori_worker;

    DROP POLICY IF EXISTS p_feedback_internal_notes_worker ON app.feedback_internal_notes;
    CREATE POLICY p_feedback_internal_notes_worker ON app.feedback_internal_notes
      FOR ALL TO daynori_worker USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS p_feedback_triage_audit_worker ON app.feedback_triage_audit;
    CREATE POLICY p_feedback_triage_audit_worker ON app.feedback_triage_audit
      FOR ALL TO daynori_worker USING (true) WITH CHECK (true);
  END IF;
END $$;
