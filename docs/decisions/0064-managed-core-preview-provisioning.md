# ADR-0064: Managed core preview provisioning

- Status: accepted for the owner's $0 testing preview.
- Date: 2026-10-22.
- Phase: [60](../roadmap/phases/60-public-android-and-web-release.md).
- Refines [ADR 0063](0063-free-core-testing-preview.md).

## Context and decision

The owner authorized a 24-hour Database/Auth Config read-write token limited to
the existing daynori-preview project. It replaces the need to recover or reset
the administrator password. The token stays in ignored local files; only a
separately generated restricted runtime credential goes to the API host.

Use the project-pinned Management API runner. Each migration and its receipt
execute in one transaction, serialized by an advisory transaction lock. Disable
runtime/billing/worker logins before historical fixture-password DDL can commit.
Activate only runtime using a bound password and a temporary invoker-security
function, revoke execution from public/application roles, then remove it.
Verify the actual session-pooler login and privilege flags over TLS.

Supabase owns its Storage schema and denies CREATE there. In this core-only
profile, verify existing Storage tables, enabled RLS and zero buckets/objects;
omit migration 00007's local Storage scaffolding, bucket DML and redundant RLS
ALTER. Still apply its identity helpers, grants and tenant policies, plus 00073's
direct-authenticated-access restriction. No bucket or object is created.
For 00069, replace local billing fixture-login activation with NOLOGIN and
PASSWORD NULL. No managed ownership or network/auth protection is changed.

Keep immutable source checksums and separately record executed SQL checksums and
the managed-core-no-storage profile in app.preview_migration_adaptations, in the
same transaction as the receipt. Verify both histories on retry. The normal
migrator refuses this history; promotion requires a reviewed plan that provisions
Storage through its supported API and resolves the adaptations.

The project dashboard provides the public database CA certificate. Commit that
public trust certificate and keep certificate/hostname verification enabled.
Render must load it using NODE_EXTRA_CA_CERTS before Node starts, alongside
PGSSLMODE=verify-full.

## Alternatives and consequences

Resetting the administrator password is unnecessary. Taking managed-table
ownership, disabling TLS validation or deploying fixture passwords is rejected.
This managed profile cannot enable uploads or billing without promotion work.

## Validation and revisit

The actual project has 74 receipts, two explicit adaptations, and a verified
restricted TLS runtime login. Local rollback, disabled-login, source integrity,
Storage-policy preservation and diagnostic-redaction checks accompany the runner.
Hosted API/web/APK and physical-device checks remain separate acceptance gates.

- [Management SQL](https://supabase.com/docs/reference/api/v1-run-a-query)
- [Managed schema ownership](https://supabase.com/docs/guides/platform/permissions)
- [Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design)
