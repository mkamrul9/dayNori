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

1. **Provisional candidate:** OpenAI Chat Completions (`gpt-4o-mini`) via server-side `OpenAiCompatibleProvider`. Credentials stay server-side (`OPENAI_API_KEY` / `DAYNORI_OPENAI_API_KEY`).
2. **Local gate:** `isAiLocallyEnabled` — fail-closed in production; tests on; non-production requires `DAYNORI_AI_LOCAL_ENABLED=true`.
3. **Live calls:** Separately require `DAYNORI_AI_LIVE_ENABLED=true` + credentials. Default provider for local/tests is **FakeAiProvider** (deterministic). Missing credentials → clear **unavailable** without breaking notes/tasks/sync/search/export.
4. **Consent:** Default-off. Versioned `CURRENT_AI_CONSENT_VERSION` + `CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`. Provider config, UGC terms, and ordinary search permission are **not** AI consent. Journal requires distinct `contentScope.journal === true`.
5. **Scope:** Personal workspace notes/tasks only in this phase. Rooms/chat, moderation evidence, vault (including unlocked plaintext), secrets, deleted/quarantined/unauthorized/unsupported sources excluded. Filter eligibility before ranking; revalidate before context and citations.
6. **Budgets:** Durable monthly per-user windows with `ai_reserve_tokens` / `ai_settle_tokens` (atomic). Concurrent requests cannot overspend.
7. **Untrusted content:** Document text never authorizes access, consent changes, tools, or mutations. Phase 55 executes **no** organizer mutations and grants **no** model tools.
8. **Lifecycle:** Disable stops new work, bumps consent generation, purges app-controlled indexes. Account deletion deletes AI rows and fences pending AI jobs. **Deleting local indexes does not recall content already transmitted externally.**

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
