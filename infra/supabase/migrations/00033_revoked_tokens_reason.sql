-- Migration: 00033_revoked_tokens_reason
-- Description: Add revocation_reason column to app.revoked_tokens for audit trails

ALTER TABLE app.revoked_tokens ADD COLUMN IF NOT EXISTS revocation_reason text;
