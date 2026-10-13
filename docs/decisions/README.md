# Architecture decision records

Decisions below are accepted for planning on 2026-10-13. They do not imply a vendor account, dependency installation or implemented guarantee. A later phase verifies feasibility and may supersede a record with measured evidence.

- [ADR-0001: Platform-specific clients with shared TypeScript](0001-platform-clients-and-shared-domain.md)
- [ADR-0002: Modular monolith and managed core](0002-modular-monolith-and-managed-core.md)
- [ADR-0003: Typed domains and safe configurable sections](0003-typed-domains-and-configurable-sections.md)
- [ADR-0004: Offline commands and commit-ordered sync](0004-offline-command-sync.md)
- [ADR-0005: Separate client-encrypted vault](0005-client-encrypted-vault.md)
- [ADR-0006: Private binary storage and optional Drive](0006-private-storage-and-optional-drive.md)
- [ADR-0007: Durable jobs and best-effort reminders](0007-durable-jobs-and-reminders.md)
- [ADR-0008: Consent-bound AI and later rooms](0008-opt-in-ai-and-later-rooms.md)

New records use the next unused integer and include status, context, decision, alternatives, consequences, validation and revisit triggers. Keep old records when superseded, link both directions, and update the affected architecture/phase docs. A crypto library/key-envelope design, production provider/region/plan, broader Drive scopes, exact alarm mode and live collaborative editor require additional records before implementation approval for those capabilities.
