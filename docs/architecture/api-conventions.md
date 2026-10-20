# API and contract conventions

Status: planned contract rules. Each feature phase publishes concrete validated schemas and OpenAPI documentation before its client integration is complete.

## Transport and identity

Use HTTPS JSON at `/v1`, UTF-8, camelCase DTO fields and UUID resource IDs. The web client calls its same-origin session/API layer using an HttpOnly session cookie; that layer forwards a verified user access token to Fastify. Mobile calls Fastify with a bearer access token. Both use the same domain contracts. Browser write requests require CSRF/origin checks; mobile bearer requests do not become authenticated through browser cookies.

Authentication identifies the actor; authorization determines access to a workspace/resource and command. Derive actor from the token, check active account/device, and read current membership. Never accept a body field that changes actor, ownership or privilege. Return `404` for resources outside the caller's scope where revealing existence would leak information. `403` may describe an action the user knows exists but lacks permission to perform.

No direct client writes to domain tables. The API owns business transactions, receipts and changes. Client access to Auth and limited binary capabilities is deliberate. Administrative Supabase secret/service credentials remain server-only in isolated adapters; they are not ordinary user API authentication.

## Contract ownership

Public DTOs and schemas live in `packages/contracts`, separate from ORM/database models. Domain commands are explicit (`completeTodo`, `recordRoutineOccurrence`, `moveFolder`, `trashItem`) rather than unrestricted database row patches. Validate bodies, path/query parameters and returned projections. Bound string, array, nesting, enum and integer sizes on both clients and server. Unknown fields fail for mutation contracts; clients tolerate documented additive response fields.

Each mutation carries `operationId`, `deviceId`, `schemaVersion`, and a base revision when changing existing state. Use the same canonical command envelope for online and queued offline writes. An `Idempotency-Key` header, if used, maps to that operation ID; it is not a second unrelated idempotency system. Payload hashes include workspace, command, entity, base revision and version. Read the [sync protocol](sync-and-offline.md) before implementing mutation routes.

## Responses and errors

Successful responses carry `data` and `meta` (request ID, server time, protocol version, optional cursor). A mutation returns the accepted entity revision and operation ID. Empty deletions still return an operation receipt rather than imply unversioned removal.

Errors carry `error.code`, a short safe message, optional validated field errors/retry time, and request ID. They must not expose SQL, tokens, object capabilities, file contents or a different user's state. Initial codes include `UNAUTHENTICATED`, `ACCESS_REVOKED`, `VALIDATION_FAILED`, `REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `DEPENDENCY_PENDING`, `QUOTA_EXCEEDED`, `UPLOAD_NOT_READY`, `SYNC_RESET_REQUIRED`, `OPERATION_TOO_OLD`, `RATE_LIMITED`, `PROVIDER_RECONNECT_REQUIRED` and `TEMPORARILY_UNAVAILABLE`.

Use `400` for malformed/invalid requests, `401` for absent/invalid sessions, `403`/`404` according to scoped access, `409` for revision/idempotency/dependency conflicts, `413` for body limits, `429` with `Retry-After` for throttling, and `5xx` for retryable infrastructure failure. A sync batch returns one status per operation; a successful HTTP response does not mean every command was accepted.

## Read pagination, ordering and dates

Use opaque keyset cursors bound to workspace, filters and stable sort (`sortValue,id`). Default list page size 50, maximum 100; sync maximum 500 changes per pull. Avoid offset pagination for mutable datasets. Queries have allowlisted filters/sorts; never interpolate client fields into SQL.

Serialize instants as RFC 3339 UTC strings, local dates as `YYYY-MM-DD`, and zones as IANA IDs. Date-only deadlines stay date-only. Serialize large monetary minor-unit integers as decimal strings with explicit currency. Locale formatting belongs in clients; transport values remain unambiguous.

## Initial resource families

- Identity/workspace: `/me`, `/workspaces`, `/devices`, preferences and capability status.
- Organization/content: sections, folders, typed item reads, tags, links and explicit move/archive/trash commands.
- Planning: todos, routines, occurrence commands, calendar projections and reminder rules.
- Files/audio: upload reservations, finalize, ingest status, authorized downloads, cancellation and immutable versions.
- Finance/custom sections: expense commands/reports and versioned custom schema/record commands.
- Sync: bootstrap, push, pull, device checkpoint and conflict resolution.
- Recovery/privacy: exports, account deletion requests, job status and consent/revocation.
- Rooms (provisional local): `/v1/rooms`, invitations, accept/preview, members, leave, transfer, explicit personal→room copy — gated by local enablement (`DAYNORI_ROOMS_LOCAL_ENABLED` / test-dev); not public release (ADR 0048).
- Deferred: broader Drive folder mirroring, room chat/messages, AI sessions/proposals and entitlements. Provider Drive selected-file connector remains separately gated.

Keep endpoint naming consistent when concrete schemas are introduced. Do not publish fake handlers or production SDK methods in Phase 00.

## Binary workflow and limits

1. Reserve an upload with filename, declared type/bytes and destination scope. Authorize the tenant/folder, enforce quota and choose an unpredictable immutable key.
2. Return reservation ID, upload method, exact provider expiry and required headers; never return storage administrative credentials. Keep upsert disabled.
3. Transfer binary directly. Retry/resume only according to the provider's validated semantics; a JSON API route is not a streaming proxy by default.
4. Finalize with the reservation/operation ID. Verify object identity, actual size/type/checksum, scan status and lifecycle. Repeated finalize returns the same result. A canceled/expired reservation cannot become a ready file.
5. Download requires new permission evaluation. Issue a read URL valid for at most five minutes or use authenticated delivery. Cache private bytes only under the documented device policy.

Supabase's signed upload method is documented with a two-hour validity period; it is not the five-minute read URL contract. Treat that capability as still usable until provider expiry, reconcile orphan uploads afterward, and validate immutability/replay and byte/MIME restrictions in the upload phase. [Signed upload reference](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl). Reviewed 2026-10-13.

Initial proposed limits for validation: 1 MiB JSON request, 250 KiB individual text document, 50 sync commands, 40 custom fields, five folder levels, 25 MiB per general file and 50 MiB per audio file. These are cost/performance guardrails to test, not provider maximums or final subscription promises. Server authoritative limits are returned from `/me/capabilities`; clients explain them before recording/uploading. Resumable transfer and larger plans require a measured gate.

## Rate limits and compatibility

Apply independent IP/login, user mutation, upload reservation, search, export, room and AI budgets; key them from verified actor when available. Start with conservative per-instance limits plus durable database-backed quota/reservation counters. Do not claim a process-local limiter enforces an exact global limit across horizontally scaled servers. Reassess the shared rate-limit mechanism before multiple public API replicas serve abusive traffic.

Publish protocol/client support versions and a minimum supported version. Additive contract changes can remain in v1; changes that remove/reinterpret fields need a new contract version and migration window. An old offline client must receive a clear upgrade/rebase response, not silently lose its queue. Generate typed clients/OpenAPI from the same validated schemas and test contract drift in CI.
