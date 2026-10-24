-- 00057: grants required for ON CONFLICT DO UPDATE paths on terms/blocks.
GRANT SELECT, INSERT, UPDATE ON app.ugc_terms_acceptances TO daynori_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_blocks TO daynori_runtime;
GRANT SELECT, INSERT ON app.ugc_reports TO daynori_runtime;
GRANT INSERT ON app.moderation_audit TO daynori_runtime;
