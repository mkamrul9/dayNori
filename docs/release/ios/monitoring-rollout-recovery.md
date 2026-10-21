# Monitoring, rollout, and recovery (draft)

## Rollout

1. Internal TestFlight → external TestFlight (optional) → App Review → phased release if available.
2. First release is not a Play-style %-rollout metaphor; follow App Store Connect phased release controls when owner enables them.
3. Do not enable gated modules mid-rollout to “fix” listing gaps.

## Monitoring

- Crash reports via Xcode Organizer / App Store Connect (when builds exist).
- Server-side: existing API/worker health and sync error rates (owner-assigned ops — Phase 58 ownership still open).
- Support inbox: **OWNER_UNRESOLVED**.

## Recovery

- Forward-fix preferred: ship a patched build; avoid destructive data rollback.
- Disable optional flags server-side without deleting user content.
- Account export/deletion paths must remain usable during incidents.

No live monitoring stack is activated by this document.
