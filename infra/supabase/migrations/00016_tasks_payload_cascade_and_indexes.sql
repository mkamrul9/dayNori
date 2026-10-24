-- 00016_tasks_payload_cascade_and_indexes.sql
-- Cascade item envelopes when task payload is hard-deleted and add indexes

CREATE OR REPLACE FUNCTION app.cascade_delete_task_item()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM app.items
    WHERE workspace_id = OLD.workspace_id AND id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_delete_task_item ON app.tasks;
CREATE TRIGGER trg_cascade_delete_task_item
AFTER DELETE ON app.tasks
FOR EACH ROW
EXECUTE FUNCTION app.cascade_delete_task_item();
