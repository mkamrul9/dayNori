# ADR-0006: Private binary storage and optional Drive

Date: 2026-10-13. Status: accepted for planning; broad folder mirroring remains deferred.

## Context

Users need in-app uploads and organized PDFs/images/docs/audio. Optional Drive storage can reduce app-managed bytes, but app authorization and external OAuth/file permissions differ.

## Decision

Use private object storage for app uploads, with API-authorized immutable upload reservations, direct binary transfer, verified finalization, ordinary-file quarantine/scan and independent binary backups. Use an adapter boundary; select Supabase Storage first pending its feasibility checks. Offer optional narrow Drive per-file/app-created-file access first. Do not promise automatic visibility of arbitrary externally added folder children until broader scopes/verification are explicitly assessed and approved.

## Alternatives

Storing binary content in PostgreSQL increases database/backup cost. Public URLs fail the private-document model. Requiring Drive for every user complicates onboarding and availability. Requesting full Drive permissions at signup exceeds the needed private-core scope.

## Consequences and validation

Signed capabilities have provider-defined expiration/revocation behavior, so clients cannot assume logout recalls issued URLs. Linked references and imported copies have different ownership/deletion semantics. Validate direct storage ACLs, size/type limits, immutable-key retry, orphan cleanup, backups and Drive permission behavior. Revisit provider/flow only when measured limits or stricter capability controls require it.

See [API binary workflow](../architecture/api-conventions.md) and [Drive design](../architecture/integrations-and-reminders.md).
