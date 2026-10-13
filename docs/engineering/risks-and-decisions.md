# Risks and decisions to close

This register records uncertainties that Phase 00 cannot resolve by writing documents. It complements the [ADRs](../decisions/README.md), [architecture](../architecture/system-overview.md), [roadmap](../roadmap/README.md), and [release gates](release-gates.md). Phase reports close items only with evidence; a chosen default is not a completed spike.

## Product and delivery

- **Scope and navigation:** A personal-life organizer can become a crowded menu. Mitigation: personal core first; Home/Today, Library and search remain clear; optional modules activate progressively. Measure first-use task completion before adding prominent navigation.
- **Name:** Daynori is provisional. Pronunciation, linguistic meaning, trademark, domain and app-store availability are unverified. Complete [naming clearance](../product/naming.md) before a public identity, purchases or store listing; absence from a search does not establish ownership.
- **Solo delivery and maintenance:** Sixty-four bounded phases are a work sequence, not a calendar commitment. Dependencies, proof-of-concept results and available reviewers may change the later plan. Completed IDs/history remain stable; document plan amendments rather than pretending every phase was predictable.
- **Commercial model and audience:** Free/premium boundary, subscription versus paid download, initial countries, legal entity, age range, data residency and support staffing remain undecided. Owner decisions are needed before commercial or social release; personal implementation can progress without guessing them.
- **Platform scope:** Android plus responsive web are initial. iOS has a later gate. Native platform APIs may require development builds/custom adapters and may not be supported by Expo Go.

## Technical risks

- **Offline convergence:** Deletion races, stale memberships, partial uploads and double replay can lose or leak data. Persist mutation receipts/revisions and expose explicit conflict recovery; validate multi-device adversarial scenarios before personal beta.
- **Encrypted vault:** Short PINs, browser runtime compromise, unsupported crypto libraries, recovery flows and device key loss make this the highest-risk feature. Conduct a crypto/library spike and independent review. Disable the vault if the gate fails; a PIN-protected screen must never be marketed as encrypted storage.
- **Reminders:** Operating-system permissions, battery restrictions, force-stop and network latency limit delivery. Separate best-effort reminders from any later exact-alarm mode. Exact-alarm Play eligibility remains uncertain; do not make guaranteed wakeup claims. See [release gates](release-gates.md).
- **Drive folder access:** Narrow `drive.file` access is per file, so automatic discovery of arbitrary new files uploaded outside Daynori is an unresolved feasibility requirement. Prototype the required folder workflow before promising it. Broad scopes can add verification/assessment cost and should require an ADR. [Official scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- **File safety and expense:** Large files, recording growth, preview conversion and egress can dominate cost. Use quotas, resumable uploads, scanning, pagination, safe preview adapters and explicit ownership. A failed scan cannot silently make a file downloadable.
- **Authorization at scale:** Jobs, search indexes, export workers and realtime subscriptions must enforce current membership, not a historical UI selection. Service-role access bypassing RLS requires explicit workspace predicates, audit and negative tests.
- **Backups:** Managed database backup is insufficient for document recovery; storage objects require separate backup and restoration. Reconcile deleted-user tombstones during restores. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).
- **Schema ownership:** Drizzle schema generation and Supabase SQL migrations must not become separate competing histories. Select one migration authority and validate drift in the database setup phase.
- **Shared-code overreach:** Sharing domain/contracts helps consistency; sharing every screen can harm web keyboard and mobile touch quality. Keep platform adapters/UI packages separate and test behavior parity.
- **AI privacy and spend:** Provider retention, hallucinations, malicious documents, unauthorized retrieval and token growth require explicit opt-in, scoped retrieval, narrow tools, confirmation and cost ceilings. Keep AI separate from the initial personal workspace and excluded from vault content.

External references in this register were checked 2026-10-13; [sources](../research/sources.md) defines when to recheck them.

## Operational and policy risks

Shared rooms add ongoing moderation/support work and child-safety/audience decisions. Billing adds receipts, renewals, refunds, consumer disclosures and regional eligibility. Every analytics/crash SDK adds potential collection that must be inventoried and reflected in privacy/store disclosures. The [release gate](release-gates.md) requires evidence for these obligations before the corresponding feature is public.

No price is promised in Phase 00. Before provisioning, record current provider quotes/plan limits and the owner's approval. Estimate at least these separate cost buckets:

- Database compute, connection pooling, indexes, backups and point-in-time recovery.
- Object storage, duplicate backups, file downloads/egress, scanning and preview conversion.
- API and worker compute, durable jobs, push/provider calls, email/auth delivery and monitoring.
- Android builds/signing/store account, web hosting/domain, later iOS build/release requirements.
- AI inference/embedding/retrieval, token ceilings and integration/OAuth verification where applicable.
- Human security review, moderation, support, accessibility/usability testing and legal/policy work.

Use synthetic usage scenarios rather than provider free tiers as a business plan: active users, retained data per user, daily writes/jobs, download frequency, recording minutes and optional AI requests. Publish limits before enabling paid tiers and preserve export access when a user exceeds quota or downgrades.

## Decision record requirements

For each material open decision, record owner, options, constraints, measured experiment, chosen outcome, rejected options, consequences and revisit trigger. Accepted ADRs do not erase unresolved limitations. Typical revisit triggers are failed spike, unsupported framework upgrade, new policy, operational evidence, higher measured load or changed product scope. An unmeasured claim that a technology is scalable is not a valid experiment.
