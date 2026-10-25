# V2 quality, migration, and release gates

Status: acceptance targets to verify in Phases 65–103, extending [existing release gates](../../engineering/release-gates.md) and [operations requirements](../../architecture/operations-and-scaling.md). Targets are not current guarantees.

## Fast and dependable

Phase 65 records current timings and environment before optimization. Phase 98 repeats the same workloads against the final feature set. Use the existing 10,000-item fixture, a valid five-level folder tree, realistic long documents, pending mutations, and bounded attachment metadata. Record device, CPU/network profile, data size, region, sample count, warm/cold state, and p50/p95. A small local synthetic test does not prove production capacity.

- Local edit acknowledgment: p95 <=100ms in the nominated reference profile.
- Mobile cold usable Today: <=3 seconds on a nominated midrange Android device under a declared network/cache profile. Measure native and installed PWA separately. Do not count splash visibility as usable content.
- Metadata API: p95 reads <=300ms and writes <=500ms at a documented 100-active-user synthetic profile near the chosen region. Measure end-user network latency from Bangladesh separately.
- Web: LCP <=2.5s, INP <=200ms, CLS <=0.1 at the 75th percentile where representative field data exists. Use the [Core Web Vitals definitions](https://web.dev/articles/vitals). Pre-release lab results are provisional evidence, not a claim of real-user percentiles.
- Assistant: first useful text target <=3s p95 for short grounded asks and draft completion <=15s p95 on the chosen live provider/profile. Record timeouts and completion rate with these numbers; revise an infeasible target with explicit evidence instead of concealing slow failures. Voice upload/transcription has separate measured duration/size profiles.
- No accidental eager download of all files, AI indexes, mascot animations, tour chapters, or developer tooling on the initial route. Set measured route/asset budgets after Phase 65's baseline; lazy load advanced features and stop invisible animation.
- Pagination, list virtualization, bounded queries, tenant-aware indexes/cache keys, incremental sync, and cancellation are required where workload evidence shows need. Memory and long-session stability matter alongside initial loading.

## Security and privacy

Strict TypeScript, schema validation, workspace/membership authorization, safe errors, and module boundaries remain mandatory in every phase. Phase 97 audits the completed surface rather than postponing security until the end.

Cover IDOR across every API/search/export/upload/download/job, cross-account local-cache and tour/report queues, CSRF/session/cookie protections, rich-content XSS/CSP, unsafe URLs and previews, file/MIME/size/quota validation, SSRF boundaries, rate limits, secret/dependency scanning, role-restricted developer/support routes, and sensitive-data redaction. Feedback attachments, AI retrieval/citations, indexed content, and notification payloads are included in the threat model.

Vault stays off until independent qualified review and device recovery/crypto gates pass. Screen locking is not encryption. AI excludes vault content even when the client is unlocked. Optional integrations, billing, and rooms need their existing dedicated gates and accountable owners; a UI preference cannot unlock them.

## Offline, upgrades, and compatibility

Phase 77 must design and verify a public executable shell that can safely reopen account-scoped local organizer data on a previously authorized trusted device. Do not cache authenticated HTML, API responses, RSC payloads, signed URLs, or private content in shared Cache Storage to achieve this. An ADR must settle the boot/session/local-unlock model before implementation. Fresh devices and missing local prerequisites need honest fallback.

Migration cases include existing V1 accounts, existing layouts/hidden preferences, V1 three-step onboarding progress, stored drafts, IndexedDB/SQLite schema upgrades, queued mutations and receipts, stale service workers, unsupported client/server versions, and existing provider tokens. Account switches and logout quarantine or clear local data under the established policy. Updates cannot discard unsaved work or clear stores as a repair strategy.

Exercise concurrent editing and explicit conflict recovery; duplicate retries; server accepted/client timed out; interruption during upload/transcription/report submission; export/import with binary manifests; Trash restore; and deletion suppression after backup restore. Document forward-fix or rollback limits for schema changes and pending operations.

## Accessibility and usability

Target applicable [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) criteria and native platform semantics, with actual keyboard, screen-reader, focus, contrast, text scaling, reduced-motion, error identification, and non-drag alternatives. Automated checks support manual validation; they do not establish complete compliance alone.

Fresh-user validation must include sign-up, first saved/reopened item, task vs routine, finding an advanced feature, hiding/restoring a section, completing an action-based tour, denied notification permission, recovering a draft, submitting feedback, and confirming an assistant draft. Phase 99 targets at least five representative consenting participants, with participant characteristics and limitations recorded; do not fabricate participants if unavailable. At least four of five should complete core capture/reopen and find Help without intervention, with zero unresolved data-loss, inaccessible-blocking, or cross-account issues. Revise the design if findings fail the gate.

## Release process

Phase 100 consolidates coverage, real-device/provider evidence, defect severity, and an enabled-feature manifest. The full V2 goal remains open if any required function is unavailable; owner-approved smaller previews are clearly identified separately.

Phase 101 prepares concrete web/PWA builds, signed Android artifacts and inspection evidence, migration rehearsals, backup/restore evidence for metadata and objects, operating cost/hosting choice, support owner/contact, privacy/consent text, rollback/kill switches, release notes, store-policy review, and deployment instructions. Recheck current official policies when selected; this plan does not freeze policy dates or SDK requirements.

Phase 102 publishes only after the owner explicitly authorizes the prepared candidate and actual destinations. Existing release gates and signed/operator evidence are still required. Report upload, approval, availability, and observed smoke results separately. A successful deployment alone does not close Android store review, AI, physical push, or native iOS gates. Production-safe synthetic smoke checks and known rollback procedure precede rollout expansion.

Phase 103 conducts one bounded post-release review using privacy-safe support themes, crashes, performance, cost, and actual learning friction. Its duration is agreed at release; it does not create an infinite autonomous monitoring task.

## Common phase evidence

Read current package scripts before choosing commands. Expected checks, as relevant, include `pnpm typecheck`, `pnpm lint`, `pnpm test:contract`, targeted `pnpm exec vitest run ...`, `pnpm test:e2e:web`, `pnpm test:e2e:android`, `pnpm test:security`, `pnpm test:performance`, affected builds, `pnpm audit:secrets`, `pnpm audit:deps`, and `node scripts/validate-planning.mjs`.

Reports name exact commands, exit codes, result counts, revision/environment, actual manual evidence, and unmet conditions. Do not prewrite successful reports for future phases. One completed phase produces one reviewed local conventional commit; no push, purchase, submission, or deployment is implied.
