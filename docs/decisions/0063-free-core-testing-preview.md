# ADR-0063: Free core testing preview

- Status: accepted for preview preparation; deployment unverified.
- Date: 2026-10-21.
- Related phase: [Phase 60](../roadmap/phases/60-public-android-and-web-release.md).

## Context and decision

The owner selected a $0 budget for a browser and Android testing preview.
Render has no payment method in the selected workspace and has free quota
available. Supabase's new Singapore `daynori-preview` project is provisioned.
The existing application needs Node server processes, so use separate free
Render web services for Next.js and Fastify, plus Supabase PostgreSQL/Auth.
Keep the worker, scanner, paid plans and optional modules inactive. Cloudflare
would require an additional verified adapter; changing hosts does not remove
the worker/scanner requirements.

`DAYNORI_CORE_PREVIEW=true` rejects binary transfer, upload/attachment mutations,
reminder mutations and push registration. Read/delete operations remain scoped
by the existing authentication and RLS rules. Web/mobile build flags display
limitations and disable upload/audio controls. Client request deadlines allow
75 seconds for free-service wake-up without retrying mutations automatically.
Core notes, tasks, routines, journals, folders, search and synchronization retain
their existing contracts. Background physical erasure is not verified without
the worker; this environment is for sample content, with no backup/SLA promise.

The preview migration command is pinned to the new project and reads its
administrator password only from an ignored local file. Historical migrations
retain their checksums. A transactional hook replaces fixture runtime
credentials before every migration commit and disables unused billing/worker
logins. TLS certificate verification stays enabled. Only the separate runtime
credential is written to the ignored Render configuration; the administrator
password is never copied to Render or Git.

Configure the API's public Supabase Auth origin/key as well as JWKS, and generate
a separate reauthentication-signing secret. The free API skips storage provider
initialization even with the Auth origin set. Missing privileged Auth cleanup
credentials keep deletion in `processing`; web and mobile must display pending
cleanup rather than announce complete erasure. The free disclosure explains
the operator step and does not promise a verified backup expiry.

## Alternatives and consequences

Paid scanner/worker capacity would support a broader scope, but conflicts with
the selected budget. Keeping upload controls active without scanning or queue
processing would accept work that cannot finish. The free profile therefore
excludes that work and explains the limit in both interfaces.

Free services can sleep or suspend at quota limits. This is not public-release
approval, dependable reminder delivery, physical-device verification, or a
completed Phase 60. GitHub source authentication, schema application, hosted
smoke checks and a standalone APK remain separate evidence requirements.

## Validation and revisit triggers

See the [phase report](../phase-reports/phase-60.md) for actual commands and
results. Safeguard failure rolls back both schema changes and migration receipts;
API tests reject direct requests for excluded work. Revisit after the first
hosted smoke, free-quota measurements, hardware testing, or a budget change.

- [Render free services](https://render.com/docs/free)
- [Supabase session connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
