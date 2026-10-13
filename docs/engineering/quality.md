# Quality and verification strategy

Production grade is an evidence gate, not a visual label. A working build is necessary but cannot prove tenant isolation, draft recovery, accessible controls, secure files, or reminder reliability. Every phase chooses checks that verify its new behavior and the risks it changes.

## Test layers

- Domain tests verify invariants with deterministic time: date-only deadlines, priority ordering, recurring occurrence identity, cycle prevention, decimal money, revisions and conflict decisions.
- Contract tests verify input/output schemas, documented error codes, compatibility and rejection of unexpected values; include older supported clients when a contract changes.
- Integration tests use real local PostgreSQL/storage interfaces where practical. Cover transactions, RLS, current membership, retries, job ownership, revoked credentials, quotas and migration upgrades.
- Web and Android end-to-end journeys verify capture, organize, reopen, edit, delete/restore, offline recovery and permission-denied states. Share scenario descriptions rather than every UI test implementation.
- Security tests attack the boundaries: object-ID guessing, cross-workspace links, stale room membership, expired signed URLs, file MIME spoofing, unauthorized search and jobs, log leakage and vault downgrade paths.
- Performance tests use a recorded dataset, device/browser profile and workload. Measure tails, memory and stalled queues rather than one successful request.

Avoid tests that only repeat implementation details. Prefer a small number of meaningful scenarios for a reversible visual tweak, and broader regression coverage for authorization, money, sync, crypto, persistence or destructive operations. Use synthetic test content throughout.

## Required scenario families

**Isolation:** Two users with separate workspaces cannot read, write, search, download, schedule, export or subscribe to one another's objects. A user removed from a room loses API/realtime access and cannot replay a queued mutation; previously downloaded data has the limitations disclosed in the security model.

**Drafts and retries:** Type while offline, close the app, reopen, reconnect, and verify exact content persists. Duplicate a mutation delivery and confirm one effect. Edit the same record on two devices, delete on one, and resolve the conflict without silently losing the other draft. Revoke membership/session during replay.

**Dates and reminders:** Use Asia/Dhaka plus a zone with daylight-saving changes. Cross midnight, travel zones, alter device clock, create date-only deadlines, and reschedule a recurring task. Test denied/revoked notification permission, reboot, offline periods and server retry; displayed certainty matches actual channel capability.

**Organization:** Move a folder to its descendant and across a workspace boundary; reject both. Recover trashed content, preserve attachment relations, exercise pagination with identical timestamps, and open a result after its permissions or revision changes.

**Money:** Store integer minor units with currency exponent rules, reject NaN/overflow, and never sum different currencies without an explicit conversion model. Confirm edit/delete changes totals and exports preserve exact amounts. Expense tracking does not move money or connect bank accounts in the initial scope.

**Files and audio:** Interrupt uploads, resume or retry safely, exhaust quota, submit a disguised file, fail malware scanning, and revoke provider access. A private URL requires current access; preview surfaces cannot execute uploaded document scripts. Deny microphone permission and interrupt recording without losing the already durable portion or implying that an unsaved buffer was saved.

**Customization and onboarding:** Reorder using touch, keyboard and a screen reader. Hide a section without deleting its data, restore a layout, skip/replay onboarding, and create a custom section only from approved blocks. Too many optional modules cannot crowd the default Home.

**Release-sensitive features:** Verify export/deletion end to end, receipt replay/refund/cancellation behavior for billing, room reporting/blocking/moderation, and AI opt-in/context exclusions. Vault behavior follows its own [threat model](../architecture/security-and-vault.md) and cannot pass solely through general CRUD tests.

## Accessibility and UX evidence

Target WCAG 2.2 AA for web and equivalent native interaction quality; this is a project target until audited, not a conformance claim. Check semantic labels, focus order, visible focus, live announcements, keyboard completion, contrast, text resizing/reflow, reduced motion and error recovery. Automated scanners supplement real keyboard/screen-reader use. The normative reference is [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (checked 2026-10-13).

Native QA includes TalkBack, font scaling, one-handed touch targets, hardware back, orientation behavior, background/resume and permission prompts. Browser QA includes narrow mobile width, desktop keyboard use and the selected supported browser matrix. Record the tested versions and screenshots using synthetic content. Dragging always has move controls usable without dragging.

Use task-based usability checks with new users: create a note, find a document, complete today's routine, schedule an upcoming task, write a private journal and return to the same place. Record confusion and recovery time. Do not count asking a tester to follow a scripted tutorial as proof the default navigation is clear.

## Initial performance budgets

These are provisional project targets. The performance phase must nominate hardware/network profiles, validate them, and record any evidence-based revisions in an ADR before release:

- Local text input/save acknowledgement: p95 at or below 100 ms, without implying server synchronization completed.
- Web field targets: LCP at or below 2.5 s, INP at or below 200 ms, CLS at or below 0.1 at the 75th percentile; laboratory checks are proxies until meaningful field data exists. Definitions come from [Core Web Vitals](https://web.dev/articles/vitals) (checked 2026-10-13).
- Android cold start to usable cached Home: at or below 3 s on the nominated midrange physical device, with fixture size and build mode recorded.
- API metadata reads: p95 at or below 300 ms; mutation responses: p95 at or below 500 ms, excluding file transfer/provider work, under an initial documented synthetic workload of 100 concurrent active users.
- Large-list benchmark: 10,000 metadata records in a workspace must remain paginated/virtualized. Test sustained scrolling, navigation and memory growth; no unbounded initial fetch.
- Worker reminders and uploads have explicit queue-age/retry SLOs established by measured capacity. Network delivery and operating-system notification display are separate measures and never merged into a guaranteed alarm claim.

Record sample size, warmup, concurrency, dataset, DB size, indexes, region, device temperature/memory, error rate and p50/p95/p99. A small localhost benchmark does not demonstrate production scale. Build artifact and dependency bundle size must be tracked and given a baseline when actual apps exist.

## Future command contract

**Only the planning checker exists in Phase 00.** The commands below are proposed script names for later setup phases. They must not be reported as executed until manifests/tools/fixtures make them real. A phase report lists actual commands, not this list by copy-paste.

```text
node scripts/validate-planning.mjs       # Executable Phase 00 planning verification
pnpm lint                              # Proposed: static/style checks
pnpm typecheck                         # Proposed: strict types across packages
pnpm test:unit                         # Proposed: domain/component checks
pnpm test:contract                     # Proposed: public schema compatibility
pnpm test:integration                  # Proposed: local DB/worker/provider boundaries
pnpm test:e2e:web                       # Proposed: browser journeys
pnpm test:e2e:android                   # Proposed: native journeys
pnpm test:security                      # Proposed: isolation and threat-model cases
pnpm test:performance                   # Proposed: named reproducible benchmarks
pnpm build                             # Proposed: supported app/package build matrix
```

Choose Vitest/React Testing Library for focused behavior, Playwright for web, and a compatible native runner such as Maestro after the toolchain feasibility check. Do not treat an emulator screenshot as physical-device notification, biometric or performance evidence. Native crypto/background behavior needs development/release builds rather than assuming Expo Go parity.

## Failure policy and definition of done

Broken meaningful checks block completion. A skipped check states why, the affected behavior, the missing environment, and the gate that must eventually run it. Feature flags may keep unfinished features inaccessible, but cannot excuse failures in enabled functionality. Document flakes and isolate their causes; do not silently retry until green.

Run only checks justified by the phase/change and required gate, then stop expanding validation once the evidence is sufficient. Record exact results and manual evidence in the [phase report](../templates/phase-report.md), update the [roadmap](../roadmap/README.md), and follow [handoff](handoff.md). Coverage percentages can reveal gaps but are not acceptance criteria by themselves.
