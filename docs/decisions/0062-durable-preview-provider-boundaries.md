# ADR-0062: Durable preview provider boundaries

- Status: accepted implementation; cloud operation remains unverified.
- Date: 2026-10-21.
- Related phase: [Phase 60](../roadmap/phases/60-public-android-and-web-release.md).
- Authorization: owner requested implementation of the remaining preview prerequisites.

## Context

The production API had no configured object provider or scanner; the worker's
storage factory returned undefined and its mobile push adapter was not wired.
Memory capabilities cannot survive replicas or restarts. Direct authenticated
Storage requests could bypass API reservation/quarantine checks. The worker
could mark files clean without a scanner and repeat quota release after the API
had already deleted metadata. The live-item cursor lacked a matching index.

## Decision

Keep Next.js, Fastify, PostgreSQL and the independent worker. Export server-only
Supabase object transport and ClamAV adapters from the API's explicit `providers`
package entry point; the worker consumes that backend boundary. Client packages
do not import these modules or server credentials.

Use private Supabase objects through supported authenticated HTTP operations.
Browser/mobile transfers use HMAC API capabilities bound to actor, path,
operation, expiry and byte limit. Every transfer rechecks current membership,
workspace state, deletion suppression, and reservation or verified-file state
under tenant RLS. A reservation row lock serializes upload writes with
cancellation and finalization. This deliberately holds one connection during a
bounded provider write (30 seconds, at most 50 MiB); it trades some throughput
for preventing a cancelled upload from recreating a purged object. Downloads
are not cached. Migration 00073 denies direct authenticated operations on
`private_assets`; privileged storage credentials stay server-only.

ClamAV uses its bounded INSTREAM protocol on a trusted private network. Unknown,
truncated, oversized, failed or missing scanner responses cannot verify a file.
The existing external HTTP scanner remains an alternative configured transport.
No external scanner is assumed to exist merely because the adapter compiles.

Configure native FCM HTTP v1 delivery with a short-lived signed OAuth assertion
and cached access token. Expo Push is explicit opt-in. Record provider acceptance
separately from device delivery. Expired device tokens are deactivated by the
existing durable delivery handler; provider errors never echo keys or payloads.

Migration 00074 creates a separate NOLOGIN `daynori_worker` application service
role. It has application DML and explicit RLS policies for trusted cross-tenant
jobs, with no database/role administration, schema creation, RLS bypass, or
migration-history writes. This is privileged application access: API credentials
cannot assume it. Operators activate it with a unique externally managed secret;
production worker startup requires those separate credentials. Future tables
need explicit worker grants/policies in their migrations.

The API transaction owns deletion metadata, quota changes and durable cleanup
intent. It never deletes provider bytes before commit; rollback preserves them.
Physical cleanup retries never subtract quota again. Missing storage keeps cleanup retryable.
Worker scan SQL targets the current schema and cannot revive cancelled uploads
or deleted file records. Migration 00072 indexes live items in cursor order;
performance budgets remain unchanged.

Package API/web/worker production runtimes separately from the Android/build
toolchain. An explicit manual GitHub workflow can produce a debug-signed internal
APK with an embedded bundle, HTTPS inputs, signature verification and checksum.
It neither submits to a store nor proves physical-device behavior.

## Verification and limits

The [phase report](../phase-reports/phase-60.md) records unit, socket-protocol,
database lifecycle/cancellation-race, worker-role, performance and full-suite
results. Supabase/Render browser sessions are signed in; a free test organization
and a prepared web-service form exist. Database project creation, credential
activation, provider network smoke, hosting cost selection, APK build and phone
installation remain external prerequisites. No live URLs are invented.

## References and revisit triggers

- [Supabase Storage API source](https://github.com/supabase/storage/tree/master/src/http/routes/object)
- [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [FCM HTTP v1 authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
- [Expo Push acceptance and receipts](https://docs.expo.dev/push-notifications/sending-notifications/)

Revisit after live latency/limits, scanner memory and signature-refresh behavior,
worker-role audit, or physical-device results reveal a different requirement.
No paid capacity is authorized by this ADR.
