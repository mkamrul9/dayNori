# Enabled store scope (iOS)

Only claim features that are **enabled** for the proposed personal-organizer release and listed as such in the provisional Android/web manifest (`docs/release/manifest-0.1.0-provisional.json`). iOS must not advertise a broader surface.

## Allowed marketing / review claims (when native evidence exists)

- Personal notes, tasks, routines, journal, local files, calendar/agenda views
- Search, sync, workspace export/import, account deletion flows
- Best-effort local reminders (permission optional)
- Accessibility intent (VoiceOver / Dynamic Type) — only after physical evidence

## Must remain excluded from store claims

| Module | Status |
|---|---|
| Vault | Disabled by release gate |
| Rooms / chat | Disabled by release gate |
| Live AI / assistant | Disabled by release gate |
| Google Drive | Disabled / Phase 50 deferred |
| Production billing / StoreKit IAPs | Disabled by release gate — **do not** create IAP products for this RC |
| Expenses | Not part of enabled iOS release claim |

See [ios-support-matrix.md](../../engineering/ios-support-matrix.md).
