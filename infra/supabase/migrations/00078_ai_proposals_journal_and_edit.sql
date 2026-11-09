-- 00078_ai_proposals_journal_and_edit.sql
-- Phase 93: Reviewed note, task, and journal creation
-- Expands allowed operations on app.ai_proposals to include create_personal_journal_entry.
-- Adds updated_at column to support tracking proposal edits before confirmation.

ALTER TABLE app.ai_proposals
  DROP CONSTRAINT IF EXISTS ai_proposals_operation_check;

ALTER TABLE app.ai_proposals
  ADD CONSTRAINT ai_proposals_operation_check CHECK (operation IN (
    'create_personal_task',
    'update_personal_task',
    'create_personal_note',
    'create_personal_journal_entry'
  ));

ALTER TABLE app.ai_proposals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
