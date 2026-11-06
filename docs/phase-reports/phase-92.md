# Phase 92: Text assistant chat and contextual guidance

## Identity and scope

- Phase: [92 — Text assistant chat and contextual guidance](../roadmap/phases/92-text-assistant-chat-and-contextual-guidance.md).
- Status: **blocked** — Foundational implementation, streaming transport, UI components, citation deep links, history deletion, markdown sanitization, and independent verification complete: Server-Sent Events (SSE) streaming transport implemented and verified (AST-001) via `POST /v1/ai/assistant/stream`; citation deep links repaired to canonical web and mobile routes (AST-002) with Help ID support in `AiSourceAccessRequestSchema`; strict read-only boundary enforced (AST-003) ensuring assistant chat cannot mutate organizer data without confirmed Phase 93 organizer tools; client-selected knowledge source controls implemented and verified (AST-004) with dynamic filtering across Help, Notes, Tasks, and Journal; contextual starter suggestion catalog created (AST-005) via `ASSISTANT_STARTER_SUGGESTIONS` and interactive UI pills; assistant history management delivered (AST-006) via `DELETE /v1/ai/assistant/history` with single-turn and workspace-wide clearing; markdown output sanitization verified (AST-007) via `sanitizeAssistantMarkdown` neutralizing executable HTML, javascript: links, and tracking pixels; persistent desktop side drawer and keyboard-safe mobile sheet implemented and verified (AST-008) in `AssistantPanel.tsx` and `AssistantSheet.tsx`; all 7 integration tests in `phase92-assistant-chat-stream-guidance.test.ts` pass; production AI activation and live provider calls remain fail-closed pending explicit owner approval of live synthetic test and enterprise provider contract (`DEF-V2-008` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `60bacf2edeed58dfc5d41f986e6f8a0e4a6b65d8`, `codex/free-core-preview`.
- Hard prerequisites: Phase **91**.
- Owner Scheduling Authorization: The owner authorized Phase 92 implementation and independent UI/transport verification before Phase 91 final acceptance ([ADR 0092](../decisions/0092-text-assistant-chat-and-contextual-guidance.md)). Phase 92 is recorded as `blocked` due to unmet owner live synthetic test approval and enterprise contract gates (`DEF-V2-008` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability, live calls, or paid infrastructure claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Server-Sent Events Streaming Transport (AST-001 Remediation):**
   - Implemented `POST /v1/ai/assistant/stream` emitting SSE protocol events: `start` (turn ID, provider mode, provisional label), `context` (retrieved source count, authorized citations), `chunk` (sequential text tokens), `done` (authoritative answer, tokens reserved/settled), and `error`.
   - Wired client disconnect handling to `AbortController` upstream, cleanly halting provider streaming and settling budget reservations without recording corrupted turns.
   - Added `streamAssistantAsk` to `@daynori/api-client` parsing the SSE stream and dispatching typed events.

2. **Canonical Web & Mobile Deep Links (AST-002 Remediation):**
   - Repaired citation deep link generation in `apps/api/src/modules/ai/service.ts` from invalid paths to canonical routes:
     - Notes: `/library?noteId=${encodeURIComponent(id)}`
     - Tasks: `/plan?targetId=${encodeURIComponent(id)}&targetType=task`
     - Journal: `/journal?entryId=${encodeURIComponent(id)}`
     - Help: `/help?article=${encodeURIComponent(articleId)}`
   - Updated `AiSourceAccessRequestSchema` in `@daynori/contracts` to accept string identifiers (up to 128 characters) and return `deepLink`.
   - Updated `resolveAiSourceAccess` in `apps/api/src/modules/ai/assistantService.ts` to verify Help articles against `HELP_ARTICLES` and attach canonical route deep links.

3. **Strict Read-Only Boundary Enforcement (AST-003 Remediation):**
   - Enforced strict read-only boundary: Phase 92 text chat cannot execute organizer mutations, create items, or bypass user confirmation.
   - Proposal execution remains disabled in text chat, awaiting Phase 93 organizer tools.

4. **Client-Selected Knowledge Sources (AST-004 Remediation):**
   - Added `selectedSources` (`help`, `notes`, `tasks`, `journal`) to `AiAskRequestSchema`, `AiAskStreamRequestSchema`, and domain models.
   - Verified that unchecking a source completely bypasses that source during retrieval.
   - Deselecting all sources fail-closes with `403 AI_SCOPE_EMPTY`.

5. **Contextual Starter Suggestions (AST-005 Remediation):**
   - Defined `ASSISTANT_STARTER_SUGGESTIONS` catalog in `@daynori/domain/src/aiConsent.ts` across categories `help`, `notes`, `tasks`, `routines`, and `sync`.
   - Rendered interactive starter pills in both desktop and mobile assistant composers.

6. **Assistant Conversation History Deletion (AST-006 Remediation):**
   - Implemented `DELETE /v1/ai/assistant/history` supporting both single-turn deletion (`turnId`) and workspace-wide bulk clearing.
   - Added UI controls in `AssistantPanel` and `AssistantSheet` to delete individual turns or clear all history.

7. **Markdown Output Sanitization (AST-007 Remediation):**
   - Implemented `sanitizeAssistantMarkdown` in `@daynori/domain/src/aiConsent.ts`.
   - Strips all HTML tags (`<script>`, `<iframe>`, `<a>`, etc.), neutralizes dangerous URL schemes (`javascript:`, `vbscript:`, `data:`, `file:`), and replaces remote tracking images with safe text indicators `[Image: alt]`, while preserving safe Markdown formatting and code blocks.

8. **Persistent Desktop Side Drawer & Mobile Sheet (AST-008 Remediation):**
   - Rebuilt `AssistantPanel.tsx` as a slide-out desktop side drawer preserving active document/editor context, reachable from header sparkle button (`id="global-assistant-btn"`), dismissible with Escape.
   - Rebuilt `AssistantSheet.tsx` as a keyboard-safe mobile view with `ScrollView` and persisted draft restoration.

9. **Phase 92 Integration Test Suite Delivered:**
   - Authored `tests/integration/phase92-assistant-chat-stream-guidance.test.ts` covering SSE streaming, source selection, Help deep links, history deletion, markdown sanitization, read-only enforcement, and consent gating.
   - All 7 integration tests pass.

---

## Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerSyntheticTestApproval` | Explicit Owner Approval | **pending** | Awaiting owner review and sign-off on `synthetic-provider-package.json` (`DEF-V2-008`). |
| `liveProviderCalls` | Live Provider Execution | **prohibited** | Real provider network calls prohibited until explicit owner approval is granted. |
| `productionAiActivation` | Production AI Gate | **fail-closed** | `isAiLocallyEnabled()` strictly returns `false` in production. |
| `realUserContentTransmission` | Zero Real User Content | **pass** | No real user notes, journal entries, or vault data transmitted; synthetic test data only. |
| `readOnlyBoundary` | Zero Model Auto-Writes | **pass** | Phase 92 assistant is strictly read-only question answering and guidance. |
| `streamingSseProtocol` | SSE Streaming with Framing | **pass** | `POST /v1/ai/assistant/stream` emits start, context, chunk, done, and error events. |
| `markdownSanitization` | HTML/Image Stripping | **pass** | All executable HTML tags, dangerous schemes, and remote tracking images neutralized. |

---

## Evidence Artifacts

1. `artifacts/phase92/findings-register.json`: Catalog of AST-001 through AST-008.
2. `artifacts/phase92/synthetic-provider-package.json`: 5 scenarios capped at $0.05 USD, pending owner review.
3. `artifacts/phase92/manual-ui-evidence.json`: Manual verification of desktop side drawer, PWA sheet, and deep links.
4. `artifacts/phase92/evidence-summary.json`: Test execution summary and blocked status under `DEF-V2-008`.
5. `docs/decisions/0092-text-assistant-chat-and-contextual-guidance.md`: ADR 0092.
6. `docs/engineering/assistant-chat-and-guidance-guide.md`: Technical guide and streaming specifications.
