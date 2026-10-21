# Release gates

The roadmap ships a focused personal workspace before exposing higher-risk modules. A passed phase delivers its own scope; it does not automatically authorize public release. Each release records its version, enabled features, evidence, unresolved limits, reviewer and decision. No environment, paid account, store upload or deployment exists in Phase 00.

## Gate A: local foundation

- Strict toolchain, reproducible installs, package boundaries and local setup work from a fresh checkout.
- A web build and Android development build pass their relevant checks; unsupported platform behavior is documented.
- Synthetic database/auth/storage fixtures and migration verification exist.
- Feature flags default unfinished vault, rooms, Drive, billing and AI to inaccessible.
- The contributor can find requirements, tests, decisions and the next phase without chat history.

## Gate B: private personal beta

Only the enabled personal modules enter this beta. Required evidence includes workspace isolation across API/storage/search/sync/jobs, recovered offline drafts, explicit conflicts, usable folders, date/time semantics, and denied-permission recovery. Notes/tasks/routines/journals/files must meet their scoped product criteria before being enabled.

Users can export enabled data in documented portable formats and request deletion. Export has a manifest, schemas, timestamps/time zones, file relationship metadata and failure reporting; a representative export can be read outside the app. Deletion revokes sessions/provider tokens, stops jobs, removes live content and explains any retained billing/security records and backup expiry. Do not label a soft-deleted account fully erased.

Staging operates with private buckets, minimal privileged credentials, content-redacted telemetry, quotas, file validation/scanning, ownership checks and operational alerts. A restoration drill recovers metadata **and object files** into an isolated environment and verifies relationships. Supabase database backups exclude Storage API objects, so separate blob backup/restore evidence is required. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) (checked 2026-10-13).

Name an initial measured recovery-point and recovery-time objective, backup retention/expiry, incident contact and rollback/forward-fix procedure. Restore tests must honor deletion tombstones so deleted accounts are not unintentionally reactivated. Confirm an accessible first-use journey and the performance profile from [quality](quality.md). Beta testers receive an accurate description of delivered protection and limitations.

## Gate C: public web and Google Play readiness

Recheck the official policies in [the source register](../research/sources.md) immediately before preparing a candidate and again before submission. Record the checked date and actual configuration. Changing SDKs, collection, sharing, monetization, audience or permissions requires a new review. These are initial engineering gates, not a claim of store approval.

- Developer identity, package/application identity, signing keys, store account type, account-specific testing eligibility and distribution requirements are verified with the owner. Store credentials remain outside Git. Check [personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) against the actual account.
- The submitted Android artifact meets the **then-current** target API, build and signing rules. Do not copy a target API number or annual deadline into a long-lived promise. [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).
- A public privacy policy and accurate Data safety answers cover actual app and third-party SDK behavior, including auth, journal content, audio, uploaded files, AI, analytics and crash telemetry. Verify declarations against network flows and SDK inventory. [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
- Account creation includes an accessible in-app deletion path and a functioning web deletion request resource associated with the app/developer; disclose justified retained data and timing. [Account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).
- App access instructions let reviewers exercise protected features using a purpose-built synthetic account. Complete current content rating, audience and permission declarations for the actual release.
- Notification and microphone requests occur in context, denied/revoked permissions remain usable, sensitive notification previews default to minimal content, and the merged Android manifest contains only justified permissions.
- Accessibility, real Android-device resume/reboot/upgrade tests, browser support, migration upgrades, export/deletion, backup recovery, incident response and support documentation pass for enabled features.
- The owner reviews the concrete candidate, store listing, policy forms, operating costs and deployment plan before authorized publication. This phase's planning is not that authorization.

All policy links above were checked 2026-10-13. The evidence report must use its own current check date at release.

### Phase 59 local preparation (2026-10-21)

Provisional materials live under `docs/release/` and `docs/engineering/play-policy-review-2026-10-21.md`. Target API **36** is configured in mobile app config; built AAB evidence, signing credentials, public domain URLs, and operator approval remain unmet. Local preparation does **not** authorize store submission.

### Phase 60 local preflight / rehearsal (2026-10-21)

Executable `pnpm release:preflight` fail-closes without human OA. Android authoritative path is Expo prebuild + signing guard (stale `android/` debug fallback is rejected). Play **percentage staged rollouts are for updates only**; first publication uses testing tracks / first production release (ADR 0057, runbook `docs/engineering/runbooks/public-release-publication.md`). Phase 60 remains incomplete until approved Android + matching web are live.

## Gate D: paid product

Choose free/paid feature boundaries and commercial countries before implementing purchase flows. Verify merchant eligibility for the owner's location and current Play regional programs. Paid digital features and cloud storage generally fall under the Play payments policy, with exceptions/programs that must be checked for the actual markets; do not steer Android users to web checkout by default. [Play Payments policy guidance](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en) (checked 2026-10-13).

Entitlements are verified on the server and exercised through purchases, duplicate/out-of-order provider events, restore, renewal, cancellation, refund, grace/hold and revocation. Android and web share entitlement outcomes without trusting client flags. Confirm the currently supported Billing Library/API, subscription disclosures and cancellation guidance. [Play Billing documentation](https://developer.android.com/google/play/billing).

Paid limits must protect cost without stranding users: preserve reads/export and explain downgrade over-quota behavior. Measure storage/egress/job/AI expense at expected use; set quotas, spend alerts and support procedures. Do not sell an unfinished vault or present an unavailable integration as a delivered premium benefit.

## Independent gates for optional modules

### Vault

The vault stays disabled until the [vault threat model](../architecture/security-and-vault.md), cross-platform crypto feasibility spike and independent qualified security review pass. The review covers authenticated encryption, vetted library support, key hierarchy/derivation/wrapping, short-PIN resistance, biometric key release, browser key protection, recovery and loss, device enrollment/revocation, backup/export behavior, memory/plaintext cleanup and upgrade compatibility.

Evidence must show ciphertext-only storage/sync for vault payloads, no plaintext in search/previews/logs/telemetry/notifications/AI, and correct behavior after lock, background, process death, biometric changes and key loss. Document what compromised/unlocked devices, browsers and metadata can reveal. UI locking does not establish encryption. Do not implement custom cryptographic algorithms or claim end-to-end encryption until the documented model and tests substantiate it. Unresolved crypto/recovery risks block this feature even if the rest of the app releases.

### Reminders and alarms

Basic reminders ship with honest channel-specific capabilities. An exact-alarm feature requires a separate feasibility/policy decision: demonstrate a precise user-facing need, permission approach, current Play eligibility, native-build support and fallback when permission is absent. `USE_EXACT_ALARM` is restricted; Daynori's eligibility is unproven. [Play sensitive-permission policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en), [Android alarm guidance](https://developer.android.com/develop/background-work/services/alarms) (checked 2026-10-13).

Test reboot, permission revocation, clock/time-zone changes, device idle/battery restrictions, force-stop and offline periods on physical devices. Browser push cannot promise a native-style alarm or a precise delivery time. API/job dispatch, provider acceptance and actual display are different evidence. Product copy and reminder status must expose these limits.

### Rooms and chat

Release invite-only sharing only after scoped memberships, invitations/expiry, authorization/realtime revocation, consent and ownership/exit semantics pass. User-generated content visible to other users creates moderation requirements even when the audience is a subset of users. Terms acceptance before contribution, objectionable-content rules, in-app report/block controls and a staffed moderation/action process are release prerequisites; a private-room label is not a policy exemption. [Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) (checked 2026-10-13; Phase 54 dated review 2026-10-20 in `docs/policy/google-play-ugc-review-2026-10-20.md`).

Phase 54 delivers provisional local report/block/terms/audit controls (ADR 0051). **Staffed moderation ownership remains unmet** and keeps rooms/chat release blocked. Test harassment reports, blocked interactions, attachment abuse, invitation guessing, rate limits and moderator access/audit. Decide target age/audience and evaluate applicable child-safety policy before opening any social feature. The initial product does not add public discovery or anonymous rooms.

### Google Drive

Validate minimum OAuth scope and current verification/assessment obligations against an actual prototype. Test selecting existing files, app-created files, externally added files, folder changes, permission loss, token revocation, quota/rate limits and deletion. Do not assume `drive.file` grants automatic access to every new externally uploaded file in a chosen folder. [Drive scope documentation](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) (checked 2026-10-13).

Users choose explicitly between an app-managed copy and a provider reference; explain availability, quotas, provider ownership and deletion consequences. Drive is optional and cannot replace authorization, database backup or a vault encryption decision.

### AI assistant

Release only after provider/retention/cost decisions, explicit opt-in, workspace-scoped retrieval, prompt-injection evaluation, private-content exclusions, user-visible citations and cancel/delete controls pass. Vault content is excluded. Proposed modifications require a reviewable confirmation before execution; room retrieval respects current membership. Apply current [Play AI-content requirements](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en) (checked 2026-10-13) and document limits without promising expert advice. Keep this feature disabled until its dedicated gate has evidence.

### iOS

Treat iOS as a later platform gate: development hardware/build/signing, native adapter parity, background/notification/biometric behavior, accessibility, store policy/billing and physical-device QA must be established before advertising availability. Android tests cannot stand in for iOS evidence.

Phase 61 delivers Expo iOS configuration, platform adapters, and an explicit [support matrix](ios-support-matrix.md). Acceptance still requires Mac development-build and physical-device evidence per [ios-development.md](ios-development.md).

Phase 62 local package: [docs/release/ios/](../release/ios/README.md) (ADR 0060). TestFlight/store submission remain unauthorized until native evidence and owner OA exist. This section does not authorize App Store submission.
