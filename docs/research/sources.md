# Official source register

Last checked: **2026-10-13**. These are primary vendor/standards references consulted for Phase 00. They support feasibility and release constraints; they do not prove this repository implements those capabilities. Record newer check dates in phase reports when using a changing requirement.

Framework versions, service limits, pricing, scope classifications and store policies change. Phase 01 checks compatible supported versions and pins them; integration spikes test actual SDK behavior; release preparation checks the then-current store requirements and account eligibility. Do not treat `latest` URLs as a version pin or preserve a future deadline/API number as a permanent requirement.

## Frameworks and workspace

- [Expo documentation](https://docs.expo.dev/): mobile framework, development builds and release paths. Recheck for Phase 01 and major SDK upgrades.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): candidate mobile local database. Validate migrations, persistence and encryption/library compatibility in the appropriate spike.
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/): platform notification capabilities and configuration. Verify on a physical Android development/release build before relying on background behavior.
- [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/): biometric authentication adapter reference; authentication by itself does not establish vault encryption.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): device-backed secret storage and lifecycle limitations. Test reinstall, authentication changes, backup and recovery; it is not a bulk content database.
- [Next.js documentation](https://nextjs.org/docs): responsive web framework, client/server boundaries and deployment. Phase 01 pins a supported version after compatibility checks.
- [Fastify documentation](https://fastify.dev/docs/latest/): API framework, validation and plugin organization. Recheck API/version compatibility at setup and upgrades.
- [pnpm workspaces](https://pnpm.io/workspaces): monorepo package workspace semantics. Pin the package manager and enforce dependency boundaries in setup.
- [Drizzle ORM overview](https://orm.drizzle.team/docs/overview): typed database tooling candidate. Validate driver/migration compatibility and choose one migration authority before database implementation.

## Managed data foundation

- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): database policy behavior and privileged-access cautions. Application authorization and current membership checks remain required.
- [Supabase custom-role privileges](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c): inherited grants and restricted application-role setup. Verify real runtime/migration role behavior and connection-pool identity scoping.
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control): private object policy integration. Exercise user/role and signed-URL boundaries in tests.
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups): database recovery capability and exclusions. Storage objects are outside database backups; require an independent object restoration drill.

Recheck foundation references when selecting plans/deployment regions, changing RLS or designing backup/restore. Provider capabilities are not blanket promises about Daynori's isolation or recovery.

## Accessibility, web performance and push

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): normative accessibility criteria underlying the web AA target. Audit actual interactions, not just color tokens.
- [Core Web Vitals](https://web.dev/articles/vitals): Google metric definitions and current good-experience thresholds. Record field/laboratory measurement limitations in performance reports.
- [W3C Push API](https://www.w3.org/TR/push-api/): browser push API contract. Test supported browser/OS combinations; push does not establish exact alarm delivery.
- [W3C Indexed Database API](https://www.w3.org/TR/IndexedDB/): browser local-store interface. Validate durability, quota, upgrades, clearing and trusted-device behavior rather than promising unlimited storage.

Recheck these at design/accessibility/performance gates and when changing browser support. Conformance and measured performance remain unverified until actual interfaces exist.

## Android capabilities

- [Android notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission): permission request and denied-state behavior. Test revocation and foreground/background cases on target devices.
- [Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms): inexact/exact scheduling and permission distinctions. The alarm feasibility phase must verify native support and fallback.
- [Android biometric authentication](https://developer.android.com/identity/sign-in/biometric-auth): native authentication/key-use patterns. Vault design requires its separate cryptographic review and device-change scenarios.

Recheck on the selected Android target/SDK and major upgrades. Device-dependent evidence is required; reading a page cannot validate a specific build.

## Google Play policies and release

- [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) and [Payments guidance](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en-en): digital-feature and service payment requirements, with program/region exceptions. Confirm actual country/merchant eligibility before choosing Android checkout flows.
- [Play Billing](https://developer.android.com/google/play/billing): supported purchase integration and lifecycle. Recheck current library/API support when implementing and before submission.
- [User-generated content policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en): shared user content moderation obligations, including terms, report/block and appropriate action. Invite-only rooms still need a scoped assessment and operating process.
- [Account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): account-creation deletion requirements, including in-app and web request paths and associated data handling.
- [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en): disclosures must reflect app and third-party SDK collection, sharing and security behavior.
- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en): release-time Android targeting rules. Resolve the current number/deadline from the source and Play Console at submission rather than freezing it in the long-term roadmap.
- [Testing for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en): account-specific testing and production-access requirements. Verify whether they apply to the owner's actual account.
- [Sensitive permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en): restricted permissions including exact alarms. Daynori's `USE_EXACT_ALARM` eligibility has not been established.
- [AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en): applicable generated-content protections and in-app feedback/reporting requirements. Review the actual assistant feature scope before release.

Recheck all relevant policies before enabling the corresponding feature, preparing a release candidate and submitting it. Keep completed policy forms, package permissions, SDK inventory, privacy disclosures and enabled features consistent. The [release gates](../engineering/release-gates.md) translate these sources into project verification work; store acceptance remains external.

## Google Drive

- [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth): scope classifications and per-file access. `drive.file` supports files created/opened/shared with the app; do not infer blanket discovery of future external folder uploads.

Recheck scope/verification obligations during the Drive spike and before OAuth publication. Record selected scopes, measured folder behavior, provider retention/deletion semantics, and verified alternatives in an ADR. Least-privilege scope selection is a design requirement, not an already implemented connection.

## Citation and update rules

Link claims to the actual supporting official page near the claim. Record checked date, changed assumption and affected phase if a source changes. Prefer dated vendor release notes or versioned documentation when pinning a version. Do not copy policy pages into the repository, invent approval, or use search snippets alone as proof that a platform integration works.
