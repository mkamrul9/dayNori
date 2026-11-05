-- 00075_feedback_reports_and_durable_delivery.sql
-- Phase 82: Durable private bug, suggestion, and contact submissions with workspace scoping,
-- idempotent client identifiers, and durable background delivery jobs.

CREATE TABLE IF NOT EXISTS app.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_report_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('bug', 'suggestion', 'contact')),
  category text NOT NULL DEFAULT 'general',
  summary text NOT NULL,
  description text NOT NULL,
  steps_to_reproduce text,
  expected_behavior text,
  actual_behavior text,
  frequency text CHECK (frequency IS NULL OR frequency IN ('always', 'often', 'sometimes', 'once')),
  severity text CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical')),
  reply_email text,
  include_diagnostics boolean NOT NULL DEFAULT false,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'triaged', 'in_progress', 'resolved', 'closed', 'dismissed', 'duplicate')),
  delivery_status text NOT NULL DEFAULT 'unconfigured'
    CHECK (delivery_status IN ('unconfigured', 'queued', 'delivered', 'failed')),
  delivery_job_id uuid REFERENCES app.background_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_feedback_reports_reporter_client UNIQUE (reporter_id, client_report_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_reporter_created
  ON app.feedback_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_workspace_created
  ON app.feedback_reports (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status_created
  ON app.feedback_reports (status, created_at DESC);

ALTER TABLE app.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feedback_reports FORCE ROW LEVEL SECURITY;

-- Reporters may select their own submitted reports within the authorized workspace.
DROP POLICY IF EXISTS p_feedback_reports_select_own ON app.feedback_reports;
CREATE POLICY p_feedback_reports_select_own ON app.feedback_reports
  FOR SELECT
  USING (
    reporter_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  );

-- Reporters may insert reports scoped strictly to their own identity and active workspace.
DROP POLICY IF EXISTS p_feedback_reports_insert_own ON app.feedback_reports;
CREATE POLICY p_feedback_reports_insert_own ON app.feedback_reports
  FOR INSERT
  WITH CHECK (
    reporter_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  );

-- Allow updates strictly by the reporter on their own reports (e.g. status acknowledgment)
DROP POLICY IF EXISTS p_feedback_reports_update_own ON app.feedback_reports;
CREATE POLICY p_feedback_reports_update_own ON app.feedback_reports
  FOR UPDATE
  USING (
    reporter_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (
    reporter_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  );

GRANT SELECT, INSERT, UPDATE ON app.feedback_reports TO daynori_runtime;

-- Grant daynori_worker full access for cross-tenant background delivery processing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.feedback_reports TO daynori_worker;
    DROP POLICY IF EXISTS application_worker_service ON app.feedback_reports;
    CREATE POLICY application_worker_service ON app.feedback_reports
      FOR ALL TO daynori_worker USING (true) WITH CHECK (true);
  END IF;
END $$;
