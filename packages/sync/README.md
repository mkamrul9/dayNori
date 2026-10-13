# @daynori/sync

Offline synchronization protocol engine, mutation queues, change feeds, and storage/transport ports.

## Status

Established in Phase 01. Defines:
- `ClientMutation`: Local mutation envelope with idempotency ID and base revision
- `MutationReceipt`: Server response acknowledging applied revision or conflict
- `SyncStoragePort`: Port interface for SQLite (mobile) and IndexedDB (web) adapters
- `SyncTransportPort`: Port interface for batch mutation pushing and cursor polling

See [synchronization and offline architecture](../../docs/architecture/sync-and-offline.md).
