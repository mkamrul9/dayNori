# Phase 51: Shared rooms, invitations, and roles

## Identity and scope

- **Phase ID/specification:** [Phase 51 — Shared rooms invitations and roles](../roadmap/phases/51-shared-rooms-invitations-and-roles.md).
- **Status:** `blocked` (provisional local rooms delivered; prerequisite Phases 38/10 and rooms release-gate evidence unmet — **not** release-complete).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 50 deferral `fa08337`.
- **Prerequisites:**
  - Phase 38 — Controlled private beta: **blocked** (local prep only; no staging/beta cohort, no real tester invitations).
  - Phase 10 — Personal workspace and preferences: **blocked** (provisional delivery; physical Android TalkBack hardware gates unmet).
- **Owner selection:** Explicit provisional local development while prerequisite release evidence remains pending. Changes development order only; does **not** authorize public sharing, real-user invitations, deployment, or release enablement.
- **Unrelated statuses preserved:** Phase 50 deferred; Phase 49 blocked on live Google verification; vault activation disabled.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Room workspaces, roles, invitations, lifecycle (local API + DB) | **Yes** (provisional) |
| Explicit personal→room note/todo copy boundary | **Yes** (minimal) |
| Web Settings rooms panel + Android RoomsSheet | **Yes** (local gate) |
| Multi-account PostgreSQL/API integration tests | **Yes** (synthetic) |
| Real-user invitations / outbound email/messages | **No** |
| Private-beta / production rooms enablement | **No** |
| Phase 52 shared content sync (later) / Phase 53 chat | **No** — not this phase |
| Vault activation | **No** — remains disabled |

## Result

### Handoff correction (Phase 50)

Earlier drafts incorrectly implied Phase 51 was vault/encrypted storage. Corrected: Phase 51 is shared rooms with prerequisites **38** and **10** only. Drive/vault are not Phase 51 prerequisites. See [phase-50.md](phase-50.md) handoff.

### Behavior delivered (local / provisional)

- **Data model:** migrations `00050_room_invitations_and_lifecycle.sql`, `00051_room_invitation_preview.sql` — room status/archive, membership revision, `room_invitations` (token hash at rest), RLS, last-owner trigger, legacy `(Legacy Room)` quarantine via `is_confirmed_shareable_room`, `SECURITY DEFINER` accept/preview.
- **Domain:** `@daynori/domain` `rooms.ts` — permission matrix, invite TTL/limits, shareable vs blocked kinds, generic invite error mapping.
- **API:** `/v1/rooms*` create/list/get/archive; invitations create/list/revoke; preview/accept; members list/role/remove; leave; transfer ownership; copy preview/copy. Gate: test/dev or `DAYNORI_ROOMS_LOCAL_ENABLED=true`.
- **Bypass blocks:** generic `POST /v1/workspaces` with `kind=room` and room member-add via generic members route rejected (invitation path required).
- **Invitations:** 32-byte tokens, SHA-256 hashes, bearer vs targeted recipient, atomic single-use, idempotent re-accept by successful recipient, concurrent outsider denied; no raw tokens in audit details.
- **Boundaries:** joining a room does not grant personal workspace access; journal/vault copy blocked; note copy creates new destination identity and preserves personal original.
- **Clients:** typed `DaynoriApiClient` room methods; web `RoomsPanel`; mobile `RoomsSheet` with local link copy (no outbound send).

### Design decision

[ADR 0048](../decisions/0048-shared-rooms-invitations-and-roles.md).

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Joining a room never grants another user’s personal workspace | Integration: editor cannot `getWorkspace(personalOwnerId)` | **PASS** (local) |
| Role changes and invitation replay authorized/audited | Integration: role matrix, revoke, targeted mismatch, replay idempotent, outsider denied | **PASS** (local) |
| Users understand private vs shared context | Web/Android rooms UI shows room name + role; copy preview ownership text | **PASS** (local UI); TalkBack hardware **unexecuted** |
| Last-owner / transfer / bypass | Integration: leave blocked, demotion blocked, `POST /v1/workspaces` kind=room rejected | **PASS** (local) |
| Journal/vault exclusion | Integration: journal copy preview blocked | **PASS** (local) |
| Release / private-beta enablement | Phases 38/10 + rooms release gate | **FAIL prerequisites → blocked** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`, local PostgreSQL via project migrator. Date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase51-rooms-domain.test.ts tests/integration/phase51-rooms-invitations.test.ts` | 0 | 2 files, 8 tests passed |
| `pnpm --filter @daynori/api typecheck` | 0 | passed |
| `pnpm --filter @daynori/domain typecheck` | 0 | passed |
| `pnpm --filter @daynori/contracts typecheck` | 0 | passed |
| `pnpm --filter @daynori/api-client typecheck` | 0 | passed |
| `pnpm --filter @daynori/web typecheck` | 0 | passed |
| `pnpm --filter @daynori/mobile typecheck` | 0 | passed |
| `pnpm --filter @daynori/web build` | 0 | Next.js production build passed |
| `npx eslint` on Phase 51 touched paths | 0 | clean on scoped files |
| `pnpm lint` (repo-wide) | 1 | **pre-existing** errors in vault harnesses / drive spike (not Phase 51 paths) |
| `pnpm audit:secrets` | 0 after repair | Synthetic fixture shortened; scanner coverage preserved |
| `node scripts/validate-planning.mjs` | 0 | passed |
| `git diff --check` | 0 | clean |
| Physical Android TalkBack / multi-device UI | — | **Unexecuted** |
| Outbound invitation email/SMS | — | **Not implemented** (by design) |
| Real-user / staging invitations | — | **Blocked** on Phase 38 |

## Repair (post-`f7deab4`)

| Gap | Fix |
|---|---|
| Quarantine keyed off renameable ` (Legacy Room)` suffix | Forward migration `00052`: `is_confirmed_shareable_room` uses inventory status only |
| Sequential “concurrency” demotion test | Independent-connection overlap + API concurrent leave/demote; workspace `FOR UPDATE` serialization |
| Canonical `owner_id` vs memberships | Transfer locks workspace; demote/remove of canonical owner blocked until transfer |
| Accept actor binding | `accept_room_invitation` requires `app.current_user_id()`; mismatched arg rejected |
| Copy only checked destination ID | Payload title/text verified; embedded private UUIDs and attachments rejected; change-feed emit |
| Invite deep-link implied | Documented manual-token harness (clipboard + paste); no routed accept page |
| Secret-scan on phase47 fixture | Shortened synthetic `recoverySecret` value; `pnpm audit:secrets` exit 0 |
| Production enablement via local flag | Shared `isRoomsLocallyEnabled` — production always false even when `DAYNORI_ROOMS_LOCAL_ENABLED=true` (flag present and absent covered) |

Repair verification: `pnpm vitest run tests/integration/phase51-rooms-repair.test.ts` (includes production gate present/absent); prior Phase 51 suites still pass.

## Defects, limitations and recovery

1. Phase remains **blocked / incomplete** until Phase 38 private-beta evidence and Phase 10 hardware gates (as recorded) plus rooms release-gate moderation/report/block readiness are accepted.
2. `DAYNORI_ROOMS_LOCAL_ENABLED` is local harness only — not production authorization.
3. Previously downloaded room copies and issued short-lived URLs cannot be remotely erased; document this to operators before any invite-only release.
4. Shared note/task/file sync and revocation handling are Phase 52; room chat is Phase 53 — not claimed here.
5. Repo-wide `pnpm lint` may still report pre-existing vault harness / drive spike issues unrelated to rooms.

### Unblocking release

- Accept Phase 38 staging/beta cohort and invitation operations under release gates.
- Satisfy rooms gate: terms, report/block, moderation staffing, abuse limits evidence.
- Keep vault disabled independently; do not couple vault enablement to rooms.

## Documentation and Git review

- This report; CHANGELOG; progress.json (`51` blocked/provisional).
- ADR 0048; data-model / api-conventions / integrations architecture updates.
- Phase 50 handoff correction retained.
- Intended commit subject: `feat(rooms): add invitations roles and explicit sharing boundaries`

## Handoff

Phase 51 provisional local rooms/invitations/roles are delivered and verified against synthetic multi-account PostgreSQL/API tests. Phase status remains **blocked** on Phases 38/10 and rooms release evidence — do not treat as release-complete.

No deployment, real-user invitations, outbound messages, paid provisioning, or public sharing from this phase.

Exact next action after this repair commit: owner-selected Phase 52 (shared content sync and revocation — **not** chat) for provisional local development, or resume Phases 38/10 / rooms gate evidence.
