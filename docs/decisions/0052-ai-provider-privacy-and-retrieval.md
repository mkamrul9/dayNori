# ADR-0052: AI provider privacy and retrieval foundation (provisional local)

- Status: accepted (provisional local).
- Date: 2026-10-20.
- Related: Phase 55; ADR 0008; [release-gates — AI assistant](../engineering/release-gates.md); [security-and-vault](../architecture/security-and-vault.md).

## Context

Phase 55 needs a real provider candidate, versioned consent, authorized personal-workspace retrieval, budgets, and disable/delete lifecycle — without enabling live private-content transmission, production AI, or Phase 56 organizer tools.

## Primary sources reviewed (2026-10-20)

| Topic | Source | Notes |
|---|---|---|
| Training / data use defaults | [Business data privacy](https://openai.com/business-data/); [Sharing feedback / API opt-in](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai) | API platform: **no training on inputs/outputs by default**; training requires explicit org opt-in. |
| Retention / abuse / ZDR | [Data controls — your data](https://developers.openai.com/api/docs/guides/your-data) | Default abuse-monitoring retention for `/v1/chat/completions` and embeddings: **up to 30 days**. **Zero Data Retention** and Modified Abuse Monitoring are **approval/plan controls**, not inventable defaults. |
| Region / residency | Same data-controls + business pages; owner must confirm contractual residency before claiming EU/US processing guarantees | **Unresolved owner choice** — do not claim regional residency without approved terms. |
| Inference / embedding cost | [Pricing](https://developers.openai.com/api/docs/pricing); [gpt-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) | Provisional model `gpt-4o-mini`: about **$0.15 / $0.60 per 1M** input/output tokens (standard). Embeddings (if used later): `text-embedding-3-small` / `large` per pricing page — this phase uses local FTS chunks, not live embeddings. |
| Rate limits / tiers | [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits); model page RPM/TPM by Build/Launch/Grow | Org/project tier dependent; 429/timeouts expected; app budgets are separate. |

Distinguish: **default API behavior** vs **options requiring approval, a particular plan, or contract**.

## Decision

1. **Provisional candidate:** OpenAI Chat Completions (`gpt-4o-mini`) via server-side `OpenAiCompatibleProvider`. Credentials stay server-side (`OPENAI_API_KEY` / `DAYNORI_OPENAI_API_KEY`). Requests send **`store: false` explicitly**. Rechecked 2026-10-20: `store:false` disables distillation/evals/dashboard storage for that completion; it is **not** Zero Data Retention. Default abuse-monitoring retention (~30 days) and ZDR remain separate approval/plan controls ([your data](https://developers.openai.com/api/docs/guides/your-data); [migrate/store notes](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
2. **Local gate:** `isAiLocallyEnabled` — fail-closed in production; tests on; non-production requires `DAYNORI_AI_LOCAL_ENABLED=true`.
3. **Live calls:** Separately require `DAYNORI_AI_LIVE_ENABLED=true` + credentials. Default provider for local/tests is **FakeAiProvider** (deterministic). Missing credentials → clear **unavailable** without breaking notes/tasks/sync/search/export. Adapter validates response/usage fields, bounds size/timeouts, uses `redirect: 'error'`, and binds `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`.
4. **Consent:** Default-off. Versioned `CURRENT_AI_CONSENT_VERSION` + `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`. Provider config, UGC terms, and ordinary search permission are **not** AI consent. Journal requires distinct `contentScope.journal === true`. Retrieve revalidates consent generation after provider I/O; cancelled/invalidated results are discarded. **Cancellation cannot recall content already transmitted.**
5. **Scope:** Personal workspace notes/tasks only in this phase. Rooms/chat, moderation evidence, vault (including unlocked plaintext), secrets, deleted/quarantined/unauthorized/unsupported sources excluded. Filter eligibility before ranking; revalidate before context and citations. Answer citations must bind to authorized `[source:uuid#rN]` markers (referenced ≠ retrieved context).
6. **Budgets:** Durable per-request reservations (`ai_budget_requests` + `ai_create_reservation` / `ai_settle_request`). Reserve from bounded input + overhead + max output; settle records **actual** usage (may exceed reservation); idempotent settle; accounting commits outside provider network I/O. Budget limits are server-controlled.
7. **Untrusted content:** Document text never authorizes access, consent changes, tools, or mutations. Phase 55 executes **no** organizer mutations and grants **no** model tools. Fake answers are not model-injection resistance evidence — tests prove authorization boundaries.
8. **Lifecycle:** Disable stops new work, bumps consent generation, purges app-controlled indexes, fences pending AI jobs. Note/task/journal create/update/restore enqueue `ai_index_source` with required `consentGeneration`; trash/invalidate clears chunks. Imports enqueue the same path. Account deletion deletes AI rows and fences pending AI jobs. **Deleting local indexes does not recall content already transmitted externally.**

## Unresolved owner choices

- Whether to pursue OpenAI ZDR / Modified Abuse Monitoring approval before any real private-content traffic.
- Region/residency contractual terms.
- Production monthly budget amounts and paid-account provisioning.
- Whether embeddings move off local FTS to a paid embedding model.
- Any future rooms/chat AI scope (requires separate documented authorization).

## Consequences

- Fake-provider tests are **not** live provider or model-quality evidence.
- Status remains **blocked/provisional** until release-gate evidence and owner provider decisions land.
- Stop before Phase 56 assistant UI and confirmed organizer actions.
