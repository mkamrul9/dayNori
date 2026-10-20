# Moderation and reporting workflow (local preparation)

**Status:** Local workflow preparation only. **No staffed moderation owner is claimed.** External review and named operational coverage are release blockers.

## Intake

1. User submits in-app report (`POST /v1/safety/reports`) with category and optional explanation.
2. System stores receipt (`received`) and frozen evidence snapshot.
3. Rate limits apply; duplicate `clientReportId` returns the same receipt.

## Triage (intended)

1. Platform moderator (allow-listed via `DAYNORI_PLATFORM_MODERATOR_IDS`) lists reports.
2. Status transitions: `received` → `triaged` → `actioned` | `dismissed` | `duplicate`.
3. Each status change writes `app.moderation_audit` (actor, scope, action, reason, target, time). Sensitive evidence stays out of general application logs.

## Action and escalation

| Finding | Possible action (local capability) |
|---|---|
| Violating message | Room-owner or author soft-delete; platform marks report `actioned` |
| Abusive invitations | Block + invite rate limits; revoke pending invites |
| Repeated abuse | Documented for future account restriction (not automated ban in this phase) |
| Illegal content involving minors | Escalate to human owner process outside this repo (blocker until staffed) |

## User-facing outcomes

- Reporter receives a receipt id/status; detailed investigation notes are not returned.
- Reported users are not notified of reporter identity.
- Block/unblock and leave remain available to users.

## Appeal handling

Appeal process requires a human owner decision. **Unresolved:** named reviewer, SLA, and appeal channel. Recorded as a release blocker — do not invent staffing.

## Evidence, retention, and deletion

- Report evidence snapshots are retained for moderation while the report row exists.
- Message soft-delete clears live body for members but does not erase report snapshots.
- Account deletion / export reconciliation with moderation evidence retention is incomplete relative to a full lifecycle policy; the chat retention constant alone is not an enforced purge job. Track as operational gap before public rooms release.
- Backups may retain deleted data until backup expiry (see release-gates deletion guidance).

## Notification and invitation abuse

- Per-actor invitation create rate limit; pending-per-room cap; TTL/expiry/revoke.
- Blocks prevent invitation accept between blocked pairs.
- No outbound email/SMS invitation sending in this provisional phase.

## Target audience

Initial product: invite-only adult personal/household collaboration. Child-safety / age rating decisions for any broader social feature remain unresolved and block public social release.
