-- Account deletion runs as the least-privilege runtime role. The existing
-- p_ai_consents_own policy still limits DELETE to app.current_user_id().
-- Without this grant even accounts that never enabled AI cannot be erased.
GRANT DELETE ON app.ai_consents TO daynori_runtime;
