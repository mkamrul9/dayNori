-- 00079_ai_proposals_structured_organizer_tools.sql
-- Phase 94: Structured organizer tools and multi-action creation
-- Expands allowed operations on app.ai_proposals to include:
-- - create_personal_routine
-- - create_personal_calendar_event
-- - create_personal_folder
-- - create_personal_custom_section
-- - create_personal_expense
-- Adds plan_id, step_index, and depends_on columns to support multi-action review and safe partial execution.
-- Updates status check constraint to include 'skipped'.

ALTER TABLE app.ai_proposals
  DROP CONSTRAINT IF EXISTS ai_proposals_operation_check;

ALTER TABLE app.ai_proposals
  ADD CONSTRAINT ai_proposals_operation_check CHECK (operation IN (
    'create_personal_task',
    'update_personal_task',
    'create_personal_note',
    'create_personal_journal_entry',
    'create_personal_routine',
    'create_personal_calendar_event',
    'create_personal_folder',
    'create_personal_custom_section',
    'create_personal_expense'
  ));

ALTER TABLE app.ai_proposals
  DROP CONSTRAINT IF EXISTS ai_proposals_status_check;

ALTER TABLE app.ai_proposals
  ADD CONSTRAINT ai_proposals_status_check CHECK (status IN (
    'pending',
    'confirmed',
    'cancelled',
    'expired',
    'failed',
    'skipped'
  ));

ALTER TABLE app.ai_proposals
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS step_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depends_on jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_proposals_plan_id
  ON app.ai_proposals (user_id, plan_id, step_index)
  WHERE plan_id IS NOT NULL;
