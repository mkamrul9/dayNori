# ADR-0009: Offline storage and session persistence strategy

Date: 2026-10-13. Status: accepted.

## Context

Daynori requires a local-first offline architecture supporting responsive note editing, routines, tasks, and journal entry capture without an active internet connection. The storage engine must run reliably on Android and modern desktop/mobile web browsers, support atomic transactions, handle schema migrations, and persist authentication sessions securely.

## Decision

1. **Mobile Storage**: Use `expo-sqlite` on Android and iOS. SQLite provides ACID-compliant transactions, relational indexing, FTS5 full-text search, and unbounded local file growth up to available disk storage.
2. **Web Storage**: Use browser IndexedDB wrapped in an application-owned key-value and object store adapter. Enforce explicit quota checks and handle storage pressure eviction risks.
3. **Session Persistence**: Keep short-lived JWT access tokens in client memory. Store long-lived refresh tokens in device-backed hardware keystore/keychain via `expo-secure-store` on mobile and secure, SameSite HTTP-only cookies on web. Never store authentication tokens or unencrypted vault keys in browser `localStorage`.

## Alternatives

- **WatermelonDB / Realm**: Powerful reactive abstractions, but introduce complex native C++ dependencies and proprietary synchronization models that diverge from our planned application-owned Supabase/PostgreSQL sync protocol.
- **LocalStorage on Web**: Synchronous, size-limited (5MB), and vulnerable to cross-site script exfiltration; rejected for primary entity data and session credentials.

## Consequences and validation

- Shared domain repositories must interact through clean storage port interfaces (`StorageAdapter`) rather than binding directly to SQLite or IndexedDB APIs.
- Validated via synthetic contract model `tests/spikes/storage-model.synthetic.test.ts` and real browser execution in `tests/spikes/browser/indexeddb-real.html` (verified rollback, schema upgrade v1->v2, and persistence across reload in Microsoft Edge).
- See [system overview](../architecture/system-overview.md) and [offline sync ADR-0004](0004-offline-command-sync.md).
