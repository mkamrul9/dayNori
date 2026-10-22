# ADR-0061: Executable preview runtimes and account cleanup

- Status: accepted for local repairs; hosted provider selection remains provisional.
- Date: 2026-10-21.
- Owner/reviewer: owner requested a full project check and a test deployment.
- Related phase: [Phase 60](../roadmap/phases/60-public-android-and-web-release.md).

## Context

The API start script executed a library export without listening. Mobile sync used
a web localhost URL without a bearer token, provider URLs used environment access
that Expo cannot inline, and the mobile account and quick-create entry points
were still demonstration wiring. The existing debug APK contains no embedded
application bundle. A full audit also reproduced account-deletion failure:
the runtime role could not delete its own AI consent record, including when the
optional AI module was disabled.

## Decision

Preserve the existing Next.js BFF, Fastify API and worker boundaries. Add a distinct
API process entry point and use public, build-time Expo configuration for mobile
service origins. Resolve mobile credentials from the secure adapter for each API
request. Use the real provider adapter for mobile sign-in and the existing local
sync transaction for quick capture. Clear a capture draft only after that
transaction succeeds; retain failures and communicate them explicitly.

Migration `00070` grants DELETE on `app.ai_consents` to `daynori_runtime` while
retaining the existing forced RLS policy bound to `app.current_user_id()`. It does
not grant administrator access or enable AI. Verify both successful own-account
cleanup and denied cross-account deletion.

Migration `00071` adds restrictive SELECT policies for runtime reads of items and
workspaces. An uncorrelated identity check is evaluated once per statement and
rejects missing-identity reads before expensive per-row membership checks. All
existing membership policies remain required. Local EXPLAIN initially showed
307,250 rejected item rows and 5,828 ms spent returning zero records. This follows
the [documented init-plan pattern](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
The simulated restore test now sanitizes only its fixture snapshot and ledger,
preserving unrelated synthetic accounts. Existing five-second timeouts remain.

Provide container build targets and an internal, non-development-client Expo APK
profile. A Node host such as Render plus Supabase fits the current architecture
without migrating the BFF to a Worker. This is a proposed test environment, not
an approved paid plan, live infrastructure or evidence of full functionality.

## Alternatives

A static upload omits the application's session/API behavior. A Cloudflare
adapter migration is a separate compatibility exercise. Distributing the current
debug APK would require Metro and would not satisfy independent phone testing.
Disabling terms checks or replacing real auth with synthetic sign-in would hide
failures and is excluded.

## Consequences and verification

The existing release gates remain blocked. Production uploads still require a
live storage adapter and scanner; push requires configured providers and a
durable worker. Docker images cannot be verified on this host until its Linux
daemon is available. Hosting and identity accounts must be connected before
provisioning a disposable remote environment.

The [phase report](../phase-reports/phase-60.md) records exact audit commands,
regression results, dependency advisories and limits. The
[deployment handoff](../../infra/deployment/README.md) records configuration and
the standalone Android build contract. Revisit after connected-service smoke,
physical-device testing, an actual artifact hash and hosted URLs exist.
