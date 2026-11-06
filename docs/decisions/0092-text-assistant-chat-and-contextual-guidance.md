# ADR-0092: Text assistant chat and contextual guidance

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 92 with explicit scheduling exception).
- Related: [Phase 92](../roadmap/phases/92-text-assistant-chat-and-contextual-guidance.md), [ADR 0008](0008-opt-in-ai-and-later-rooms.md), [ADR 0052](0052-ai-provider-privacy-and-retrieval.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0091](0091-scoped-retrieval-indexing-and-grounding-quality.md), [DEF-V2-008](../roadmap/v2/function-register.json), [release-gates.md](../engineering/release-gates.md), [assistant-chat-and-guidance-guide.md](../engineering/assistant-chat-and-guidance-guide.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 92 implementation and independent UI/transport verification before Phase 91 final acceptance:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 92 implementation and independent UI/transport verification before Phase 91 final acceptance. Record this exception in an ADR and roadmap metadata. Preserve Phase 90/91 provider, consent, budget, and release gates. This authorization does not permit live provider calls, transmission of real user content, production AI activation, or paid infrastructure. Prepare any required live synthetic test for separate explicit approval."

Phase 92 delivers the conversational text assistant chat interface and contextual guidance experience across web desktop, mobile PWA, and native layouts. Prior provisional implementations relied on unary blocking JSON POST requests, generated broken route deep links (`/notes?id=...` instead of canonical web routes), lacked client-selected knowledge source controls, lacked history deletion, permitted unescaped markdown output injection risks, and lacked persistent desktop side drawers preserving editor context.

---

## Findings Register & Remediations

An audit of the assistant chat and guidance architecture established the findings register in `artifacts/phase92/findings-register.json`:

1. **AST-001 (Streaming Transport — Remediated):**
   - *Finding:* `POST /v1/ai/assistant/ask` was a unary blocking endpoint. Clients waited for complete provider responses without progressive feedback.
   - *Remediation:* Implemented `POST /v1/ai/assistant/stream` with Server-Sent Events (`text/event-stream`). Framed events include `start` (turn ID, provider mode, label), `context` (retrieved source count, citations), `chunk` (progressive text tokens), `done` (authoritative answer, tokens reserved/settled), and `error`. Client aborts immediately trigger upstream cancellation.

2. **AST-002 (Canonical Web Deep Links — Remediated):**
   - *Finding:* Assistant citations returned paths like `/notes?id=...` and `/tasks?id=...`, which led to 404s because Daynori web routes are `/library?noteId=...`, `/plan?targetId=...&targetType=task`, `/journal?entryId=...`, and `/help?article=...`.
   - *Remediation:* Repaired citation link generation in `service.ts` and `assistantService.ts` to output canonical URLs. Added verification in `checkAiSourceAccess` so citation clicks navigate safely.

3. **AST-003 (Strict Read-Only Boundary — Remediated):**
   - *Finding:* Phase 56 allowed heuristic proposal generation during ask. In Phase 92, the assistant must remain strictly read-only question answering and guidance.
   - *Remediation:* Enforced read-only boundaries: Phase 92 chat performs zero organizer writes, calls no tools, and executes no mutations. Proposal confirmation is isolated and unexecuted, awaiting Phase 93 organizer tools.

4. **AST-004 (Client Knowledge Source Controls — Remediated):**
   - *Finding:* Users could not select which knowledge sources were searched.
   - *Remediation:* Added `selectedSources` (`help`, `notes`, `tasks`, `journal`) to `AiAskRequestSchema`, `AiAskStreamRequestSchema`, and domain models. Deselecting all sources fail-closes with `403 AI_SCOPE_EMPTY`.

5. **AST-005 (Contextual Starter Suggestions — Remediated):**
   - *Finding:* The composer presented an empty textarea with no guidance on capabilities.
   - *Remediation:* Created `ASSISTANT_STARTER_SUGGESTIONS` in `@daynori/domain` across `help`, `notes`, `tasks`, `routines`, and `sync`. UI renders clickable starter pills.

6. **AST-006 (History Deletion & Privacy — Remediated):**
   - *Finding:* Conversation history could not be deleted by users.
   - *Remediation:* Implemented `DELETE /v1/ai/assistant/history` supporting single-turn (`turnId`) deletion and workspace-wide bulk clearing.

7. **AST-007 (Markdown Output Sanitization — Remediated):**
   - *Finding:* Model markdown output lacked sanitization against HTML injection, dangerous URL schemes, and tracking pixels.
   - *Remediation:* Implemented `sanitizeAssistantMarkdown` in `@daynori/domain`, stripping all HTML tags, `javascript:` / `vbscript:` schemes, and remote tracking images while preserving Markdown formatting and code blocks.

8. **AST-008 (Persistent Desktop Side Drawer — Remediated):**
   - *Finding:* Assistant was an inline component rather than a persistent side drawer preserving editor state.
   - *Remediation:* Built `AssistantPanel` as a slide-out desktop side panel with keyboard-safe mobile sheet support, accessible via header sparkle button (`id="global-assistant-btn"`), dismissible with Escape, and preserving the background editor page.

---

## Decision

1. Adopt the Server-Sent Events (SSE) streaming transport for Daynori Assistant text chat.
2. Enforce strict read-only boundary: Phase 92 text assistant provides answers and guidance only; organizer mutations require explicit Phase 93 tool protocols.
3. Keep production AI activation fail-closed under release gate `DEF-V2-008`. Live provider calls and transmission of user content remain blocked until separate explicit owner authorization.
4. Prepare synthetic evaluation package (`artifacts/phase92/synthetic-provider-package.json`) capped at $0.05 USD for separate owner review.

---

## Consequences

- **Positive:**
  - Real-time streaming token display without blocking HTTP responses.
  - Users have full transparency and control over which knowledge sources are queried.
  - Safe markdown rendering prevents XSS and privacy leakage via remote tracking pixels.
  - Seamless citation deep linking into canonical web and mobile organizer views.
  - Persistent side drawer preserves user document and task edit context.
- **Negative / Trade-offs:**
  - SSE connections require persistent HTTP connections with flush management.
  - AI assistant remains `blocked` in production under `DEF-V2-008` pending live provider approvals.
