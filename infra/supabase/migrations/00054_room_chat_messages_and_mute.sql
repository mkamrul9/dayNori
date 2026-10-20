-- 00054_room_chat_messages_and_mute.sql
-- Phase 53: durable room chat, read state, mute preferences, ordered delivery events.
-- Realtime is a notification path; room_messages is the source of truth.

-- Sequential ordering allocator per room (commit-order safe with workspace lock).
CREATE TABLE IF NOT EXISTS app.room_chat_state (
    workspace_id uuid PRIMARY KEY REFERENCES app.workspaces(id) ON DELETE CASCADE,
    next_server_order bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.room_chat_state (workspace_id, next_server_order)
SELECT id, 1 FROM app.workspaces WHERE kind = 'room'
ON CONFLICT (workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.init_room_chat_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'room' THEN
    INSERT INTO app.room_chat_state (workspace_id, next_server_order)
    VALUES (NEW.id, 1)
    ON CONFLICT (workspace_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_room_chat_state ON app.workspaces;
CREATE TRIGGER trg_init_room_chat_state
  AFTER INSERT ON app.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION app.init_room_chat_state();

CREATE TABLE IF NOT EXISTS app.room_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE RESTRICT,
    client_message_id uuid NOT NULL,
    body text NOT NULL,
    body_revision integer NOT NULL DEFAULT 1,
    attachment_file_id uuid NULL REFERENCES app.items(id) ON DELETE SET NULL,
    server_order bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz NULL,
    CONSTRAINT uq_room_messages_sender_client UNIQUE (workspace_id, sender_id, client_message_id),
    CONSTRAINT uq_room_messages_workspace_order UNIQUE (workspace_id, server_order),
    CONSTRAINT chk_room_messages_body_len CHECK (char_length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_room_messages_history
  ON app.room_messages (workspace_id, server_order DESC);

CREATE INDEX IF NOT EXISTS idx_room_messages_created
  ON app.room_messages (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.room_message_read_state (
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    last_read_server_order bigint NOT NULL DEFAULT 0,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS app.room_mutes (
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.profiles(id) ON DELETE CASCADE,
    muted boolean NOT NULL DEFAULT true,
    muted_until timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Durable publication events (commit-to-publication). Worker/local bus drains these.
CREATE TABLE IF NOT EXISTS app.room_chat_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
    server_order bigint NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
      'room_message.created',
      'room_message.edited',
      'room_message.deleted'
    )),
    message_id uuid NOT NULL REFERENCES app.room_messages(id) ON DELETE CASCADE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_room_chat_events_workspace_order UNIQUE (workspace_id, server_order)
);

CREATE INDEX IF NOT EXISTS idx_room_chat_events_unpublished
  ON app.room_chat_events (workspace_id, server_order ASC)
  WHERE published_at IS NULL;

ALTER TABLE app.room_chat_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_message_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_chat_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_chat_state TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_messages TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_message_read_state TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_mutes TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_chat_events TO daynori_runtime;

DROP POLICY IF EXISTS p_room_messages_member ON app.room_messages;
CREATE POLICY p_room_messages_member ON app.room_messages
  FOR ALL
  USING (app.user_has_workspace_role(workspace_id, 'viewer'))
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_read_state_self ON app.room_message_read_state;
CREATE POLICY p_room_read_state_self ON app.room_message_read_state
  FOR ALL
  USING (user_id = app.current_user_id() AND app.user_has_workspace_role(workspace_id, 'viewer'))
  WITH CHECK (user_id = app.current_user_id() AND app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_mutes_self ON app.room_mutes;
CREATE POLICY p_room_mutes_self ON app.room_mutes
  FOR ALL
  USING (user_id = app.current_user_id() AND app.user_has_workspace_role(workspace_id, 'viewer'))
  WITH CHECK (user_id = app.current_user_id() AND app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_chat_events_select ON app.room_chat_events;
CREATE POLICY p_room_chat_events_select ON app.room_chat_events
  FOR SELECT
  USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_chat_events_insert ON app.room_chat_events;
CREATE POLICY p_room_chat_events_insert ON app.room_chat_events
  FOR INSERT
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_chat_events_update ON app.room_chat_events;
CREATE POLICY p_room_chat_events_update ON app.room_chat_events
  FOR UPDATE
  USING (app.user_has_workspace_role(workspace_id, 'viewer'));

DROP POLICY IF EXISTS p_room_chat_state_write ON app.room_chat_state;
CREATE POLICY p_room_chat_state_write ON app.room_chat_state
  FOR ALL
  USING (app.user_has_workspace_role(workspace_id, 'viewer'))
  WITH CHECK (app.user_has_workspace_role(workspace_id, 'viewer'));
