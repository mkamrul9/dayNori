# Daynori Assistant Text Chat and Contextual Guidance Engineering Guide

This guide documents the architecture, transport protocols, security sanitization, source filtering, and operational procedures for the Daynori Text Assistant (Phase 92).

---

## 1. Architectural Overview & Streaming Protocol

Daynori Assistant provides grounded conversational answers and contextual help. It uses Server-Sent Events (SSE) over HTTP for progressive token streaming.

### 1.1 SSE Protocol Framing

Streaming is requested via `POST /v1/ai/assistant/stream` with `Accept: text/event-stream`. The server emits newline-delimited SSE blocks formatted as:

```http
event: <eventType>
data: <jsonPayload>

```

#### Event Lifecycle

1. `start`:
   - Emitted immediately after initial consent validation and turn ID creation.
   - Payload: `{ type: 'start', turnId: string, providerMode: string, label: string }`.
2. `context`:
   - Emitted once knowledge sources are retrieved and citations bound.
   - Payload: `{ type: 'context', retrievedSourceCount: number, citations: AiCitation[] }`.
3. `chunk`:
   - Emitted sequentially as text tokens arrive from the provider adapter.
   - Payload: `{ type: 'chunk', text: string }`.
4. `done`:
   - Emitted when streaming completes and the turn is recorded in `app.ai_assistant_turns`.
   - Payload: `{ type: 'done', turnId: string, answer: string, abstained: boolean, citations: AiCitation[], tokensReserved: number, tokensSettled: number }`.
5. `error`:
   - Emitted on mid-stream exceptions (e.g. timeout, rate limit, provider error).
   - Payload: `{ type: 'error', error: { code: string, message: string } }`.

### 1.2 Disconnect & Cancellation

Client disconnects (`request.raw.on('close')`) trigger the request `AbortController`. The provider stream terminates immediately, and no ungrounded partial turns are recorded. Transmitted provider content cannot be recalled, but budget settlement records the abort status cleanly.

---

## 2. Security & Markdown Sanitization

Untrusted model outputs can contain malicious injections, executable HTML, or remote tracking pixels. The domain function `sanitizeAssistantMarkdown` enforces the following boundaries:

1. **HTML Stripping:**
   - All HTML tags (`<script>`, `<iframe>`, `<a>`, `<div>`, etc.) are stripped using case-insensitive regex parsing.
2. **Link Scheme Neutralization:**
   - Markdown link syntax is validated. Any scheme matching `javascript:`, `vbscript:`, `data:`, or `file:` is replaced with an inert anchor `[text](#)`.
3. **Tracking Image Elimination:**
   - Markdown image syntax is replaced with plain text indicators `[Image: alt]`, preventing remote servers from tracking user reading behavior.
4. **Preserved Formatting:**
   - Markdown headers, bold, italics, bullet/numbered lists, inline code spans, code blocks, and citation markers (`[source:...]`) are fully preserved.

---

## 3. Client Knowledge Sources & Filtering

Users have granular control over which knowledge categories are consulted:

| Source | Opt-in Scope Required | Behavior |
|---|---|---|
| `help` | Public / Standard | Versioned public Daynori Help catalog. Immutable. |
| `notes` | `contentScope.notes` | Personal unencrypted notes in current workspace. |
| `tasks` | `contentScope.tasks` | Personal unencrypted tasks in current workspace. |
| `journal` | `contentScope.journal` | Personal unencrypted journal reflections. |

- If all sources are deselected (`help: false, notes: false, tasks: false, journal: false`), the server fail-closes with `403 AI_SCOPE_EMPTY`.
- Personal content is never consulted if the user has not enabled the corresponding scope in their AI consent profile.
- Vault items (`security_scope = 'vault'`) are unconditionally excluded at the SQL index and query layer.

---

## 4. Citation Verification & Canonical Deep Links

Citations returned by the assistant reference exact item identifiers and revisions. When a user clicks a citation:

1. The client calls `POST /v1/ai/assistant/source-access` to verify that the item still exists, is not deleted, has not been moved to vault, and matches the cited revision.
2. The user is navigated to the canonical application route:
   - **Help Guides:** `/help?article=<articleId>`
   - **Notes:** `/library?noteId=<itemId>`
   - **Tasks:** `/plan?targetId=<itemId>&targetType=task`
   - **Journal Entries:** `/journal?entryId=<itemId>`

---

## 5. History Management

Assistant turns for the current consent generation are persisted in `app.ai_assistant_turns` with 30-day TTL.
Users can manage their history via `DELETE /v1/ai/assistant/history`:

- **Single Turn Deletion:** Passing `turnId` deletes only that specific query and answer.
- **Bulk Clear:** Omitting `turnId` clears all assistant turns for the authenticated user in the current workspace.

---

## 6. Operational Gating & Release Status

Under Architecture Decision Record [ADR 0092](../decisions/0092-text-assistant-chat-and-contextual-guidance.md) and Release Gate `DEF-V2-008`:

- Production AI activation remains **fail-closed** (`isAiLocallyEnabled()` returns `false` in production).
- Live provider calls and transmission of user content remain blocked pending separate explicit owner authorization.
- A synthetic provider package (`artifacts/phase92/synthetic-provider-package.json`) with 5 scenarios capped at $0.05 USD is prepared for staging evaluation upon owner approval.
