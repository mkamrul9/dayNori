-- Migration: 00011_repair_receipt_rls
-- Description: Repair receipt RLS policy so revoked users cannot read workspace receipts
-- Search Path: app, pg_temp

DROP POLICY IF EXISTS p_mutation_receipts_select ON app.mutation_receipts;
CREATE POLICY p_mutation_receipts_select ON app.mutation_receipts
    FOR SELECT TO daynori_runtime
    USING (app.user_has_workspace_role(workspace_id, 'viewer') AND (actor_user_id = app.current_user_id() OR app.user_has_workspace_role(workspace_id, 'owner')));
